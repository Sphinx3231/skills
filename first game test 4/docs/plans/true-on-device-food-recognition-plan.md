# Plan: True on-device food recognition — web only

Ticket: `docs/tickets/011-true-on-device-food-recognition.md`
Spike findings: `docs/outcomes/on-device-clip-feasibility-spike-findings.md`
Mobile (separate, later): `docs/tickets/012-true-on-device-food-recognition-mobile.md`

**Revision note**: this plan originally covered web + mobile in one ticket.
Tech-lead review found 4 blocking issues, most importantly that going
on-device removes the backend's only paywall enforcement point
(`requireActiveAccess` on `/food/analyze`), plus flagged that mobile's
reused-from-web confidence thresholds would be mathematically wrong (raw
cosine similarity isn't on the same scale as `pipeline()`'s softmax
output), that `@huggingface/transformers` as an app dependency drags heavy
native binaries into the mobile build unnecessarily, and that the
mobile spike's worktree has uncommitted changes that would burn a real EAS
build credit on a dev client missing the native module. The user chose to
split the ticket (web here, mobile in ticket 012) and to add a client-side
billing pre-check rather than let photo scan become free. This revision
incorporates the billing fix and narrows everything else to web, where
none of the mobile-specific blocking issues apply.

## Step 0 — Confirm the real bundled-app loading strategy (not the spike's CDN shortcut)

The feasibility spike proved mechanics using a CDN-loaded `<script type="module">`
in a bare HTML file — it did **not** prove `@huggingface/transformers`
works when `npm install`-ed into `app/package.json` and bundled by this
project's real Metro web config.

**Two independent axes, not one — don't conflate them (tech-lead C3)**:
- **Bundle scoping** (does the native bundle avoid pulling this in at all)
  is already solved by the `.web.ts` filename convention (Step 4/C4,
  below) — Metro's native resolver never opens `food-recognition.web.ts`,
  regardless of static import, dynamic import, or `require()`.
- **Install scoping** (does `npm install`/EAS avoid installing
  `@huggingface/transformers`'s native `dependencies` —
  `onnxruntime-node`, `sharp`, both with real postinstall/compile steps —
  at all) is solved **only** by not listing the package in
  `app/package.json` in the first place. A dynamic `import()` of an npm
  dependency still triggers its install on every `npm install`, including
  EAS's mobile dev-client build (ticket 012's territory) — dynamic import
  buys nothing on this axis. `devDependencies` is not an escape hatch
  either; EAS Build installs dev dependencies too.

1. **Decision: load `@huggingface/transformers` via CDN (jsDelivr, per the
   spike), not as an `app/package.json` dependency.** This is the only way
   to actually keep its native binaries out of every install, including
   mobile's, matching the ticket's "mobile completely unaffected" goal.
   Named cost of this choice: there is **no `app/src/app/+html.tsx`** in
   this project today (confirmed absent) — an Expo Router web-shell file
   needs to be created to host the `<script type="module">` tag, and this
   introduces a runtime dependency on jsDelivr's CDN for a feature framed
   as "no server" (an acceptable tradeoff, since model weights already
   stream from the Hugging Face Hub at runtime regardless of loading
   strategy — but state it, don't let it be discovered later).
2. Verify it actually loads and runs inside this project's real
   `npx expo start --web` bundle (via `run-foxbite-web`), not just a bare
   HTML page. Confirm the WASM asset and worker-thread loading the library
   needs actually works when loaded from `+html.tsx` inside Metro's real
   web output.
3. Confirm the quantized `q8` model variant (~153MB, the spike's default)
   is still what loads — don't let a different loading strategy silently
   change which model variant downloads.

## Step 1 — Shared, ported modules (web-only for now, but written platform-agnostically since ticket 012 will reuse them)

- `app/src/lib/food-candidate-labels.ts` — direct port of
  `backend/src/lib/food-candidate-labels.js`'s `CANDIDATE_LABELS`. Add a
  header comment naming the backend file as the source of truth, so the
  two don't silently drift (tech-lead N7) — either file should say where
  the other one is.
- `app/src/lib/food-nutrition-data.ts` — direct port of
  `backend/src/data/food-nutrition-data.js`'s 36-row constant. Its header
  names **`backend/scripts/build-food-nutrition-data.mjs`** as the actual
  source of truth (the generator, not the backend copy) — the backend file
  is itself generated output, so pointing this copy's header at the
  generator (not at the other generated copy) is what keeps a future
  regeneration from updating one file while leaving the other stale.
- `app/src/lib/food-nutrition-lookup.ts` — port of
  `backend/src/lib/food-nutrition-db.js`'s `lookupNutritionByLabel`, as a
  plain `Map` keyed on `label` over the ported data (no SQLite needed
  client-side, confirmed by the spike) — this function itself was missing
  from the original plan and must be included, not just the data
  (tech-lead N6).
- `app/src/lib/food-candidate-labels.test.ts` — port the startup invariant
  from `backend/test/food-candidate-labels.test.js` (every non-anchor
  label has a nutrition row) as an actual test here too — this is what
  keeps `local-food-analysis.js`'s no-nutrition-data branch genuinely
  unreachable; dropping it silently weakens ticket 010's safety guarantee
  (tech-lead N6).
- `app/src/lib/food-recognition-shared.ts` — port of
  `backend/src/lib/local-food-analysis.js`'s anchor-in-top-K detection and
  confidence-from-margin logic, as pure functions over a `{label, score}[]`
  input — **same thresholds as ticket 010** (`HIGH_CONFIDENCE_MARGIN = 0.4`,
  `MEDIUM_CONFIDENCE_MARGIN = 0.15`) are valid here specifically because
  web's `pipeline()` call produces the same softmax-over-all-candidates
  output ticket 010's backend already used to tune them — this is NOT
  true for mobile's raw cosine-similarity output (ticket 012's problem to
  solve separately, not this ticket's).

## Step 2 — `app/src/lib/food-recognition.web.ts`

**No `import()`/`require()` of `@huggingface/transformers` anywhere in the
TS/JS bundle (tech-lead C2).** This project's Jest/Babel setup cannot
intercept a dynamic `import()` for mocking — `log.tsx`'s own test file
documents this exact failure verbatim ("A dynamic import callback was
invoked without `--experimental-vm-modules`"), which is why
`image-prep.ts` deliberately uses a lazy `require()` instead. But a
`require()` can't fetch a CDN URL either — the two prior fixes
(`image-prep.ts`'s lazy `require()`, or a bundler-processed dynamic
`import()`) both assume the package is resolvable by Metro/Jest's module
system, which Step 0's CDN decision deliberately avoids. The actual fix:
the CDN `<script type="module">` (Step 0, loaded from `+html.tsx`) is
**pure HTML, outside Metro/Jest's transform entirely** — it loads the
library and assigns `pipeline` to a `window` global once ready. This
module then just reads that global — no import statement of the library
at all, so there's nothing for Jest to fail to intercept, and testing it
means mocking the global directly (a plain object assignment), not
mocking a module.

```ts
// +html.tsx's <script type="module"> sets:
//   window.__foxbiteClipPipeline = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', { progress_callback });
// once loaded. This module only ever reads that global.
import { CANDIDATE_LABELS } from './food-candidate-labels';

declare global {
  interface Window { __foxbiteClipPipeline?: any; __foxbiteClipPipelineReady?: Promise<any>; }
}

async function getClassifier() {
  if (!window.__foxbiteClipPipelineReady) {
    throw new Error('CLIP pipeline was not initialized by +html.tsx — check the script tag loaded');
  }
  return window.__foxbiteClipPipelineReady;
}

export async function classifyFoodPhoto(imageUri: string) {
  const classifier = await getClassifier();
  // Confirm imageUri's real shape from prepareImageForUpload's web output
  // (a blob/object URL, not the Buffer ticket 010's backend used) against
  // the library's actual accepted input types before assuming this works.
  const results = await classifier(imageUri, CANDIDATE_LABELS.map((l) => l.prompt), {
    hypothesis_template: '{}', // required — same gotcha ticket 010's backend found
  });
  return results;
}
```

- Confirm the exact `imageUri` shape `prepareImageForUpload` (ticket 009)
  produces on web, and what `@huggingface/transformers`'s pipeline actually
  accepts for a browser `Blob`/object URL — don't assume parity with
  ticket 010's Node.js `Buffer` input just because both call the same
  library.
- Wire `progress_callback` (set up inside `+html.tsx`'s script, confirmed
  to exist and report byte totals per the spike) into a real
  loading-progress UI state for the ~15s+ first cold load, exposed via
  another `window` global or a custom event — a bare unlabeled spinner for
  that long reads as broken (tech-lead N11).
- Testing: `food-recognition.web.test.ts` mocks `window.__foxbiteClipPipelineReady`
  directly (a resolved promise wrapping a fake classifier function) — no
  module mocking needed, sidestepping the Jest dynamic-import limitation
  entirely rather than working around it.

## Step 3 — Client-side billing pre-check

`app/src/lib/api.ts:151-153` already has `getBillingStatus()`, returning
`BillingStatus` (`status: 'trialing' | 'active' | 'expired'`) — the exact
type `TrialEndedPaywall` (`log.tsx:638`) already accepts, and the exact
call `companion.tsx` already makes. State this as fact, not a maybe — no
new wrapper needed.

In the web recognition path, before calling `classifyFoodPhoto`:
`const billing = await api.getBillingStatus(); if (billing.status === 'expired') { setPaywallBilling(billing); return; }` —
**`status === 'expired'` specifically, matching `requireActiveAccess`'s own
check (`backend/src/routes/food.js:102`) exactly**, not a `daysLeft`
computation that could diverge for active subscribers. Run this check on
every scan attempt, not once per screen load — a trial that expires
mid-session must not let the rest of that session scan free.

**Failure behavior (tech-lead C1): fail closed.** If `getBillingStatus()`
itself throws (network down, backend unreachable), do not fall through to
running local inference — block the scan with an honest, network-specific
message ("Couldn't check your subscription — try again when you're back
online"), not the generic "Could not reach the server" string. This is
deliberately the same trade a fully-offline app would face for **any**
gated feature; it's also consistent with the fact that saving the result
(`confirmSave()` → `api.createLog`) already requires network regardless,
so "the scan itself works offline" was never really achievable end-to-end.
Fail-open would make "the network is down" an accidental one-step paywall
bypass — not acceptable.

State plainly in the outcome doc that this check is client-side and
technically bypassable by a modified client, same honesty standard as any
other client-only gate.

## Step 4 — Wire into `log.tsx` — no `Platform.OS` branch (tech-lead C4)

**Follow this project's existing `settings-db.ts`/`settings-db.web.ts`
precedent, not an inline `Platform.OS` check.** Two files, same exported
function signature:

- `app/src/lib/food-recognition.ts` (native/default — resolved by Metro on
  iOS/Android) — a thin wrapper wrapping today's `api.analyzePhoto()` call
  unchanged. Mobile's behavior is provably untouched by construction (no
  new branch to audit), not just by inspection.
- `app/src/lib/food-recognition.web.ts` (Step 2, resolved by Metro on web)
  — runs Step 3's billing check, then Step 2's local CLIP classification.

`log.tsx`'s `pickAndAnalyze()` imports `classifyFoodPhoto` from
`./food-recognition` (no `.web` suffix in the import — Metro's platform
resolution picks the right file per build target) and calls it exactly
where `api.analyzePhoto()` was called before. **Zero `Platform.OS` checks
anywhere in `log.tsx` itself.** This also means ticket 012 later swaps in
a real mobile implementation by replacing `food-recognition.ts`'s
contents alone — zero `log.tsx` churn.

**Everything from `setResult(...)` onward is unchanged for both
platforms** — the review screen, `confirmSave()`, ticket 010's four
targeted deltas (blank-name guard, raw-response ref, etc.) — matching the
scope discipline ticket 010 was held to. The one addition in scope: the
web module's own billing pre-check happens inside `food-recognition.web.ts`
before it would ever call back into `log.tsx`'s success path, so
`setResult` itself needs no new branch — only the **error path** changes,
and only on web (tech-lead N10): the local-inference failure needs its own
honest error message, not the existing "Could not reach the server"
string, which would be actively misleading for a call that never touched
a server. **The existing `err.status === 402` branch (`log.tsx:105-110`)
stays as-is** — it remains live for mobile's photo path, and for
`analyzeText`/`lookupBarcode` on both platforms, none of which this ticket
touches. Do not remove it while editing this area.

Also correct, per ticket 011's scope item 5: `app/src/lib/image-prep.ts`'s
HEIC-backend-rejection comment and `MAX_DIMENSION`'s upload-size rationale,
both of which assumed every photo goes to the backend — no longer true for
web after this ticket (mobile still goes through the backend, so
`image-prep.ts`'s logic itself doesn't change, only stale comments do).

## Step 5 — Tests

**Real gotcha (tech-lead N5)**: this project's `jest-expo` preset does
**not** resolve `.web.ts` files automatically (`haste.platforms` excludes
`web`, `defaultPlatform: 'ios'`) — confirmed by checking existing
`.web.ts`/`.web.tsx` files in this codebase (`settings-db.web.ts`,
`animated-icon.web.tsx`, `app-tabs.web.tsx`), none of which have their web
variant exercised by the current test suite (`collectCoverageFrom`
explicitly excludes them). Do not assume Jest will pick up
`food-recognition.web.ts` by platform resolution — import it by its
**explicit file path** in its test file instead. Don't introduce a
multi-project Jest config for this ticket.

- `food-recognition-shared.test.ts`: port ticket 010's
  `local-food-analysis.test.js` cases (anchor-in-top-K, confidence-from-
  margin, foodName-only-from-table) — same thresholds, same test
  scenarios, direct port.
- `food-candidate-labels.test.ts`: the nutrition-row invariant (Step 1).
- `food-recognition.web.test.ts`: mock `@huggingface/transformers` the same
  way ticket 010's backend tests did; explicit-path import per the Jest
  gotcha above.
- Extend `log.test.tsx` for: the web-path billing pre-check (blocks the
  scan and shows the paywall when expired, verified with a mocked expired
  billing response), and the corrected local-inference error message. Do
  NOT touch the existing review-screen tests ticket 010 already
  added/verified — same scope discipline as before.

## Step 6 — Live verification via `run-foxbite-web`

Drive a real photo scan through Playwright: confirm the model actually
loads and classifies inside the real bundled web app (not a bare CDN
page — this is the one thing the spike didn't prove), confirm an expired
test account is blocked before any local inference runs (screenshot the
paywall), confirm a non-expired account's scan reaches the review screen
with a real classification result, and confirm the loading-progress UI
(Step 2) renders during the cold model load rather than a bare spinner.
Report the real measured cold-start time and download size from this
bundled-app run, not just the spike's bare-page numbers.

## Verification

- `npx jest` from `app/` — full pass, including new/ported test modules,
  explicit-path-imported per Step 5's note.
- Step 6's live verification recorded with actual evidence (screenshots,
  Playwright output, real timing numbers), not asserted.
- Outcome doc restates ticket 010's non-food-confidently-wrong and
  unlisted-food residual risks unchanged, and states plainly this ticket
  only changes where web's model executes — mobile is explicitly
  unaffected and tracked separately in ticket 012.
