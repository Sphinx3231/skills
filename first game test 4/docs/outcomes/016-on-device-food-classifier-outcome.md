# Outcome: On-device food classification (replace Claude vision on native)

Ticket: [docs/tickets/016-on-device-food-classification-replace-claude-vision.md](../tickets/016-on-device-food-classification-replace-claude-vision.md)

No separate plan document was authored — as with ticket 014, the ticket
itself already specifies scope, non-goals, and acceptance criteria at
plan-document detail (including a resolved model choice), per the task's own
framing.

## What changed

Native/mobile's photo-scan path (`app/src/lib/food-recognition.ts`) no
longer calls `POST /food/analyze` (Claude vision) at all. It now runs the
bundled Google AIY `vision-classifier-food-v1` model
(`app/assets/models/food_classifier.tflite`, Apache 2.0, 2,024-class
taxonomy incl. a `__background__` non-food class) fully on-device via
`react-native-fast-tflite`, at $0 marginal cost per scan. Web's CLIP-via-WASM
path (`food-recognition.web.ts`) is completely untouched, per the ticket's
non-goals.

### Dependencies added

- `react-native-fast-tflite@3.0.1` — generic JSI/Nitro-backed TFLite
  interpreter (named in the ticket).
- `react-native-nitro-modules@0.36.5` — required peer dependency of
  `react-native-fast-tflite` v3 (Nitro Modules runtime; not named explicitly
  in the ticket but required for it to load at all — confirmed via the
  package's own `peerDependencies`).
- `jpeg-js@0.4.4` — a pure-JS, zero-dependency JPEG decoder. **Not named in
  the ticket; added because the on-device pipeline has no other way to turn
  a captured JPEG photo into a raw RGB pixel buffer for the model's input
  tensor.** `react-native-fast-tflite` has no built-in image-decoding
  utility for static photos (its own docs/examples only cover live
  VisionCamera frames via a separate `vision-camera-resizer` package, which
  doesn't apply here — there's no live camera frame, just a saved photo
  file). `jpeg-js` is the same library `@tensorflow/tfjs-react-native` uses
  internally for exactly this problem, has no dependencies of its own, and
  ships its own TypeScript types (so no `@types/jpeg-js` was needed — that
  package on npm is a documented stub pointing back at `jpeg-js`'s own
  types). This is flagged explicitly per the task's instructions, since it's
  a dependency beyond the one named in the ticket.
- `app/src/lib/base64.ts` — a small, dependency-free base64 decoder (not an
  npm package) written to turn `expo-image-manipulator`'s
  `saveAsync({ base64: true })` output back into raw bytes for `jpeg-js`.
  React Native/Hermes doesn't reliably expose a global `atob`, and this
  project doesn't otherwise depend on a `Buffer` polyfill, so a ~30-line
  pure function was simpler and more testable than pulling in a whole
  package (e.g. `base64-js`) for one small piece of arithmetic.

### Build configuration

- `app/metro.config.js` — **new file.** This project had no metro.config.js
  at all before this ticket (Expo's CLI was relying entirely on
  `expo/metro-config`'s built-in defaults with no on-disk override). Added
  the minimal file needed to register `tflite` as a bundleable asset
  extension (`config.resolver.assetExts.push('tflite')`) — without this,
  Metro would try to parse the 21MB binary model file as JS/JSON source
  instead of returning an asset reference.
- `app/app.json` — added `"react-native-fast-tflite"` to the Expo plugins
  array, with **no delegate options enabled** (no `enableCoreMLDelegate`,
  no `enableAndroidGpuLibraries`). This is a deliberate, conservative choice
  given zero device-verification capability in this environment: the
  library's GPU/CoreML delegates are a real performance option the ticket
  mentions ("CoreML delegate on iOS / GPU-NNAPI on Android"), but enabling
  them changes native build output in ways that can't be checked here, and
  a plain CPU delegate is the correct baseline to get *correctness* first.
  Enabling GPU acceleration is a reasonable, low-risk follow-up once someone
  can verify it on a real device.

### The model-to-`PhotoAnalysis` mapping, exactly

New files:

- `app/src/lib/food-classifier-labelmap.ts` — **auto-generated** (via
  `app/scripts/generate-food-classifier-labelmap.js`, a small one-off
  conversion script, not run automatically as part of any build step) from
  `app/assets/models/food_classifier_labelmap.csv`. Exports
  `FOOD_CLASSIFIER_LABELS: readonly string[]` (2,024 entries, index-aligned
  1:1 with the model's softmax output) and `BACKGROUND_CLASS_INDEX = 0`
  (the model's own dedicated non-food class, `__background__`). Verified
  the source CSV's `id` column is sequential 0..2023 before generating (no
  gaps/reordering to worry about). One real, source-data duplicate exists
  ("Sundae" at indices 677 and 776) — not a generation bug, asserted
  explicitly in the labelmap's own test rather than silently tolerated.
- `app/src/lib/food-classifier-shared.ts` — pure, platform-agnostic mapping
  from a raw `scores: number[]` array (one softmax-style score per class,
  index-aligned to the labelmap) to the same `FoodAnalysisResult` shape
  `food-recognition-shared.ts` (the CLIP pipeline) already established.
  Only that **type** is reused — the classification logic itself is new,
  not a port of CLIP's margin/anchor scoring, since the two models produce
  structurally different outputs (CLIP: a handful of hand-picked candidate
  prompts scored by cosine similarity; this model: a real ~2,024-way
  softmax over a fixed taxonomy). Logic:
  1. If the top-1 class is `BACKGROUND_CLASS_INDEX`, return the same
     "couldn't identify a food" empty result CLIP's `NO_FOOD_RESULT` uses —
     `foodName: ''`, which `food-recognition.ts`'s wrapper turns into a
     zero-item `PhotoAnalysis`, never a fabricated result.
  2. Otherwise, scan the top 3 ranked classes (`TOP_K_BACKGROUND_CHECK`,
     mirroring CLIP's own `TOP_K_ANCHOR_CHECK` rationale) for the background
     class appearing near the top even when a real label won top-1 at a
     borderline score — if found, force `confidence: 'low'` and prefix the
     caveat with a "may not be a correct match" warning.
  3. `foodName` comes **only** from `FOOD_CLASSIFIER_LABELS[topIndex]` —
     never a raw index or number. `confidence` buckets the top-1 score
     into `'high'` (≥ `HIGH_CONFIDENCE_THRESHOLD = 0.6`), `'medium'`
     (≥ `MEDIUM_CONFIDENCE_THRESHOLD = 0.3`), or `'low'`, per the ticket's
     own cited spike numbers (67-98% top-1 confidence on correctly-
     identified photos). These thresholds are a probability scale, **not**
     interchangeable with CLIP's top1-minus-top2 margin thresholds.
  4. `calories`/`proteinG`/`carbsG`/`fatG` are **always 0** — see "Macro-data
     approach" below — and every real result carries a caveat instructing
     manual entry, in addition to (not instead of) any low-confidence
     warning.
- `app/src/lib/food-recognition.ts` — rewritten. Loads
  `react-native-fast-tflite` via the same module-scope
  `try { require(...) } catch { null }` pattern `speech-recognition.ts`
  already uses (confirmed necessary: requiring the real, unlinked package
  in this Jest environment throws `Failed to get NitroModules: The native
  "NitroModules" Turbo/Native-Module could not be found` synchronously —
  the exact same failure class ticket 007 already hit once with a different
  native module). Per scan: resizes the photo to 192×192 via
  `expo-image-manipulator` (lazy-required inside the function, same
  reasoning as `image-prep.ts`'s own C1 comment), decodes the resulting
  JPEG bytes to raw RGB pixels via `jpeg-js`, builds an input `ArrayBuffer`
  honoring whatever dtype the loaded model reports (`uint8` = raw bytes
  as-is; `float32` = normalized to 0–1), runs the model, decodes the output
  tensor back into a `number[]` (honoring dtype the same way), and feeds
  it to `classifyFoodClassifierOutput`. The loaded model is memoized across
  scans (loading is not free; nothing about the model changes between
  calls).
- `app/src/lib/base64.ts` — see above.

### Client-side billing gate (new, required)

Native's old `classifyFoodPhoto` relied entirely on the backend's
`requireActiveAccess` middleware for trial/subscription enforcement, since
every scan was a network call to a gated route. Running fully on-device
removes that network call, which would otherwise silently make every scan
free for an expired-trial user — a real regression against the ticket's own
acceptance criterion ("no app-breaking regression to `requireActiveAccess`'s
paywall UX"). Fixed by porting `food-recognition.web.ts`'s
`assertActiveAccess()` pattern verbatim to native: calls the existing,
already-authenticated `GET /billing/status`, blocks with the same
`ApiError(402, ..., { billing })` shape log.tsx's existing 402 branch
already handles, checked on every scan (not cached), and fails **closed**
(not falling through to running the model) if the billing check itself
throws.

## Macro-data approach (design decision)

**Chosen: manual entry, same UX as this app's existing manual-entry flow.**
Every on-device result sets `calories`/`proteinG`/`carbsG`/`fatG` to `0` and
attaches a caveat ("Identified on-device — this model doesn't estimate
calories or macros. Enter those details yourself before saving.") — the
food name is pre-filled from the model, but every nutrition field starts
zeroed and editable, exactly like this app's from-scratch manual log entry
already works, and exactly the pattern `food-recognition-shared.ts`'s own
`NO_NUTRITION_RESULT` case already established for "recognized something but
no nutrition data for it" (a matched-but-missing-row edge case in the CLIP
pipeline).

Rejected alternatives:

- **A USDA FoodData Central lookup keyed on the predicted food name.**
  Rejected: this is a new external API integration requiring network access
  and (per FDC's terms) an API key this task has no credentials for —
  clearly out of scope for a ticket whose entire point is eliminating a
  per-scan network dependency, and a new secret/credential is exactly the
  kind of thing that needs to be named and stopped on rather than assumed.
- **Reusing `food-nutrition-lookup.ts`/`food-nutrition-data.ts` (the
  existing CLIP nutrition-reference table).** Rejected: that table only
  covers the CLIP pipeline's 36 hand-picked candidate labels. This model's
  taxonomy is ~2,023 AIY food/dish names with almost no overlap to that
  list (a handful might coincidentally match by string, most won't) —
  building and maintaining a second ~2,000-row hand-curated reference table
  was judged out of proportion to this ticket's scope, and a wrong or
  approximate serving-size default per dish name for genuinely unfamiliar
  dishes (many are regional/less-common) risks looking more authoritative
  than it is.

The manual-entry approach was simplest, required no new external dependency
or maintenance burden, and is the most honest option: the model genuinely
has no nutrition data, and telling the user that plainly (with the food
name still pre-filled as a real time-saver) is more consistent with this
app's existing "flag what's uncertain, don't fabricate" convention (the
same convention behind CLIP's `caveat` field and Claude vision's confidence
levels) than guessing a plausible-looking number.

## Confidence / non-food handling

Per the ticket's own reproduced finding (a dog photo classified as "Kutia",
an actual dish, at 51.56% confidence — the same "confidently wrong"
closed-set-softmax failure mode ticket 010 already documented for its
Food-101 attempt), a top-1 background-class prediction is the only
structural signal this model gives that it thinks nothing food-like is
present, and it does **not** catch every non-food photo — only the ones
where the model's own background class actually wins. This is not
"solved" by this ticket; it's mitigated exactly the way ticket 010
established: the mandatory confirm-before-log screen
(`confirmSaveItems`/`log.tsx`) is unchanged and remains the real backstop.
No code path in this ticket bypasses or weakens it — `classifyFoodPhoto`
still returns a `PhotoAnalysis` that routes through the exact same
`review-items` UI ticket 014 built, with zero `log.tsx` changes required.

## Threat model — restated, not paraphrased

Per the ticket's own explicit scoping decision, this is being restated
verbatim-in-spirit, not softened: **this ticket does not attempt to enforce
a hard paywall boundary around scan execution.** On-device execution is a
product-level gate via `requireActiveAccess`'s (and now
`assertActiveAccess()`'s) existing paywall UX — the same UX an expired-trial
user already sees in normal use of the app — **not an unbypassable security
boundary.** Once the quantized model file and the JSI execution engine are
bundled inside the app binary, a determined user can reverse-engineer the
binary, strip the client-side `assertActiveAccess()` check, and run the
local model offline indefinitely without an active subscription. No code in
this ticket closes that gap, and none should be read as if it does — real
DRM/binary-hardening/anti-tampering was explicitly out of scope per the
ticket's non-goals, not a deferred future phase.

## Unverified / could not check in this environment

- **No live device/simulator run of any kind.** This sandboxed environment
  has no native simulator or physical device available (confirmed during a
  separate, earlier verification task in this repo) — every claim about
  the actual on-device pipeline working end-to-end (image resize → JPEG
  decode → tensor build → real model inference → real classification
  output) is based on reading the libraries' own source/type definitions
  and unit-testing each isolated piece against mocks, **not** on watching a
  real photo produce a real classification on real hardware. This mirrors
  this repo's existing "no live API call was possible" disclosure pattern
  (e.g. ticket 014's outcome doc) for the same underlying reason: the
  environment, not a shortcut taken here.
- **The output tensor's exact dtype and quantization behavior are not
  confirmed against the real bundled model file.** `react-native-fast-tflite`'s
  public `Tensor` type (`{ name, dataType, shape }`) exposes no
  quantization scale/zero-point metadata at all — there is no way to derive
  the exact expected byte layout from this library's API alone. The code
  handles both `float32` (assumed direct softmax probabilities) and `uint8`
  (assumed linear encoding of `[0,1]` into `[0,255]`, i.e. `score = byte /
  255`, the common convention for a fully-quantized classifier's final
  layer) and throws an explicit, caught error for anything else — but which
  branch the real bundled model actually takes, and whether the uint8
  assumption's scale/zero-point actually match, is unverified. This is
  flagged clearly in the code itself (see `buildInputBuffer`'s and
  `decodeOutputScores`'s comments in `food-recognition.ts`), not asserted
  as fact.
- **GPU/CoreML delegate acceleration is not enabled or benchmarked** — see
  the "Build configuration" section above for why the conservative default
  (CPU-only) was chosen.
- **Whether Metro's `assetExts` change alone is sufficient for a real EAS
  build to successfully bundle a 21MB binary asset** is not verified beyond
  `metro.config.js` loading without a syntax error in this environment
  (`node -e "require('./metro.config.js')"` succeeded) and `npx tsc
  --noEmit` introducing no new errors.

## Test results

All numbers are from real runs in this environment, not estimated.

**Frontend** (`npx jest --coverage`):
- **421/421 tests passing, 0 failed, 48 suites** (up from 416/416, 45
  suites, before this ticket's 5 new test files).
- Coverage (all files): **98.64% statements / 91.02% branches / 98.53%
  functions / 99.57% lines** — above this project's stated floor (~97%
  statements / 99% lines / 88%+ branches).
- New/changed files' own coverage: `food-classifier-labelmap.ts` 100/100/
  100/100, `food-classifier-shared.ts` 100/100/100/100, `base64.ts`
  100/100/100/100, `food-recognition.ts` 100% stmts / 93.75% branch / 100%
  funcs / 100% lines (two uncovered branches: the optional-chaining
  `?? null` on an always-populated `caveat`, and the `String(err)` fallback
  for a thrown non-`Error` value — both minor, both mirrored by an
  identically-uncovered pattern already present in `food-recognition.web.ts`
  before this ticket).
- Red-before/green-after proof from this session: two genuine test-fixture
  bugs were caught and fixed while writing these tests, not shipped —
  (1) an all-zero score-array fixture unintentionally tied
  `__background__` (index 0) for last place with every un-overridden class,
  and JS's stable sort then deterministically placed it inside the
  top-3 background-check window by index-order accident, not because any
  test actually put it there — every "high confidence" test was silently
  asserting `'low'` until fixed by giving the fixture a strictly-increasing
  tiny baseline instead of a flat one; (2) a `uint8`-quantization test hit
  the same tie problem one level deeper (a 256-value byte range collapses a
  near-zero float baseline to the same rounded byte for almost every class,
  including background), fixed by giving two explicit non-background
  classes distinctly higher bytes in that one fixture.
- Two genuinely-dead defensive branches were found and removed rather than
  left uncovered: `food-classifier-shared.ts`'s `if (!top) return ...`
  (impossible once the preceding `scores.length === 0` guard already ran)
  and `base64.ts`'s `if (value === undefined) continue` (impossible once
  the preceding regex-sanitization step already stripped every character
  outside the base64 alphabet). Both were replaced with a type-asserting
  comment explaining why, rather than kept as untested guard clauses.
- New tests specifically for the ticket's acceptance criteria: a
  background-class top-1 produces zero items, not a fabricated result
  (`food-classifier-shared.test.ts`, `food-recognition.test.ts`); a real
  food label winning top-1 with background close behind is still forced to
  low confidence (regression test, mirrors CLIP's own already-existing
  regression test for the same class of bug); native's photo-scan path
  makes zero calls to `api.analyzePhoto`; an expired-trial user is blocked
  before the model is ever loaded, and a trialing (not-yet-expired) user is
  not blocked (regression test, mirrors the CTO-flagged mutation-testing
  finding from ticket 011's web equivalent); the native module being
  unlinked degrades to an honest error instead of crashing the Log screen
  (`food-recognition-model-unavailable.test.ts`, using the real unmocked
  package the same way `speech-recognition.test.ts` already does, not a
  fake).

**`npx tsc --noEmit`**: **3 errors**, identical to this project's documented
pre-existing baseline (`animated-icon.tsx`, `app-tabs.web.tsx`,
`collapsible.tsx`). No new errors introduced by this ticket.

**Backend**: untouched by this ticket (per scope — `POST /food/analyze` and
`analyzeFoodPhotoMultiItem` stay in place, uncalled from native). Not
re-run, since nothing there changed.

## Files changed

- `app/package.json` / `app/package-lock.json` — added
  `react-native-fast-tflite`, `react-native-nitro-modules`, `jpeg-js`.
- `app/metro.config.js` — **new file**; registers `tflite` as a bundleable
  asset extension.
- `app/app.json` — added the `react-native-fast-tflite` Expo config plugin
  entry (no delegate options).
- `app/src/lib/food-recognition.ts` — rewritten for on-device inference
  (was a thin `api.analyzePhoto()` passthrough).
- `app/src/lib/food-classifier-shared.ts` — **new**, pure model-output-to-
  `FoodAnalysisResult` mapping.
- `app/src/lib/food-classifier-labelmap.ts` — **new**, auto-generated
  2,024-entry label array.
- `app/src/lib/base64.ts` — **new**, dependency-free base64 decoder.
- `app/scripts/generate-food-classifier-labelmap.js` — **new**, one-off
  generator script (source of truth is
  `app/assets/models/food_classifier_labelmap.csv`; re-run this script,
  don't hand-edit the labelmap file, if the CSV ever changes).
- `app/src/lib/__tests__/food-recognition.test.ts` — rewritten for the
  on-device pipeline (model-available scenario).
- `app/src/lib/__tests__/food-recognition-model-unavailable.test.ts` —
  **new**, native-module-not-linked scenario (own file, same reason
  `log-no-speech.test.tsx` is split from `log.test.tsx`).
- `app/src/lib/__tests__/food-classifier-shared.test.ts` — **new**.
- `app/src/lib/__tests__/food-classifier-labelmap.test.ts` — **new**.
- `app/src/lib/__tests__/base64.test.ts` — **new**.

## Not touched (per ticket scope)

- `app/src/lib/food-recognition.web.ts`, `food-recognition-shared.ts`, and
  their own test files — CLIP-via-WASM web path, completely untouched.
- `app/src/app/(tabs)/log.tsx` — zero changes; the on-device pipeline
  produces the exact same `PhotoAnalysis` contract ticket 014 established,
  so the existing `review-items` UI and `confirmSaveItems` needed no
  changes at all (verified by `log.test.tsx`'s full 65/65 passing,
  unmodified).
- `backend/src/routes/food.js`'s `POST /food/analyze` and
  `backend/src/lib/anthropic.js`'s `analyzeFoodPhotoMultiItem` — left in
  place, now unused from the native client, same "leave it, don't delete
  it" precedent tickets 010 and 014 already established. `requireActiveAccess`
  still gates that route server-side, unchanged.
- `analyzeFoodText` (voice/typed description) — untouched, still calls
  Claude, out of scope per the ticket's non-goals.
