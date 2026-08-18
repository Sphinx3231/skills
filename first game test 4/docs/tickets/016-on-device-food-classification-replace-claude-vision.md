# Ticket 016: Replace Claude vision with an on-device food classifier

## Status

Not started — model sourcing resolved, see Model selection below.

## Model selection (resolved via spike + manual verification)

**Google AIY `vision-classifier-food-v1`** (MobileNetV1, 2,023 food/dish
classes, 192x192 input), sourced via Kaggle:
`https://www.kaggle.com/models/google/aiy/tfLite/vision-classifier-food-v1/1`.

- **License**: Apache 2.0, confirmed via Kaggle's structured model metadata
  API (`licenseName: "Apache 2.0"` for this exact model instance) — safe
  for commercial bundling.
- **File size**: 21.15MB real downloaded file — within budget.
- **Quantization — corrected framing**: this is NOT an internally
  int8-quantized model. It's a float32-weight MobileNetV1 with quantization
  only at the input/output boundary tensors (raw uint8 pixels in, dequantized
  internally). Do not describe it as "quantized" without this qualification
  anywhere in the build/outcome docs — it will hit the file-size target but
  will not get int8's inference-speed/memory benefits. Benchmark real
  on-device latency; don't assume int8-class performance.
- **Real accuracy** (verified against real unstaged stock photos, not a
  clean test set): 67-98% confidence with correct top-1 labels across
  cheeseburger, pizza, Greek salad, and sushi photos. A genuine multi-item
  plate (roast dinner: meat + veg + potatoes) degraded gracefully to a
  low-confidence, plausible-neighbor spread — acceptable given this model is
  single-label only.
- **Reproduced non-food hallucination**: a photo of a dog was labeled
  "Kutia" (an actual food dish) at 51.56% confidence — this is not a
  theoretical risk, it's a reproduced instance of ticket 010's exact
  failure mode (closed-set softmax always sums to 100% regardless of
  whether the input is food; the background/`__background__` class was
  never selected in testing). This does not block adoption, but confirms
  the mandatory confirm-before-log screen (`confirmSaveItems`/`confirmSave`)
  is load-bearing, not decorative, and must not be weakened or made
  skippable by this ticket's build.

## Background

Ticket 014 reverted `POST /food/analyze` from ticket 011's free, on-device
CLIP pipeline back to Claude vision (`analyzeFoodPhotoMultiItem` in
`backend/src/lib/anthropic.js`), specifically to get real multi-item,
open-vocabulary recognition — accepting a reintroduced per-scan Claude API
cost as the tradeoff, gated behind `requireActiveAccess` (trial/subscription)
so the cost lands only on paying/trialing users.

This ticket reverses that cost decision again, in the other direction: move
scan execution fully on-device using a bundled, quantized, closed-taxonomy
food classifier via `react-native-fast-tflite` (a generic TensorFlow Lite
JSI runtime — not zero-shot-specific, so it does not hit ticket 012's
already-documented finding that `react-native-executorch` has no zero-shot
API; a plain closed-set classifier doesn't need one). This eliminates the
per-scan Claude API cost entirely (`$0` marginal cost per scan), at the
explicit, accepted cost of losing open-vocabulary and multi-item
recognition — the model can only recognize whatever fixed food taxonomy it
was trained/quantized on (~100-500 common items), the same closed-set
limitation ticket 010's Food-101 Swin attempt already ran into (including
that attempt's "confidently wrong" failure mode — a 99.1%-confidence
grilled-chicken-labeled-as-salmon result). The existing mandatory
confirm-before-log review screen (`confirmSaveItems`/`confirmSave` in
`app/src/app/(tabs)/log.tsx`) remains the mitigation for that, unchanged
from ticket 010's established approach.

**Threat model, stated explicitly per this ticket's own scoping decision:**
this ticket does NOT attempt to enforce a hard paywall boundary around scan
execution. Once the quantized model file and the JSI execution engine are
bundled inside the app binary, a determined user can reverse-engineer the
binary, strip any client-side or short-lived-token gate, and run the local
model offline indefinitely without an active subscription. `requireActiveAccess`
remains an app-level product gate (same UX as today — expired-trial users see
the paywall screen in normal use of the app), not a technical guarantee that
scan execution is unbypassable. The outcome document for this ticket must
restate this explicitly; no code in this ticket should be written or
documented as if it closes this gap, since it cannot.

## Goal

Move `POST /food/analyze`'s execution path fully on-device via a bundled
quantized food-classification model, eliminating the per-scan Claude API
cost, while keeping today's product-level gating UX (expired-trial users
still see the paywall in normal app use) and the mandatory human-confirm
step before any result is logged.

## Scope

- **Runtime**: add `react-native-fast-tflite` (generic JSI-backed TFLite
  interpreter, CoreML delegate on iOS / GPU-NNAPI on Android). Add the
  Expo config plugin entry and `metro.config.js` asset-extension change
  (`.tflite`) needed to bundle and load the model file.
- **Model sourcing**: resolved — bundle the Google AIY
  `vision-classifier-food-v1` model named in the Model selection section
  above (Apache 2.0, 21.15MB, 2,023-class taxonomy). No training/conversion
  work needed; the `.tflite` file is used directly.
- **Client integration**: replace the network call in
  `app/src/lib/food-recognition.ts` (the native/mobile path — leave
  `food-recognition.web.ts`'s CLIP-via-WASM web path and ticket
  011/014's contracts alone unless the plan phase determines otherwise) with
  local model inference, producing the same `PhotoAnalysis`/`items` contract
  ticket 014 established so `log.tsx`'s existing `review-items` UI and
  `confirmSaveItems` need no changes.
- **Backend**: `POST /food/analyze` and `analyzeFoodPhotoMultiItem` become
  unused from the native client but are NOT deleted — same "leave it in
  place, uncalled" precedent ticket 010 and 014 both already established
  for their respective superseded functions. `requireActiveAccess` continues
  to gate the app's paywall UX at the point the user would otherwise
  initiate a scan, even though it's no longer gating a network call to a
  paid API.
- **Mandatory review screen**: unchanged — every on-device result still
  routes through the existing confirm-before-log step.
- **Outcome document**: must explicitly restate the threat-model disclosure
  above — on-device execution is a product gate, not a security boundary —
  as a first-class documented limitation, not a footnote.

## Non-goals

- No attempt to make the on-device model open-vocabulary or multi-item in
  the sense ticket 014 achieved — this is a deliberate, accepted regression
  in recognition breadth in exchange for $0 marginal cost.
- No attempt to build real DRM/binary-hardening/anti-tampering around the
  bundled model or a token-gating scheme — explicitly out of scope per the
  threat-model disclosure above, not a deferred future phase.
- No change to the web platform's food-recognition path (still CLIP via
  transformers.js/WASM, per ticket 011) unless the plan phase finds a
  concrete reason to unify them.
- No change to `analyzeFoodText` (voice/typed description) — stays on
  Claude, out of scope.

## Acceptance criteria

- A real photo of a food item within the model's trained taxonomy, run
  through the app on a real device/simulator, produces a plausible
  classification via the on-device model — no network call to
  `/food/analyze` is made for this path.
- A food item outside the model's taxonomy, or a non-food image, does not
  produce a fabricated high-confidence result — behavior degrades to the
  existing low-confidence/"couldn't identify" UI path.
- No app-breaking regression to `requireActiveAccess`'s paywall UX for
  expired-trial users in normal use of the app.
- The outcome document contains the explicit threat-model disclosure
  language from the Background section above, not a paraphrase that
  understates it.
- Regression coverage for the new client-side inference path at this
  project's normal coverage floor, using mocks for the native TFLite module
  the way this project already mocks other native modules it can't
  exercise in CI/sandboxed test runs.
