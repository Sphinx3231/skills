# Outcome: True on-device food recognition — web (ticket 011)

Ticket: [docs/tickets/011-true-on-device-food-recognition.md](../tickets/011-true-on-device-food-recognition.md) ·
Plan: [docs/plans/true-on-device-food-recognition-plan.md](../plans/true-on-device-food-recognition-plan.md) ·
Spike: [docs/outcomes/on-device-clip-feasibility-spike-findings.md](on-device-clip-feasibility-spike-findings.md)

## Verdict up front

**Built as planned, on web only.** `pickAndAnalyze()`'s photo-scan path on
web now runs CLIP zero-shot classification entirely in-browser via WASM
(`@huggingface/transformers`, loaded from a jsDelivr CDN `<script
type="module">` in a newly-created `app/src/app/+html.tsx`) — zero call to
`POST /food/analyze` for that path. Mobile is untouched: it still calls the
backend, verified by construction (see "Mobile unchanged" below), not just
by inspection. All 8 of the plan's Steps (0–6) were completed. Live
verification (Step 6) **partially succeeded** — see the dedicated section
below for exactly what was and wasn't observed, and why.

## What was built

1. **`app/src/app/+html.tsx`** (new file — confirmed absent before this
   ticket, per the plan). Hosts the CDN `<script type="module">` that loads
   `@huggingface/transformers@4.2.0` (matching the version pinned in
   `backend/package.json`) and calls `pipeline('zero-shot-image-classification',
   'Xenova/clip-vit-base-patch32')`. Sets three `window` globals:
   `__foxbiteClipPipelineReady` (a Promise resolving to the classifier),
   `__foxbiteClipPipeline` (the resolved classifier, once ready), and
   `__foxbiteClipProgressState` (the latest progress-callback tick — added
   after a real finding during live verification, see below).
2. **`app/src/lib/food-candidate-labels.ts`**, **`food-nutrition-data.ts`**,
   **`food-nutrition-lookup.ts`** — direct ports of the backend's
   candidate-label list, nutrition-reference data, and lookup functions.
   Header comments name the backend hand-authored file
   (`backend/src/lib/food-candidate-labels.js`) and the generator script
   (`backend/scripts/build-food-nutrition-data.mjs`, not the backend's own
   generated copy) as each file's respective source of truth, per the
   ticket's scope item 8.
3. **`app/src/lib/food-recognition-shared.ts`** — pure-function port of
   `backend/src/lib/local-food-analysis.js`'s anchor-in-top-K detection and
   confidence-from-margin logic (same `HIGH_CONFIDENCE_MARGIN = 0.4` /
   `MEDIUM_CONFIDENCE_MARGIN = 0.15` thresholds — valid here because web's
   `pipeline()` call produces the same softmax-over-all-candidates output
   ticket 010 already tuned them against). Written with no `window`/fetch
   dependency specifically so ticket 012 (mobile) can reuse it unmodified if
   it ever produces a comparable `{label, score}[]` array.
4. **`app/src/lib/food-recognition.web.ts`** — reads the CDN-set `window`
   globals (never imports the library itself), runs the client-side billing
   pre-check, then calls the classifier with `hypothesis_template: '{}'`
   (required — same double-wrapping bug ticket 010's backend found and
   fixed applies to this exact library). Exports
   `classifyFoodPhoto(photo)` and `onModelLoadProgress(callback)`.
5. **`app/src/lib/food-recognition.ts`** — native/default twin, a thin
   unconditional passthrough to `api.analyzePhoto()`, plus a permanent
   no-op `onModelLoadProgress()`. Resolved by Metro on iOS/Android, and by
   Jest everywhere (jest-expo does not do platform-extension resolution).
6. **`app/src/app/(tabs)/log.tsx`** — `pickAndAnalyze()` now calls
   `classifyFoodPhoto(prepared)` (imported from `@/lib/food-recognition`,
   no `.web` suffix) instead of `api.analyzePhoto(prepared)` directly. Added
   `modelLoadProgress` state (subscribed via `onModelLoadProgress` in a
   `useEffect`) to show a real "Downloading the food-recognition model…"
   message with a live percentage during the `analyzing` step, instead of
   the bare "Foxxy is sniffing out the details…" text, whenever a
   download is actually in progress. **Zero `Platform.OS` checks added.**
   The existing `err.status === 402` branch (`log.tsx`'s
   `pickAndAnalyze()` catch block) is **completely unchanged** — the web
   billing pre-check reuses it by throwing the identical `ApiError(402,
   ..., { billing })` shape the backend's real 402 already produces, so no
   new branch was needed for that path either. Everything from
   `setResult(...)` onward (the review screen, `confirmSave()`, ticket
   010's four targeted deltas) is untouched.
7. **`app/src/lib/image-prep.ts`** — corrected the stale HEIC-rejection and
   `MAX_DIMENSION` comments per the ticket's scope item 5 (both previously
   assumed every photo goes to the backend, no longer true for web). The
   function's actual logic is unchanged; only the comments and one log
   message were corrected (`image-prep.test.ts` updated to match the
   corrected message).

## Client-side billing pre-check (Step 3)

`food-recognition.web.ts`'s `classifyFoodPhoto()` calls
`api.getBillingStatus()` before touching the classifier, on **every**
scan attempt (not cached from screen load). `status === 'expired'` exactly
(matching `requireActiveAccess`'s own check), not a `daysLeft` computation.
**Fail-closed**: if `getBillingStatus()` itself throws, the function does
NOT fall through to local inference — it throws an honest,
network-specific `ApiError` ("Couldn't check your subscription — try again
when you're back online.") instead. Both the expired-block and the
network-failure messages surface through `log.tsx`'s existing, unmodified
catch logic. **This check is client-side and technically bypassable by a
modified client** — same honesty standard as any other client-only gate,
stated plainly here per the plan's requirement, not hidden.

## A real bug found and fixed during live verification (Step 6)

Live verification (see below) surfaced something the unit tests couldn't
catch: `+html.tsx`'s CDN script starts loading the model **as soon as the
page loads** — independent of sign-in state or the Log tab ever being
mounted. The original design relied purely on a fire-and-forget
`foxbite-clip-progress` `CustomEvent`, which meant a user who navigates to
the Log tab only after the download already finished (a very plausible real
sequence — sign-in alone can easily take longer than the ~15s cold load)
would never see the `'ready'` event, since nothing replays past events to a
late subscriber.

**Fix**: `+html.tsx` now also writes the latest progress detail to
`window.__foxbiteClipProgressState` on every tick.
`food-recognition.web.ts`'s `onModelLoadProgress()` synchronously reads and
replays that state to a new subscriber immediately upon subscription,
before also listening for future events. Covered by a new regression test
(`food-recognition.web.test.ts`, "a late subscriber immediately catches up
to whatever already happened"). This is exactly the kind of gap
`run-foxbite-web`'s own documentation warns mocked test suites cannot
catch on their own — found here by actually booting the real bundle, not
guessed at.

## Live verification (Step 6) — what succeeded, what didn't, and why

**No Clerk test-account credentials (email/password) are reachable without
an interactive OTP-relay session with the user** — this repo's `.env`
files hold only Clerk API keys, not login credentials, and this project
does have a working test account plus an established OTP-relay protocol
(used successfully in tickets 004-006) for when a human is available to
relay a live code. A non-interactive implementer step has no channel to
initiate that relay and pause mid-task waiting on it, so the following is
exactly what could and could not be verified without
sign-in.

**Verified, via a real headless Chromium session (Playwright) against the
actual bundled `npx expo start --web` app, backend running alongside on
`:4000`:**

- The web bundle boots cleanly with the new `+html.tsx` — the sign-in
  screen renders identically before and after this ticket's changes (two
  screenshots taken, compared visually). No Metro bundling error, no
  `pageerror` events, no React warnings attributable to this ticket's
  files.
- `window.__foxbiteClipPipelineReady` is a real `Promise` immediately
  after page load — confirms the CDN script actually executes inside the
  real Metro-bundled web app, not just a bare CDN test page (the one thing
  the feasibility spike explicitly had NOT proven).
- Real network requests were observed to `cdn.jsdelivr.net` (the library
  itself) and `huggingface.co`/`hf.co` (the model files), specifically
  `onnx/model_quantized.onnx` — confirming the **quantized q8 variant**
  loads, not the ~606MB fp32 file the backend downloads (Step 0 item 3).
- **Real measured numbers, from this bundled-app run** (not the spike's
  bare-CDN-page numbers restated):
  - Page `load` event: **+2.26s** from navigation start.
  - Model cold-load (page load to the classifier's `'ready'` state):
    **+14.9s** after page load (**~17.2s** total from navigation start).
    A second, separately-launched headless browser session measured
    **~18.2s** total — each Playwright `chromium.launch()` starts a fresh,
    ephemeral browser profile, so neither run benefited from a warm
    browser-side HTTP cache; both are effectively cold-load numbers, not
    one cold + one warm.
  - **Total download: 153,701,182 bytes (146.6 MB)** — matches the
    spike's ~153.7MB estimate for the quantized combined model.
  - A **real classification call**, run directly against
    `window.__foxbiteClipPipelineReady` inside the live bundled page (a
    64×64 solid-red canvas image, generated in-browser — mechanics-only,
    same intent as ticket 010's own synthetic-image live verification, not
    an accuracy test) returned a well-formed, sorted result:
    `[{score: 0.504, label: "a photo of pizza"}, {score: 0.332, label: "a
    photo that does not contain any food"}, {score: 0.164, label: "a
    photo of sushi"}]` in **722ms** — confirms `hypothesis_template: '{}'`
    works correctly end-to-end inside this app's real bundle (a solid-color
    image scoring closely across labels is expected/uninformative, per
    ticket 010's own precedent — this call exists to prove the pipeline
    executes, not to test accuracy).
- **The backend received zero HTTP requests during the entire
  verification session** (checked directly against the backend's own
  stdout log) — consistent with the sign-in screen being the only page
  reachable without credentials, but also positively confirms nothing in
  this ticket's changes spuriously calls the backend for the photo-scan
  path.

**NOT verified — stated plainly, not glossed over:**

- **No real photo scan was driven through the actual Log tab UI**, because
  there is no way past Clerk sign-in without real credentials. This means
  the acceptance criterion "confirmed via `run-foxbite-web`... with zero
  network call to `/food/analyze`" is verified only at the
  `window`-global/direct-call level (above), not via an actual button-tap
  → camera-picker → review-screen flow.
- **The expired-trial paywall block was not verified against a real
  account** — `assertActiveAccess()`'s logic is unit-tested (mocked
  `getBillingStatus()`, both the expired and network-failure cases) and
  the resulting `ApiError` shape is verified to reach `log.tsx`'s existing
  paywall-rendering code (via the mocked-`classifyFoodPhoto` tests in
  `log.test.tsx`), but no real expired Clerk account exists to drive this
  end-to-end through a live signed-in session.
- **The loading-progress UI text itself was not seen rendering on a real
  screen** — its wiring is unit-tested (`log.test.tsx` does not currently
  assert on the progress text specifically; `food-recognition.web.test.ts`
  verifies the underlying `onModelLoadProgress` translation and replay
  logic directly), but seeing "Downloading the food-recognition model…
  (NN%)" actually paint during a real cold load on the real Log screen
  requires being signed in.
- This is the same class of gap ticket 010's own outcome doc named for
  itself ("no real Clerk-session Playwright run was performed") — repeated
  honestly here rather than asserting a signed-in flow that didn't happen.

## Real test numbers (actual runs)

**Frontend** — `npx jest --coverage` from `app/`:
- **43 suites, 363 tests, 363 pass, 0 fail.**
- Coverage: **98.2% statements / 91.49% branches / 97.91% functions /
  99.26% lines** overall (`--collectCoverageFrom` defaults, i.e. all of
  `src/`). New/changed files specifically:
  - `food-candidate-labels.ts`, `food-nutrition-data.ts`,
    `food-recognition-shared.ts`, `food-recognition.ts`,
    `image-prep.ts`: **100%** across all four metrics.
  - `food-nutrition-lookup.ts`: 85.71%/50%/100%/100% before an added test
    closed the gap — now covers both the found-row and
    no-matching-row-defensive branches directly
    (`food-nutrition-lookup.test.ts`).
  - `food-recognition.web.ts`: 93.75%/77.77%/100%/96.29% — one
    uncovered line, an `else` fallback inside `assertActiveAccess`'s error
    path that isn't reachable from any of the test scenarios exercised
    (a non-`Error` thrown value from `getBillingStatus()`, which nothing
    in this codebase produces).
  - `log.tsx`: 98.52%/86.86%/97.29%/98.96% — 2 uncovered lines (661, 664),
    both pre-existing from ticket 010, not introduced by this ticket.
  - `+html.tsx`: 0% — Jest never executes this file (it's an
    Expo-Router-only static-HTML-shell file, never imported by any
    runtime module or test, structurally identical in this respect to the
    already-excluded `_layout.tsx` files). Its correctness was verified
    live instead (see above), not via unit coverage.
- `npx tsc --noEmit`: same **3 pre-existing errors**
  (`animated-icon.tsx`, `app-tabs.web.tsx`, `components/ui/collapsible.tsx`)
  as ticket 010's own baseline — checked **after** starting the dev server
  once (regenerating `.expo/types/router.d.ts`), per `run-foxbite-web`'s
  own documented gotcha about stale route-type caches. No new errors from
  this ticket's files.

**Backend**: not touched by this ticket — no backend test run was needed
or performed (ticket 011 is web-client-only; `POST /food/analyze` and its
existing 121 backend tests are unchanged).

## Mobile unchanged — how this was verified, not just claimed

`app/src/lib/food-recognition.ts` (the file Metro/Jest resolve for
iOS/Android and for every Jest run) is a two-line unconditional passthrough
to `api.analyzePhoto()` — there is no branch in it that could have
diverged from ticket 010's already-shipped mobile behavior. This was
verified three ways, not just asserted:

1. **A dedicated test** (`food-recognition.test.ts`) asserts
   `classifyFoodPhoto()` calls `api.analyzePhoto()` with the exact photo
   argument and returns/propagates its result/rejection unchanged,
   including the 402 paywall shape. 100% coverage on this file.
2. **Every pre-existing `log.test.tsx` test that exercises the photo-scan
   path is unchanged and still passes** (all pre-existing photo-scan and
   paywall cases, plus 2 new ones for the web error paths) — though note
   this file now mocks `@/lib/food-recognition` directly (added in this
   ticket's diff) rather than exercising the real native file, so this
   point verifies the *call contract* (mock forwards to the
   already-mocked `api.analyzePhoto`, same assertions as before) didn't
   change, not that the real native file executed inside these particular
   tests — that's what point 1's dedicated, unmocked test covers instead.
3. **No `Platform.OS` check was added to `log.tsx` for this feature**
   (grep-verified — the file's only `Platform.OS` checks are the
   pre-existing, untouched checkout-redirect branches inside
   `TrialEndedPaywall`'s `subscribe()`, unrelated to photo-scan
   recognition). The only way web's photo-scan behavior differs from
   mobile's is Metro's filename-based platform resolution picking
   `food-recognition.web.ts` over `food-recognition.ts`, the exact same
   mechanism this codebase's pre-existing
   `settings-db.ts`/`settings-db.web.ts` pair already relies on.

## Named residual risks (restated from ticket 010, unchanged)

These are unchanged from ticket 010's outcome doc — this ticket only
changes **where** web's model executes (in-browser vs. on the backend),
not the model itself, its candidate label set, or its scoring logic:

1. **CLIP's non-food-confidently-wrong failure mode still exists at the
   model layer.** The anchor-in-top-K logic (ported unchanged in
   `food-recognition-shared.ts`) catches the case where a reject anchor
   lands in the top 3 results; it does not fix the case where a wrong food
   label wins outright with no anchor nearby at all. The confirm screen —
   untouched by this ticket — is what actually protects the user against
   that remaining gap, not anything built here.
2. **An unlisted food not in `CANDIDATE_LABELS` can still produce a
   plausible-looking WRONG name and WRONG macros, prefilled.** The
   36-food candidate list is finite and developer-maintained; a real food
   outside it will always score against the closest listed label. This is
   a standing risk of the whole design, unaffected by where the model
   runs.
3. Nutrition-reference data is still not a live USDA API pull — same
   manually-set, one-standard-serving estimates ticket 010 shipped,
   ported unchanged.

## Non-goals confirmed unchanged

- Mobile — untouched, still calls the backend, tracked separately in
  ticket 012 (not started).
- iOS-specific work — not applicable, web-only ticket.
- The CLIP-zero-shot-plus-confirm-screen product approach — not
  re-decided.
- `POST /food/analyze` and its backend code — not touched, still live for
  mobile.
- The review screen's structure (`setResult`/`setStep('review')` onward in
  `log.tsx`) — no changes.
