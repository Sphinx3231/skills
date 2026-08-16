# Plan: Free server-side food recognition (CLIP zero-shot) behind the existing confirm-before-log screen

Ticket: `docs/tickets/010-on-device-food-recognition.md`

**This plan replaces the Food-101/Swin plan entirely**, and corrects a
factual error in this ticket's own previous draft (attempt 3, first cut):
that draft claimed FoxBite had no confirm-before-log step and needed one
built from scratch. **That's wrong — `log.tsx` already has a mandatory
`review` step wired between analysis and logging**, and the Opus tech-lead
caught this by reading the actual code. This plan is corrected to match
reality: mostly a backend model swap (as attempt 2 correctly scoped),
plus a small, specific set of client deltas the existing screen needs to
handle a model whose failure mode is "confidently wrong," not "sometimes
low-confidence."

## What already exists (read directly from `app/src/app/(tabs)/log.tsx`, not assumed)

- `Step` type already includes `'review'` (`log.tsx:37`).
- `pickAndAnalyze()` and the voice/text paths already go
  `analyzing → api.analyzePhoto(...) → setResult(analysis) → setStep('review')`
  (`:89-92` and similarly at `:110-115`, `:215-220`) — **nothing writes to the
  log on a successful analysis.**
- The review card (`:441-506`) already renders: a low-confidence banner
  gated on `result.confidence === 'low'` (`:443-447`), the `caveat` banner
  (`:448-452`), and **editable** `TextInput`/`NumberField`s for
  `foodName`/`calories`/`proteinG`/`carbsG`/`fatG` (`:453-483`) bound to
  local `result` state via `onChangeText`/`onChange`.
- `confirmSave()` (`:240-256`) is the **only** place that calls
  `api.createLog(...)`, using the current (possibly user-edited) `result`
  state — never the raw model output directly.
- A **Discard** action returns to `idle` without calling `createLog` at all.
- `backend/src/routes/food.js:107-123`'s `POST /food/analyze` performs
  **zero writes** — confirmed by reading the route. `bumpStreak()` and
  wardrobe-unlock derivation only happen from `POST /food/logs`
  (`food.js:236`, `companion.js:20-28`), which only `confirmSave()` calls.
  So there is no path today where an unconfirmed model suggestion has any
  side effect. This is exactly the property the ticket wants — it's already
  true, not something this ticket needs to build.

**Consequence**: this ticket does NOT add a confirm screen. It swaps the
model behind `POST /food/analyze` and makes 4 small, specific edits to the
existing review flow so it correctly handles a model that can be
confidently wrong (not just uncertain) — detailed in Step 4 below. Treat
any temptation to redesign `log.tsx`'s review UI as scope creep; the 852
lines of existing tests in `app/src/app/(tabs)/__tests__/log.test.tsx`
already cover this screen's baseline behavior and should not need a
rewrite, only targeted additions (Step 5).

## Design summary

`POST /food/analyze` keeps its route signature, `requireActiveAccess` gate,
multer config, and mimetype validation. Only the function it calls changes:
`analyzeFoodPhoto` (Claude vision) is replaced by a new local module using
CLIP zero-shot classification (`Xenova/clip-vit-base-patch32`, chosen over
the dropped Food-101/Swin classifier per
`docs/outcomes/clip-zero-shot-spike-findings.md`: 91.7% vs 67% in-vocabulary
accuracy in that spike's own test set — see the Honesty section below for
exactly what that comparison does and doesn't prove). `POST
/food/analyze-text` is untouched, stays on Claude.

**Framing, stated plainly**: neither spiked model can self-certify
correctness (`docs/outcomes/on-device-food-recognition-outcome.md`,
`docs/outcomes/clip-zero-shot-spike-findings.md` — both found confidently-
wrong results with no threshold that separates them from confidently-right
ones). The existing review screen already prevents a wrong guess from
silently corrupting the food log, since nothing saves without the user
tapping Save. What this ticket adds on top of that existing safety net is
making sure the *specific* ways CLIP fails (misreading non-food as food,
sometimes at a “medium”-looking margin) are actually visible to the user
before they tap Save — see Step 4.

**Note on the CLIP spike's own recommendation**: the spike's findings doc
recommended NOT proceeding straight to an implementation plan around this
model + these anchors, and named three unexplored alternatives (anchor
prompt engineering, a larger CLIP variant, a two-stage binary food/non-food
gate). This plan overrides that recommendation on product grounds — the
existing confirm-before-log screen changes the cost of a wrong guess from
"silent data corruption" to "one edit before saving," which the spike
didn't have visibility into when it made that recommendation. This override
is deliberate and is recorded here explicitly, not silently.

## Step 0 — Remaining verification before product code

The two prior spikes already answered the expensive empirical questions
(library compatibility, input construction, latency, memory, in-vocab
accuracy shape). What's left:

1. **Finalize the candidate label set as a single source of truth**, not two
   hand-synced lists. Each entry is a record, not a bare string:
   ```js
   // backend/src/lib/food-candidate-labels.js
   export const CANDIDATE_LABELS = [
     { key: 'waffles', prompt: 'a photo of waffles', isAnchor: false },
     { key: 'grilled_chicken_breast', prompt: 'a photo of grilled chicken breast', isAnchor: false },
     // ... rest of the ~36 food entries from the CLIP spike, reviewed for coverage
     { key: 'not_food', prompt: 'a photo that does not contain any food', isAnchor: true },
     // ... the spike's other 1-2 anchor prompts
   ];
   ```
   `key` is what everything downstream (nutrition lookup, `foodName`
   fallback, tests) uses — the model only ever sees `prompt`. This closes
   B2 from the tech-lead's review: a bare model output like `"a photo of
   waffles"` must never reach `lookupNutritionByLabel` or the confirm
   screen's `foodName` field. `CANDIDATE_LABELS.map(l => l.prompt)` is what
   gets passed to the classifier; matching a result back to its `key` is a
   lookup by `prompt`, done once, in one place (Step 3).
2. **Enforce, don't hope, that every non-anchor label has a nutrition row.**
   At startup (or via a test), assert
   `CANDIDATE_LABELS.filter(l => !l.isAnchor).every(l => nutritionExistsFor(l.key))`.
   This makes Step 3's "no nutrition data" branch a defensive dead path
   instead of a routine fallback that leaks a raw label string.
3. **Confirm the real log-write contract** (already read directly for this
   plan, restated so the build doesn't have to re-derive it):
   `api.createLog({ foodName, calories, proteinG, carbsG, fatG, source,
   aiRawResponse })` → `POST /food/logs` → `food.js:215-234`, which 400s if
   `!foodName || !Number.isFinite(calories)`. `Number.isFinite(0)` is
   `true`, so a 0-calorie, non-empty-name entry IS currently saveable.
   **Decision**: leave this saveable — a genuinely 0-calorie logged item
   (e.g. black coffee) is legitimate, and it's orthogonal to the "couldn't
   identify" case, which is already covered by the blank-`foodName` guard
   (Step 4 item 1) since that path returns `foodName: ''`. No calorie-value
   guard is added by this ticket.
4. **Re-confirm `@huggingface/transformers`'s zero-shot-image-classification
   input/output shape** against the version actually pinned in
   `backend/package.json`/lockfile — the CLIP spike ran in an isolated
   scratchpad install; don't assume version parity without checking.
5. **Relocate the model cache outside `node_modules` and outside the
   OneDrive-synced tree.** The spike found the Hugging Face cache lands at
   `node_modules/@huggingface/transformers/.cache` (~580MB) by default.
   Two problems with that location specifically: (a) `npm ci` wipes
   `node_modules`, so every clean install/deploy re-downloads 578MB and
   re-pays the ~36.5s load spike measured; (b) this repo's working tree is
   under OneDrive sync with spaces in the path, and a large binary cache
   plus native `.node` bindings (`onnxruntime-node`, `sharp`) sitting inside
   a synced folder invites on-demand-sync/EPERM friction. Set `HF_HOME` (or
   the library's documented cache-dir env var) to a path outside both
   `node_modules` and the OneDrive tree — e.g. under the OS-appropriate
   local-app-data directory — and confirm the pipeline actually respects it
   before relying on it.
6. **Confirm the `npm install` script-approval requirement** the spike hit
   (`better-sqlite3`, `onnxruntime-node`, `protobufjs`, `sharp` all needed
   `npm approve-scripts` or equivalent) — note this explicitly in the
   outcome doc so a fresh install doesn't stall confusingly on it.
7. **Go/no-go gate**: this step is a scope/integration check, not a model
   re-evaluation (already decided). If any of items 1-6 surface something
   materially harder than described here, stop and report back before Step 1.

## Step 1 — New nutrition reference table

Same design as attempt 2's plan, keyed on the candidate labels' `key` field
(Step 0 item 1), not the model's literal prompt string:

```sql
CREATE TABLE IF NOT EXISTS food_nutrition_reference (
  label TEXT PRIMARY KEY,           -- matches a CANDIDATE_LABELS[].key, never a raw prompt string
  food_name TEXT NOT NULL,          -- human-readable display name shown to the user
  calories INTEGER NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  serving_description TEXT NOT NULL
);
```

Same seeding discipline as attempt 2 (tech-lead B4 finding, still applies):
generate via a dev-time script (`backend/scripts/build-food-nutrition-data.mjs`)
against a credible source (USDA FoodData Central), check in the OUTPUT as a
small JS/JSON constant, seed idempotently (`INSERT OR IGNORE`) alongside the
existing `db.exec(...)` schema block in `backend/src/db/index.js` — present
at startup with no manual step, including in `DB_PATH=":memory:"` test runs.

Anchor labels (`isAnchor: true`) never get a nutrition-reference row and are
never passed to `lookupNutritionByLabel` at all (filtered in Step 3, before
lookup, not looked up and expected to miss).

## Step 2 — `backend/src/lib/local-food-recognition.js`

Lazy singleton pipeline with an **injection seam** (tech-lead B5 finding —
attempt 2's plan had this via N6 and it must carry forward, not be dropped):

```js
import { CANDIDATE_LABELS } from './food-candidate-labels.js';

let classifierPromise = null;

// `pipelineFactory` defaults to a lazy dynamic import of the real
// transformers pipeline, NOT a static top-level import — a static
// `import { pipeline } from '@huggingface/transformers'` at module scope
// would pull onnxruntime-node's native binding and sharp into ANY test
// process that merely imports this file, regardless of whether the test
// ever calls getClassifier(). The dynamic import inside the default only
// runs when the function is actually invoked, which tests avoid entirely
// by passing their own fake pipelineFactory.
async function defaultPipeline(...args) {
  const { pipeline } = await import('@huggingface/transformers');
  return pipeline(...args);
}

export function getClassifier(pipelineFactory = defaultPipeline) {
  if (!classifierPromise) {
    classifierPromise = pipelineFactory('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
  }
  return classifierPromise;
}

const PROMPTS = CANDIDATE_LABELS.map((l) => l.prompt);

export async function classifyFoodPhoto(buffer, pipelineFactory) {
  const classifier = await getClassifier(pipelineFactory);
  const results = await classifier(/* constructed from buffer — confirm shape per Step 0 item 4 */, PROMPTS);
  return results; // sorted desc by score — confirm against the actual pipeline output, don't assume
}
```

Model weight distribution: Hugging Face Hub download path, pre-warmed at
server boot (unchanged rationale from attempt 2: this project's client
`request()` wrapper has no timeout/`AbortController`, per `api.ts` — an
unwarmed first request would hang for the user, not fail fast). **State
explicitly in the outcome doc** whether boot `await`s the warm-up before
`app.listen()` or warms concurrently and accepts a slow first live request
— pick one deliberately, don't leave it implicit. Cache location per Step 0
item 5.

## Step 3 — `backend/src/lib/local-food-analysis.js` (orchestrator)

No accept/reject threshold decides whether to return a result — every
classification produces something for the existing review screen. The
threshold only decides the **displayed** `confidence` value.

```js
import { classifyFoodPhoto } from './local-food-recognition.js';
import { lookupNutritionByLabel } from './food-nutrition-db.js';
import { CANDIDATE_LABELS } from './food-candidate-labels.js';

const labelByPrompt = new Map(CANDIDATE_LABELS.map((l) => [l.prompt, l]));
const anchorPrompts = new Set(CANDIDATE_LABELS.filter((l) => l.isAnchor).map((l) => l.prompt));

// Provisional — not yet derived from the CLIP spike's raw score tables.
// Tighten during Step 0/build once real distributions are re-examined
// against these exact prompts; do not treat as final without that check.
const HIGH_CONFIDENCE_MARGIN = 0.4;
const MEDIUM_CONFIDENCE_MARGIN = 0.15;
const TOP_K_ANCHOR_CHECK = 3; // how many top results we scan for an anchor, not just position 0

export async function analyzeFoodPhotoLocally({ buffer }, pipelineFactory) {
  const results = await classifyFoodPhoto(buffer, pipelineFactory);
  const [top, second] = results;

  // B3 fix: an anchor ANYWHERE in the top-K, not just top-1, forces low
  // confidence + a caveat — the tech-lead's flagged case (dog photo: top-1
  // "waffles" 0.564, top-2 the anchor at 0.394, margin 0.170 lands in
  // "medium" under top-1-only logic) must not sail through unflagged.
  const anchorNearTop = results.slice(0, TOP_K_ANCHOR_CHECK).some((r) => anchorPrompts.has(r.label));

  if (!top || anchorPrompts.has(top.label)) {
    return {
      foodName: '', calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
      confidence: 'low',
      notes: '',
      caveat: "Couldn't identify a food in this photo — enter the details yourself, or try a clearer photo.",
    };
  }

  const matched = labelByPrompt.get(top.label);
  const nutrition = matched ? lookupNutritionByLabel(matched.key) : null;
  const margin = second ? top.score - second.score : top.score;
  const baseConfidence = margin >= HIGH_CONFIDENCE_MARGIN ? 'high' : margin >= MEDIUM_CONFIDENCE_MARGIN ? 'medium' : 'low';
  const confidence = anchorNearTop ? 'low' : baseConfidence;

  if (!nutrition) {
    // Defensive path only (Step 0 item 2's startup invariant should make
    // this unreachable for any non-anchor candidate) — never surface the
    // raw model prompt string as a food name.
    return {
      foodName: '', calories: 0, proteinG: 0, carbsG: 0, fatG: 0,
      confidence: 'low',
      notes: '',
      caveat: "Recognized something but don't have nutrition data for it yet — enter the details yourself.",
    };
  }

  return {
    foodName: nutrition.foodName,
    calories: nutrition.calories,
    proteinG: nutrition.proteinG,
    carbsG: nutrition.carbsG,
    fatG: nutrition.fatG,
    confidence,
    notes: 'Suggested automatically from your photo — please review before saving.',
    caveat: anchorNearTop
      ? "This photo may not show a clearly recognizable food — double-check before saving."
      : `Values shown are for one standard serving (${nutrition.servingDescription}) — a database default, not measured from your photo. Check the fields below before saving.`,
  };
}
```

Every path returns HTTP 200 with a reviewable result — never a 502 for
"couldn't identify," since that's a normal, handled outcome now, not an
error. The route's actual model-call-threw case (a genuine exception) still
502s as today.

**Route call site change**: `food.js:114-117` currently builds
`{ base64Image: req.file.buffer.toString("base64"), mediaType }` for
Claude's vision API. `analyzeFoodPhotoLocally({ buffer })` takes the raw
`req.file.buffer` directly — drop the base64 conversion entirely rather
than carrying a needless base64 round-trip into the new path.

`foodName` is **only ever** sourced from `nutrition.foodName` (the
checked-in reference data) or the empty string — never from `top.label` /
`matched.key` directly. This is the fix for the tech-lead's B2 finding; the
underscore-replace hack from the dropped Food-101 design is deleted
entirely (it was a Food-101-labels artifact and is a no-op / not applicable
to CLIP's natural-language prompts).

## Step 4 — Client: targeted deltas to the EXISTING review screen (not a new screen)

Corrected scope, per the tech-lead's B1 finding. `log.tsx`'s `review` step,
`confirmSave()`, and the editable fields already exist and are already
tested (`app/src/app/(tabs)/__tests__/log.test.tsx`). This ticket's client
work is four specific, additive changes:

1. **Blank-`foodName` save guard** (fixes B4): today, tapping Save with an
   empty `foodName` reaches the backend and comes back as a raw `400
   "foodName and calories are required"` string rendered in the review
   card's error area (`log.tsx:500-504`) — an API validation message
   standing in for "we couldn't identify your photo." Add a client-side
   check in `confirmSave()` (or disable the Save button) when `foodName`
   is blank, with a clear human message ("Enter a food name before
   saving," or similar) instead of letting the request round-trip to fail.
2. **Persist the true raw model response, not the edited one** (fixes N2):
   `confirmSave()` currently passes `aiRawResponse: result` (`log.tsx:251`),
   where `result` is the same state object the edit handlers mutate
   (`:456,464,469,474,481`). Under a model whose corrections are the
   highest-value signal for improving the candidate label list later, this
   silently discards the delta between "what the model guessed" and "what
   the user actually confirmed." Capture the original response in a ref (or
   a second, untouched state field) at **all three** places `result` is
   first set — `pickAndAnalyze()` (`:91`), `submitDescription()` (`:113`),
   and `lookupBarcode()` (`:219`), since `confirmSave()` is the shared save
   path for all three scan types, not just photo — and pass THAT ref value
   as `aiRawResponse`, independent of subsequent edits to `result`. Clear
   the ref alongside `result` in `reset()`/`finishLogging()` so a stale
   value from a prior scan can't leak into the next one.
3. **Fix the stale `caveat` doc comment** (carried from attempt 2's
   plan, dropped in the first attempt-3 draft — restored here):
   `app/src/lib/api.ts`'s `caveat` field doc comment (around `:47-52`)
   currently implies it's set only for barcode lookups. Once photo scans
   also set it unconditionally, correct the comment. This is a
   documentation fix within scope, not scope creep — QA should not flag it.
4. **Confirm the low-confidence/caveat banners remain load-bearing, not
   ignorable chrome, once every photo scan carries one** (restored from
   attempt 2's plan, which asked for exactly this and it was dropped in the
   first attempt-3 draft): with Step 3's `anchorNearTop` logic now capable
   of forcing `confidence: 'low'` more often than the dropped Food-101
   design would have, verify in Step 6's live check that the banner still
   reads as meaningful signal rather than something a user learns to
   tap past.

No other change to `log.tsx`'s structure, state machine, or existing tests
is authorized by this ticket. Do not add a new `Step` value, a new screen,
or a new navigation path — the existing `review` step already does the job.

## Step 5 — Tests

**Backend** (`node --test` convention, matching this codebase; note the
existing ordering requirement in `backend/test/food-default-timeout.test.js:15-30`
— `mock.module(...)` must precede the top-level `await import()` of the
module under test):

- `local-food-analysis.test.js`: anchor-in-top-1 → empty-result path,
  anchor-in-top-2/3-but-not-top-1 → forced-low-confidence-with-caveat path
  (the tech-lead's flagged dog-photo case, as a named regression test),
  matched-label-with-nutrition path, matched-label-without-nutrition
  defensive path, confidence-from-margin mapping at the real threshold
  values. Use `local-food-recognition.js`'s injection seam (Step 2) to
  supply a fake `pipelineFactory` — because `defaultPipeline` now does a
  lazy `await import('@huggingface/transformers')` rather than a static
  top-level import (fixed per tech-lead B5 re-review), passing a fake
  factory is sufficient on its own to keep the real ONNX/sharp stack out of
  this test process; no additional `mock.module('@huggingface/transformers', ...)`
  is required, though the ordering rule from
  `food-default-timeout.test.js:15-30` (mock before the top-level `await
  import()` of the module under test) still applies to the existing
  `anthropic.js`/`local-food-analysis.js` mocks in `food.test.js` and
  `food-default-timeout.test.js`.
- `food-candidate-labels.test.js`: assert every non-anchor entry has a
  corresponding `food_nutrition_reference` row (Step 0 item 2's invariant,
  as an actual test, not just a startup check) and assert `key`s are unique.
- `food-nutrition-db.test.js`: lookup hit/miss against the real seeded data.
- Route-level: `requireActiveAccess` still gates correctly; a successful
  local analysis returns 200 with the expected shape; an anchor/no-food
  result ALSO returns 200 (explicit test — this is a behavior change from
  the Claude-vision path's error-based failure mode).
- **Required** (carried from attempt 2's tech-lead B3 finding): both
  `backend/test/food.test.js` and `backend/test/food-default-timeout.test.js`
  need `mock.module("../src/lib/local-food-analysis.js", ...)` added
  alongside their existing `anthropic.js` mock.
- **Coverage strategy for the lazy singleton** (restored — attempt 2's N6,
  dropped in the first attempt-3 draft): the injection seam in Step 2 is
  what makes `local-food-recognition.js` reachable by tests without a real
  model load; confirm this actually closes the coverage gap rather than
  leaving `getClassifier`'s real-pipeline branch permanently uncovered.

**Frontend** (`jest-expo` + RNTL v14, async render/fireEvent — matching
`app/src/app/(tabs)/__tests__/log.test.tsx`'s existing conventions).
**Do not rewrite this suite.** It already covers: review card renders after
analyze, low-confidence banner, editing review fields updates their values,
Discard → `createLog` not called, successful save → `createLog` + navigate,
save failure stays on review. Add only:
- A test asserting an **edited** field value (not the original
  `analyzePhoto()` response value) is what actually reaches the
  `api.createLog(...)` payload on Save — the existing save test at
  `log.test.tsx:355` asserts the unedited `foodName`, so this specific,
  most-load-bearing assertion for a confirm-before-log design is currently
  untested. Add it as a new case rather than modifying the existing one.
- A render test for the empty-`foodName`/all-zero "couldn't identify" case,
  including that the new blank-name Save guard (Step 4 item 1) actually
  prevents the request rather than round-tripping to a 400.
- When asserting on zeroed macro fields, query by field label/testID, not
  `getByDisplayValue('0')` — the review card has four macro fields that
  would all match `'0'` in the empty-result case.

## Step 6 — Live verification via `run-foxbite-web`

Start both servers, drive a real photo scan through Playwright (reusing a
saved Clerk session), confirm: (a) the existing review screen renders with
the CLIP model's suggestion, (b) editing a field before saving persists the
edited value — not the original guess — to the log (cross-check against
Step 4 item 2's raw-response capture separately, since both need
confirming), (c) a photo likely to trigger an anchor/low-confidence result
still reaches a usable review screen with a visibly meaningful caveat/
low-confidence banner (Step 4 item 4) rather than reading as ignorable
chrome, (d) an expired test account still hits the paywall before any of
this. Screenshot and actually read the images, per the `run-foxbite-web`
skill's own instruction — this satisfies "web and mobile both get the
feature identically."

## Non-goals (carried from the ticket)

- `POST /food/analyze-text` — untouched, stays on Claude. Correct the stale
  startup warning in `backend/src/index.js:16-20`, which currently implies
  `/food/analyze` (photo) needs `ANTHROPIC_API_KEY` — after this ticket only
  `/food/analyze-text` does.
- Backend hosting/deployment — pre-existing gap, separate concern.
- Multi-item meal recognition — single-label classifier limitation, stated
  honestly, not solved.
- A new/redesigned confirm screen — doesn't exist as a gap to fill; see
  "What already exists" above.
- Solving CLIP's non-food-confidently-wrong failure at the model layer
  (better anchor prompts, a larger CLIP variant, a two-stage binary gate) —
  the CLIP spike's own findings named these and recommended trying one
  before shipping; this ticket deliberately overrides that recommendation
  in favor of the product-level mitigation (Design summary). Can be
  revisited later as a separate ticket if the confirm-screen mitigation
  proves insufficient in practice.
- Deleting the now-superseded Claude vision code path — leave in place,
  marked superseded, unless the user prefers deletion.

## Sequencing note

Ticket 009 (resize/compress photo before upload) is approved but not yet
merged to `main`. This ticket's branch should be created from `main` AFTER
009 merges, per this project's standing branch-sequencing preference —
not from 009's unmerged branch tip, and not before 009 is committed.

## Honesty requirements for the outcome doc (do not skip)

- State plainly that CLIP's non-food-confidently-wrong failure mode still
  exists at the model layer (per the spike) and is **mitigated**, not
  solved, by the existing confirm screen plus this ticket's Step 4 deltas.
- The "91.7% vs 67%" comparison must be qualified exactly as the spike
  itself qualifies it: the photos were re-sourced by category, not
  confirmed byte-identical to the Food-101 spike's originals, and the
  spike's own n=12 in-vocab sample size caveat should be repeated, not
  dropped.
- Name the untested risk the spike explicitly flagged: an unlisted food (not
  in `CANDIDATE_LABELS`) can still produce a plausible-looking WRONG name
  and WRONG macros, prefilled — the confirm screen only helps if the user
  actually notices the suggestion is wrong, which is a real, named residual
  risk, not a closed gap.
- Record the deliberate override of the CLIP spike's own "don't proceed
  straight to an implementation plan" recommendation, and why (Design
  summary, above) — don't let the outcome doc read as if the spike
  endorsed this exact path.

## Verification

- `node --test --experimental-test-coverage` from `backend/` — full pass,
  coverage floor maintained (~98% lines), including the lazy-singleton
  injection seam's coverage.
- `npx jest` from `app/` — full pass, including the two new targeted test
  additions (frontend coverage floor: ~97% statements / 99% lines / 88%+
  branches).
- Step 6's live verification recorded with actual evidence (screenshots,
  Playwright output) in the outcome doc, not asserted.
