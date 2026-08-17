# Outcome: Multi-item food recognition via Claude vision

Ticket: [docs/tickets/014-multi-item-claude-vision-food-recognition.md](../tickets/014-multi-item-claude-vision-food-recognition.md)

No separate plan document was authored for this ticket — the ticket itself
already specified scope, non-goals, and acceptance criteria at plan-document
detail, per the task's own framing.

## What changed

`POST /food/analyze` now identifies **each distinct food item separately**
instead of merging everything into one entry, reviving ticket 010's
"superseded" Claude vision function (`analyzeFoodPhoto`, renamed
`analyzeFoodPhotoMultiItem`) and pointing the route at it instead of ticket
011's local CLIP pipeline (`analyzeFoodPhotoLocally`, left completely
untouched — still in the codebase, still passing its own tests, just not
called from this route anymore). This reintroduces a per-scan Claude API
cost, accepted per the ticket's background since `/food/analyze` is already
gated behind `requireActiveAccess` (trial/subscription).

### New request/response contract

**Request**: unchanged — `multipart/form-data` with a `photo` file field
(jpeg/png/webp, 8MB limit).

**Response** (was a single flat `FoodAnalysis` object; now):

```json
{
  "items": [
    {
      "foodName": "Grilled chicken",
      "portionDescription": "a medium fillet, ~150g",
      "calories": 260,
      "proteinG": 40,
      "carbsG": 0,
      "fatG": 10,
      "confidence": "high",
      "notes": ""
    },
    {
      "foodName": "Steamed rice",
      "portionDescription": "about 1 cup",
      "calories": 205,
      "proteinG": 4,
      "carbsG": 45,
      "fatG": 0,
      "confidence": "medium",
      "notes": ""
    }
  ]
}
```

- `items` is `[]` (not a single `"Unknown"` item) when no food is
  identifiable — matches the ticket's "your call" note; empty array was
  chosen since it lets the client render "couldn't identify anything" text
  with no editable-but-meaningless zeroed fields, which is what the old
  single-item `"Unknown"`/low-confidence contract used to force.
- Each item is independent — its own `portionDescription` (a natural-
  language visual estimate, explicitly not a precise measurement — no depth/
  reference-object data is available, same ceiling `analyzeFoodText` already
  has), `calories`/macros, `confidence`, and `notes`.
- `analyzeFoodText`'s contract (single merged item) is completely unchanged —
  out of scope per the ticket.

### Backend (`backend/`)

- `src/lib/anthropic.js`:
  - `analyzeFoodPhoto` → renamed `analyzeFoodPhotoMultiItem` (contract
    changed, so the ticket 010 name became misleading). The "SUPERSEDED"
    comment is gone, replaced with a note explaining the revival and the
    accepted per-scan cost.
  - New prompt (`FOOD_ANALYSIS_MULTI_ITEM_PROMPT`) explicitly instructs the
    model to list each item **separately** ("do NOT combine multiple items
    into one entry"), to give each item its own natural-language portion
    estimate framed as a visual estimate not a measurement, and to return
    `{"items": []}` when no food is identifiable at all.
  - `max_tokens` raised 1024 → 2048 to give a multi-item JSON response room
    to breathe (a 3-4 item plate's response is meaningfully longer than one
    merged entry).
  - `analyzeFoodText` untouched.
- `src/routes/food.js`:
  - `POST /food/analyze` now calls `analyzeFoodPhotoMultiItem({ base64Image,
    mediaType })` — converts `req.file.buffer` to base64 itself (the Claude
    vision API needs base64; the local CLIP pipeline this replaced took the
    raw multer buffer directly, so this conversion step is new here).
  - Removed the `analyzeFoodPhotoLocally`/`local-food-analysis.js` import
    from this file entirely — that module, and its own test file
    (`backend/test/local-food-analysis.test.js`), are completely untouched.
  - Error handling unchanged in shape: no text block from the model → 502
    `{ error: "Could not analyze photo, try again" }`.

### Frontend (`app/`)

- `src/lib/api.ts`: added `FoodAnalysisItem` (the new per-item shape, with
  `portionDescription` and an optional `caveat` — see decision below) and
  `PhotoAnalysis = { items: FoodAnalysisItem[] }`. `analyzePhoto()`'s return
  type changed from `FoodAnalysis` to `PhotoAnalysis`. `analyzeText()` and
  `lookupBarcode()` are untouched (still return the original single-item
  `FoodAnalysis`).
- `src/lib/food-recognition.ts` (native, thin passthrough): return type
  updated to `Promise<api.PhotoAnalysis>` — no logic change, still a direct
  forward to `api.analyzePhoto`.
- `src/lib/food-recognition.web.ts` (ticket 011's local CLIP pipeline, web
  only): the CLIP scoring/decision logic in `food-recognition-shared.ts` is
  **completely untouched** — this file only wraps that single classification
  result into the new `{ items: [...] }` shape via a new `toPhotoAnalysis()`
  helper, so the shared Log screen review UI has one consistent contract
  across native (Claude, potentially N items) and web (CLIP, always 0 or 1
  item). An empty-foodName ("couldn't identify") result now wraps to `{
  items: [] }` instead of one empty-named item, matching the new backend
  convention. `portionDescription` is left as `''` for web (CLIP has no
  portion estimate of its own — its nutrition rows are one-standard-serving
  database defaults, already surfaced via `caveat`).
- `src/app/(tabs)/log.tsx` — the confirm-before-log screen:
  - New `Step` value `'review-items'`, kept **additive** alongside the
    existing `'review'` step rather than replacing it: voice (`analyzeText`)
    and barcode (`lookupBarcode`) still use the original single-item
    `result`/`confirmSave()` path, completely unchanged. Only the photo-scan
    path (`pickAndAnalyze` → `classifyFoodPhoto`) now populates a new
    `items` array and shows `'review-items'`.
  - New `ReviewItem` type (`api.FoodAnalysisItem & { key: string; raw:
    api.FoodAnalysisItem }`) — `key` is a stable per-item identity surviving
    edits/removal; `raw` is that item's untouched original model response,
    captured once at scan time, so editing a field never mutates what gets
    stored as that row's `food_logs.ai_raw_response` (same rule ticket 010
    established for the single-item flow's `rawResultRef`).
  - New `'review-items'` UI: one card per item (Food/Portion/Calories/
    Protein/Carbs/Fat fields, all independently editable via `updateItem`),
    a remove button per item (`removeItem`), a low-confidence/caveat banner
    per item, and a "Save to today" (1 item) / "Save all N" (>1 item) button
    (`confirmSaveItems`) that **loops over `api.createLog` once per
    confirmed item** — no new batch endpoint, per the ticket's stated
    preference. A zero-items result (nothing identifiable) shows a clear
    message with no editable fields and only a Discard button.
  - `finishLogging()`/`reset()` now also clear `items`.

## Design decisions worth flagging for review

1. **Additive `'review-items'` step, not a rewrite of `'review'`.** Rather
   than unifying voice/barcode/photo onto one always-array-based review UI,
   the single-item `result`/`confirmSave()` path for voice and barcode is
   left completely untouched, and a parallel `items`/`confirmSaveItems()`
   path was added only for photo scans. This kept the blast radius of the
   change contained to the actual scope (`analyzeFoodPhoto`'s contract) and
   meant zero voice/barcode test changes were needed for their *behavior* —
   though two of their existing branches (the blank-foodName guard and the
   save-failure catch in `confirmSave()`) had lost their only test coverage
   once the old "couldn't identify" and "save failure" tests moved to the
   new items-based flow; two new voice/barcode-specific tests were added to
   restore that coverage (see Test Results).
2. **`FoodAnalysisItem.caveat` is optional and Claude-vision-silent.** The
   ticket's contract for `analyzeFoodPhotoMultiItem` doesn't include
   `caveat` (that's an Open-Food-Facts/local-CLIP-specific concept — "this
   is a database default, not measured from your photo"). It was added as
   an *optional* field on the shared client type anyway, purely so
   `food-recognition.web.ts`'s wrapper (which does produce a caveat) can
   still surface it through the same item shape without a second, near-
   identical type. The backend never sets it.
3. **No partial-failure rollback in `confirmSaveItems()`, and a distinct
   retry-duplication risk that follows from it.** If `createLog` fails
   partway through a multi-item save loop, whichever items already succeeded
   remain saved as real `food_logs` rows — there's no transactional rollback
   across the loop. This alone is a known, accepted limitation, consistent
   with the ticket's explicit preference for "reuse the existing single-item
   log-save call in a loop" over a new batch endpoint with real atomicity.
   But it also creates a second, user-facing consequence that is not merely
   theoretical: `confirmSaveItems()`'s catch block sets an error message and
   returns the user to the `'review-items'` step with the **full, unpruned
   `items` array still intact** — including the items that already saved
   successfully before the failure. If the user then retaps "Save all N",
   the loop re-runs `api.createLog` for every item again, including the ones
   already written to `food_logs` on the first attempt, silently double-
   counting that day's calories/macros for those items. This is a real,
   reachable duplication bug on user retry, not just an orphaned-write
   concern — tracked as follow-up ticket
   [015](../tickets/015-fix-multi-item-save-retry-duplication.md).
4. **`max_tokens` raised 1024 → 2048.** Not explicitly asked for by the
   ticket, but a multi-item JSON response for a busy plate (3-4+ items) is
   materially longer than one merged entry; kept the model from truncating
   mid-response.

## Test results

All numbers are from real runs in this environment, not estimated.

**Backend** (`node --test --experimental-test-module-mocks
--experimental-test-coverage`):
- **124/124 tests passing, 0 failed.**
- Coverage (all files): **99.24% lines / 97.29% branches / 97.96%
  functions.** `food.js` alone: 98.17% lines / 96.59% branches (one
  pre-existing uncovered branch, `bumpStreak`'s "no companion_state row"
  insert path — unrelated to this ticket). `anthropic.js`: 100%/100%/100%.
- Red-before/green-after proof: initial rewrite of `backend/test/food.test.js`
  and `backend/test/anthropic.test.js` to the new contract surfaced two real
  regressions before they were fixed —
  1. `anthropic.test.js`'s `analyzeFoodText returns the parsed JSON from the
     model` test failed (`undefined` vs `'Bowl of oatmeal'`) because the fake
     Anthropic client's single canned response had been overwritten with the
     new `{ items: [...] }` shape shared between both functions' tests —
     fixed by splitting the fake client's response into
     `nextTextResponseText`/`nextPhotoResponseText`, selected by whether the
     request included an image content block (mirrors how the real code
     actually distinguishes the two calls).
  2. `backend/test/food-default-timeout.test.js` failed entirely (module
     load error) because its `mock.module("../src/lib/anthropic.js", ...)`
     still only exported the old `analyzeFoodPhoto` name, which
     `food.js`'s now-renamed import (`analyzeFoodPhotoMultiItem`) couldn't
     resolve — fixed by updating the mock's export name and dropping its
     now-unused `local-food-analysis.js` mock.
  - After both fixes: 124/124 passing (was 122/124 red immediately after the
    contract rewrite, before these two fixes).
- New coverage specifically for the ticket's acceptance criteria: a
  multi-item photo returns 2 separate items each with their own
  `portionDescription`/calories/confidence (`food.test.js`, `anthropic.test.js`);
  an empty-items response for a no-food photo returns `200` with `items: []`
  (not a fabricated guess, not an error status).

**Frontend** (`npx jest --coverage` / `npm run test:coverage`):
- **378/378 tests passing, 0 failed, 44 suites.**
- Coverage (all files): **97.94% statements / 90.89% branches / 96.51%
  functions / 98.93% lines.**
- `app/src/app/(tabs)/log.tsx` (the most heavily touched file): **98.29%
  stmts / 84.93% branch / 98.14% funcs / 99.07% lines.** The only remaining
  uncovered lines (831, 834) are `TrialEndedPaywall`'s native
  `await import('expo-web-browser')` branch — pre-existing, already
  documented elsewhere in this codebase's test comments as untestable under
  Jest without `--experimental-vm-modules`, untouched by this ticket.
- Red-before/green-after proof: rewriting `log.test.tsx`'s photo-scan
  describe block to the new `{ items: [...] }` contract initially left two
  real branches uncovered that a coverage-only pass caught —
  `confirmSave()`'s blank-foodName guard and its save-failure catch (used
  only by voice/barcode now that photo scans moved to `confirmSaveItems()`),
  and the item-level Portion field's `onChangeText` handler in the new
  `'review-items'` UI. Closed by adding: "clearing the food name on a
  barcode result blocks saving", "a save failure on a barcode result shows
  an error and stays on the review card" (Barcode Hunt describe block),
  "editing a voice-sourced review field's macro numbers updates their
  values" (Voice Input describe block), and a portion-field edit assertion
  inside the existing multi-item card test.
- New tests specifically for the ticket's acceptance criteria (all in
  `log.test.tsx`'s "analyze + review flow" describe block): a multi-item
  photo shows a separate, independently editable card per item; removing an
  item excludes it from what gets saved and its `createLog` call; saving a
  multi-item scan calls `createLog` once per confirmed item (asserted via
  `toHaveBeenNthCalledWith`); a photo with no identifiable food shows a
  clear message with no editable fields and no Save button; clearing an
  item's food name blocks saving with a clear per-item message.
- `food-recognition.test.ts` (native) and `food-recognition.web.test.ts`
  (web CLIP wrapper) updated to the new `PhotoAnalysis` shape; two new web
  tests added specifically for the wrapping behavior (single classification
  → one-item array with its caveat carried through; empty-foodName
  classification → zero items, not one empty-named item).

**`npx tsc --noEmit`**: **3 errors**, identical to this project's documented
pre-existing baseline (`animated-icon.tsx`, `app-tabs.web.tsx`,
`collapsible.tsx` — all unrelated to any file touched here). No new errors.

## Deferred / could not verify from this environment

- **No live Claude API call was made.** This sandboxed environment cannot
  reach the real Anthropic API. All backend verification uses
  `mock.module("@anthropic-ai/sdk", ...)` (a fake client asserting on the
  actual `messages.create` call args, same pattern the existing
  `anthropic.test.js` already used) and `mock.module("../src/lib/anthropic.js",
  ...)` at the route level (`food.test.js`) — substituted per the task's own
  instruction, not silently assumed green. The acceptance criterion "a photo
  of a real multi-item plate returns multiple separate items" is therefore
  verified against the **prompt and response-parsing contract**, not against
  a real model's actual visual judgment on a real photo — that remains an
  unverified, real-device/real-API step for whoever can run it.
- **No live device/Expo run.** Per the same environment constraint prior
  outcomes in this repo have documented (e.g. `voice-barcode-outcome.md`),
  this session ran the automated test suites only — not `expo start` against
  a real device to visually confirm the new multi-item review cards render
  correctly, or that a real photo scan round-trips through a real backend.

## Files changed

- `backend/src/lib/anthropic.js` — renamed `analyzeFoodPhoto` →
  `analyzeFoodPhotoMultiItem`; new multi-item prompt; `max_tokens` 1024 →
  2048.
- `backend/src/routes/food.js` — `POST /food/analyze` now calls
  `analyzeFoodPhotoMultiItem` (base64-encoding the multer buffer itself)
  instead of `analyzeFoodPhotoLocally`; dropped the now-unused
  `local-food-analysis.js` import.
- `backend/test/anthropic.test.js` — rewritten for the new `{ items: [...] }`
  contract; separate canned responses for text vs. photo calls; new tests
  for the "list separately" prompt wording, multi-item parsing, and the
  empty-items no-food case.
- `backend/test/food.test.js` — `/food/analyze` mock and its three tests
  rewritten for the items-array contract; removed the now-unused
  `local-food-analysis.js` mock from this file (route no longer calls it).
- `backend/test/food-default-timeout.test.js` — updated its `anthropic.js`
  mock to the renamed export; dropped its unused `local-food-analysis.js`
  mock.
- `app/src/lib/api.ts` — added `FoodAnalysisItem`/`PhotoAnalysis`;
  `analyzePhoto()`'s return type changed accordingly.
- `app/src/lib/food-recognition.ts` — return type updated to
  `Promise<api.PhotoAnalysis>` (no logic change).
- `app/src/lib/food-recognition.web.ts` — new `toPhotoAnalysis()` wrapper;
  CLIP scoring logic itself untouched.
- `app/src/app/(tabs)/log.tsx` — new `'review-items'` step, `ReviewItem`
  type, `updateItem`/`removeItem`/`confirmSaveItems`, multi-item review UI;
  existing single-item `'review'`/`confirmSave()` path (voice/barcode)
  untouched.
- `app/src/app/(tabs)/__tests__/log.test.tsx` — photo-scan describe block
  rewritten for the items contract; new multi-item/remove-item/empty-result/
  per-item-validation tests; two new voice/barcode tests restoring coverage
  on `confirmSave()`'s guard/catch branches that moved out of the photo path.
- `app/src/lib/__tests__/food-recognition.test.ts` — updated to
  `PhotoAnalysis`.
- `app/src/lib/__tests__/food-recognition.web.test.ts` — updated to
  `PhotoAnalysis`; two new tests for the wrapping behavior.

## Not touched (per ticket scope)

- `backend/src/lib/local-food-analysis.js` and
  `backend/test/local-food-analysis.test.js` — untouched, still passing.
- `backend/src/lib/anthropic.js`'s `analyzeFoodText` and
  `backend/test/anthropic.test.js`'s `analyzeFoodText` tests — untouched.
- `app/src/lib/food-recognition-shared.ts` (CLIP scoring/decision logic) and
  its own test file — untouched.
