# Outcome: Backend-side free food recognition — STOPPED at Step 0 (go/no-go: NO-GO)

Ticket: [docs/tickets/010-on-device-food-recognition.md](../tickets/010-on-device-food-recognition.md) ·
Plan: [docs/plans/on-device-food-recognition-plan.md](../plans/on-device-food-recognition-plan.md)

## Verdict up front

**Step 0's empirical accuracy spike failed the plan's own go/no-go gate.**
Per the plan (Step 0, item 8): *"Out-of-vocabulary inputs landing
confidently-wrong is a stop-and-reconsider outcome, not something to paper
over by tuning `MIN_ACCEPT_SCORE` alone."* That is exactly what happened.
Per the build instructions for this ticket, a genuinely bad spike result
means stop and report clearly rather than ship something known to be
broken — so **no product code was written**: no nutrition table, no
`local-food-recognition.js`/`local-food-analysis.js` modules, no route
changes, no tests, no client changes. `@huggingface/transformers` was
installed only long enough to run the Step 0 spike, then **uninstalled
again** (`git checkout -- backend/package.json backend/package-lock.json`)
so the working tree is unchanged. `git status`/`git diff` in this worktree
show no tracked-file changes at all.

## What was verified (Step 0, items 1–7)

### 1. Environment / install
- Node v24.18.0, backend's `"type": "module"` ESM setup — `@huggingface/transformers@4.2.0`
  imported and ran without any ESM/CJS friction.
- `npm install @huggingface/transformers` pulled in `onnxruntime-node@1.24.3`,
  `onnxruntime-web@1.26.0-dev...`, `sharp@0.34.5`, `@huggingface/jinja`,
  `@huggingface/tokenizers`. Post-install scripts required explicit
  `npm approve-scripts` (this repo's install-script gate) for
  `onnxruntime-node`, `sharp`, and `protobufjs`.
- Install size: `node_modules/onnxruntime-node` = **211 MB**,
  `node_modules/@img/sharp-win32-x64` = **19 MB**, `node_modules/@huggingface`
  = 13 MB. Total added to `node_modules`: ~**428 MB** on this Windows/x64
  dev machine.
- **Correction to the plan's assumption**: `onnxruntime-node`'s npm package
  actually ships prebuilt binaries for **darwin, linux, and win32 together
  in one package** (35 MB / 53 MB / 124 MB respectively under
  `bin/napi-v6/<platform>/`) — it is not one npm install per platform for
  this specific package. `sharp`, by contrast, *does* use per-platform
  optional dependencies (`@img/sharp-win32-x64` was the only variant
  actually installed here); a Linux host would pull `@img/sharp-linux-x64`
  instead. Net effect on the plan's original claim is the same in practice
  (a `node_modules` built on Windows still isn't guaranteed portable to
  Linux, because of `sharp`'s optional-deps resolution even though
  `onnxruntime-node` itself is platform-inclusive) — recorded here because
  the mechanism differs from what the plan assumed.
- The downloaded model weights (`model.onnx`, see "Model variant" below)
  landed in `node_modules/@huggingface/transformers/.cache/...` — inside
  `node_modules`, not a separate OS cache dir — confirming this is
  effectively part of the install footprint per environment, not shared
  across projects.

### 2. Input construction from a Buffer
Traced `RawImage.read()` in `@huggingface/transformers`' source
(`src/utils/image.js`): it accepts a `string|URL`, an `HTMLCanvasElement`
(browser-only), or **a `Blob`** — not a raw `Buffer` or file path directly.
The working construction from `req.file.buffer` (multer memory storage) is:

```js
const blob = new Blob([buffer], { type: req.file.mimetype });
const results = await classifier(blob, { top_k: 5 });
```

Confirmed directly against the pipeline call chain
(`ImageClassificationPipeline._call` → `prepareImages` → `RawImage.read`),
not assumed. No temp-file round trip is needed.

Output shape confirmed as `[{label, score}, ...]`, sorted descending by
score (via `topk` over a softmax), matching the plan's assumption exactly.
Default `top_k` for the pipeline call itself is 5; we passed `top_k: 5`
explicitly.

### 3. Real accuracy spike — the finding that matters

21 real photos (Wikimedia Commons, non-Food-101-curated — genuinely "real
world" images the benchmark's 92.1% figure does not represent) were run
through the classifier: 12 in-vocabulary meals, 5 out-of-vocabulary real
foods, 4 non-food images. Full results:

**In-vocabulary (12 photos)** — top-1 label / score / margin to 2nd place:

| photo | top-1 | score | 2nd place | margin | correct? |
|---|---|---|---|---|---|
| pizza | pizza | 0.9969 | lasagna | 0.9959 | yes |
| sushi | sushi | 0.9987 | sashimi | 0.9980 | yes |
| hamburger | hamburger | 0.9980 | pulled_pork_sandwich | 0.9972 | yes |
| tiramisu | french_toast | 0.4491 | eggs_benedict | 0.2869 | **no** |
| icecream | ice_cream | 0.9965 | apple_pie | 0.9953 | yes |
| donuts | donuts | 0.9996 | beignets | 0.9995 | yes |
| tacos | tacos | 0.9978 | falafel | 0.9967 | yes |
| fried rice | fried_rice | 0.9998 | paella | 0.9998 | yes |
| waffles | chocolate_cake | 0.5668 | cheesecake | 0.4153 | **no** |
| steak | pork_chop | 0.3526 | prime_rib | 0.0089 | **no** (right dish family, wrong label; also lowest in-vocab margin) |
| french fries | french_fries | 0.9978 | poutine | 0.9959 | yes |
| ramen | pho | 0.6745 | ramen | 0.3507 | **no** (correct label is 2nd place) |

In-vocabulary top-1 accuracy on this small real-photo set: **8/12 (67%)**
— well under the model card's curated 92.1% validation figure, as the plan
anticipated ("a curated benchmark and a real photo aren't the same
distribution"). Not itself disqualifying on its own, but establishes that
even "in-vocabulary" real photos regularly land in the 0.35–0.67 score
range, not just the near-1.0 range the confident correct predictions show.

**Out-of-vocabulary (5 photos of common real foods NOT in Food-101)** — this
is the finding that fails the gate:

| photo | top-1 (wrong dish guessed) | score | 2nd place | margin | verdict |
|---|---|---|---|---|---|
| banana | macaroni_and_cheese | 0.0314 | chicken_wings | 0.0003 | low score, low margin — **correctly reads as "no idea"** |
| oatmeal | risotto | 0.5458 | hummus | 0.3766 | **confidently wrong** — would show as "medium" confidence risotto nutrition for a bowl of oatmeal |
| chicken breast (grilled, w/ pesto & zucchini) | grilled_salmon | 0.9908 | pork_chop | 0.9873 | **confidently wrong at the highest possible tier** — 99.1% score, 98.7% margin, indistinguishable score-wise from a correct in-vocab prediction. Would show as "high confidence" salmon nutrition for a chicken dish. |
| salad (pasta salad) | macaroni_and_cheese | 0.5042 | ramen | 0.3634 | **confidently wrong** — "medium" confidence |
| protein shake | foie_gras | 0.1833 | miso_soup | 0.0632 | low score/margin — correctly reads as low confidence |

**3 of 5 out-of-vocabulary probes (60%) produced a confidently-wrong
prediction** — landing in the plan's "medium" or "high" confidence bucket
(margin ≥ 0.15) for a dish the photo does not actually show. The
chicken-breast case is the most serious: **its score (0.9908) and margin
(0.9873) are statistically indistinguishable from a genuinely correct
in-vocabulary prediction** (e.g. pizza: 0.9969/0.9959, hamburger:
0.9980/0.9972). This is the exact failure the plan named as
non-fixable-by-threshold: no single `MIN_ACCEPT_SCORE` or margin cutoff can
separate this case from a true positive, because the underlying softmax
carries no information about whether the input is in-distribution at all —
it can only express "which of my 101 labels fits best," and a photo of
grilled chicken can fit "grilled_salmon" better than any of the 101 labels
fit a genuinely dissimilar photo like the banana or protein shake did.
Raising `MIN_ACCEPT_SCORE` to something that rejects the oatmeal (0.546) and
salad (0.504) cases would still pass the chicken-breast case straight
through at "high confidence" (0.9908 far exceeds any threshold that doesn't
also reject most correct in-vocabulary predictions, which score in the same
0.99+ range).

**Non-food (4 photos: desk, brick wall, dog, cat)** — all four scored low
(0.08–0.18) with low margins (0.017–0.11), correctly reading as "no idea."
Non-food rejection behaved as hoped; it's specifically food-shaped
out-of-vocabulary inputs that break down.

### 4. Latency and memory

- Model load (first `pipeline()` call, downloads + initializes the ONNX
  session): **34.5 seconds**, RSS rose from 64 MB → 492 MB during load.
- Per-image inference latency across all 21 spike calls: **min 1007 ms, max
  1956 ms, average 1496 ms**, all on CPU (no GPU used), Windows/x64 dev
  hardware. Acceptability bar set before measuring, per the plan's
  instruction: anything under ~2.5s was going to be judged acceptable for a
  live request/response cycle given this project has no client-side request
  timeout; **1.0–2.0s per image comfortably clears that bar** — latency was
  not a blocking concern.
- **Peak RSS during the spike: 1440 MB.** Final RSS after 21 calls: 719 MB
  (didn't return to baseline — consistent with ONNX Runtime session +
  tensor allocator overhead staying resident, not a leak per call since it
  plateaued rather than growing unboundedly across the run).
- **Concurrency**: 3 sequential calls took 2561 ms total; 3 concurrent calls
  (`Promise.all`) took 2316 ms total — only a ~10% improvement, not the ~3x
  a genuinely parallel run would show. **Confirms the plan's expectation
  that requests effectively serialize against one ONNX Runtime session** on
  this hardware; concurrent requests will queue rather than run truly in
  parallel, and memory did not spike further under concurrency in this
  small test (601 MB after, still under the single-request peak of 1440 MB
  seen during model load + spike).

### 5. Model variant/dtype actually used

`pipeline('image-classification', 'onnx-community/swin-finetuned-food101-ONNX')`
was called with no dtype/variant option, which downloaded
`onnx/model.onnx` — **337 MB**, the **default full-precision (fp32) file**,
not a quantized variant. This is the heaviest option the repo publishes (per
the plan's own warning that "Swin-base fp32 is the heaviest option"). No
quantized variant was benchmarked since the spike was already stopped by
the accuracy finding above — re-running against a quantized variant
would not fix an accuracy-calibration problem that exists at the
architecture level (no reject class), so it wasn't worth the extra spike
time before reporting this verdict.

### 6. Real label list (`id2label`, 101 classes, byte-for-byte)

Printed directly from `classifier.model.config.id2label`, not assumed:

```
apple_pie, baby_back_ribs, baklava, beef_carpaccio, beef_tartare, beet_salad,
beignets, bibimbap, bread_pudding, breakfast_burrito, bruschetta,
caesar_salad, cannoli, caprese_salad, carrot_cake, ceviche, cheesecake,
cheese_plate, chicken_curry, chicken_quesadilla, chicken_wings,
chocolate_cake, chocolate_mousse, churros, clam_chowder, club_sandwich,
crab_cakes, creme_brulee, croque_madame, cup_cakes, deviled_eggs, donuts,
dumplings, edamame, eggs_benedict, escargots, falafel, filet_mignon,
fish_and_chips, foie_gras, french_fries, french_onion_soup, french_toast,
fried_calamari, fried_rice, frozen_yogurt, garlic_bread, gnocchi,
greek_salad, grilled_cheese_sandwich, grilled_salmon, guacamole, gyoza,
hamburger, hot_and_sour_soup, hot_dog, huevos_rancheros, hummus, ice_cream,
lasagna, lobster_bisque, lobster_roll_sandwich, macaroni_and_cheese,
macarons, miso_soup, mussels, nachos, omelette, onion_rings, oysters,
pad_thai, paella, pancakes, panna_cotta, peking_duck, pho, pizza, pork_chop,
poutine, prime_rib, pulled_pork_sandwich, ramen, ravioli, red_velvet_cake,
risotto, samosa, sashimi, scallops, seaweed_salad, shrimp_and_grits,
spaghetti_bolognese, spaghetti_carbonara, spring_rolls, steak,
strawberry_shortcake, sushi, tacos, takoyaki, tiramisu, tuna_tartare, waffles
```

This is standard Food-101 (101 classes, snake_case, as expected) — worth
eyeballing regardless of the go/no-go outcome: it confirms plain, everyday
items people actually log (a banana, oatmeal, a plain chicken breast, a
green salad, a protein shake, eggs, toast, rice+vegetables, most
home-cooked meals) are **not represented at all** — the 101 classes skew
heavily towards named restaurant dishes (sushi, pho, bibimbap, croque
madame, filet mignon) and desserts. This independently supports the
spike's finding: a large fraction of what a real user would actually
photograph falls outside these 101 labels, so the confidently-wrong
out-of-vocabulary behavior isn't an edge case — it's close to the median
case for a health-tracking app's real usage.

### 7. Image decode / mimetype handling

`@huggingface/transformers` decodes images via `sharp` (confirmed directly
in `RawImage.fromBlob()`'s source, not assumed). Verified explicitly by
constructing all three mimetypes `food.js` already allowlists from the same
source photo and decoding each via `RawImage.read()`:

- `image/jpeg` → decoded, 1024×768, 3 channels.
- `image/png` (converted via `sharp(...).png()`) → decoded, 1024×768, 3
  channels.
- `image/webp` (converted via `sharp(...).webp()`) → decoded, 1024×768, 3
  channels.

All three decode correctly — this part of Step 0 raised no concerns.

## Item 8 — the go/no-go gate, evaluated (not skipped)

Per the plan: *"if in-vocabulary accuracy, out-of-vocabulary rejection
behavior (item 3), or latency/memory (item 4) looks unacceptable, stop and
reconsider... before Step 1."*

- Latency/memory: **acceptable** (see above).
- In-vocabulary accuracy: **weaker than the model card's number on real
  photos (67% vs. 92.1%), but not disqualifying on its own** — the honest
  degrade path (low score → "Unknown") could reasonably absorb some of this.
- **Out-of-vocabulary rejection behavior: NOT acceptable.** 60% of
  out-of-vocabulary probes landed as confidently-wrong (medium/high
  confidence, per the plan's own margin thresholds), including one case
  (chicken breast → grilled_salmon, 99.1%/98.7%) that is score-for-score
  indistinguishable from a true positive. This is precisely the failure
  mode the plan's tech-lead review flagged by name and explicitly ruled
  ineligible for a threshold-tuning fix.

**Verdict: NO-GO on the plan as currently scoped** (a single classifier +
a score/margin threshold, no separate out-of-distribution detection). This
is not a case of "the number needs a re-tune" — the spike shows the
threshold approach cannot structurally distinguish this failure mode from
a correct prediction, regardless of where `MIN_ACCEPT_SCORE` or the margin
bands are set.

## What would need to change before this could proceed

Not implemented (this is a decision for the next planning round, not a
unilateral pick here) — options observed to be structurally different from
"tune the constant":

1. **A separate binary food/non-food (or in-vocab/out-of-vocab) gate**
   ahead of the 101-way classifier — e.g. a general-purpose image
   classifier or embedding-similarity check that can express "I don't
   recognize this as one of these 101 dishes" before ever consulting the
   Food-101 softmax. Real engineering work, not a config change.
2. **A different model** with either more classes (closer coverage of
   everyday non-restaurant foods) or an explicit "other/unknown" output
   class trained in — changes the model-choice section of the plan, would
   need its own license/accuracy verification pass.
3. **Product-level scope narrowing**: only offer photo-scan confidently for
   a curated subset of dishes users are told upfront are supported (e.g.
   "works best for restaurant-style dishes: pizza, sushi, tacos...")
   rather than presenting it as general meal recognition — a UX/expectation
   change, not a backend change, and a call for the product owner, not an
   implementation detail.
4. Accept the risk with much more conservative language and always require
   explicit user confirmation of the identified dish before any nutrition
   data is used (i.e., never auto-trust "high confidence") — weakens the
   feature's core value proposition (frictionless photo scan) but avoids
   silently-wrong logged macros.

None of these were selected or implemented here — that decision sits above
this ticket's implementation scope and needs explicit sign-off given it
changes the plan's core approach, not just its parameters.

## What was left unchanged

- `git status` / `git diff` in this worktree (`first game test 4/`) show
  **no tracked-file changes**. `backend/package.json` and
  `backend/package-lock.json` were modified temporarily to install
  `@huggingface/transformers` for the spike, then reverted via
  `git checkout -- backend/package.json backend/package-lock.json` once
  the spike concluded.
- No new backend modules, no DB schema changes, no route changes, no test
  changes, no client changes (including the `api.ts` caveat doc-comment
  edit that was pre-approved for Step 3 — not made, since Step 3 was never
  reached).
- `backend`: `node --experimental-test-module-mocks --experimental-test-coverage --test`
  — full pass, **94/94 tests**, coverage unchanged from before this ticket
  (99.25% lines / 96.63% branches / 100% funcs overall; `food.js` itself
  98.14%/96.55%/100%, same pre-existing uncovered lines 307-312 as before
  this ticket touched nothing there).
- `app`: `npx jest` could not run in this worktree — `app/node_modules`
  is not installed here at all (`jest-expo` preset not found), a pre-
  existing environment gap in this specific worktree checkout unrelated to
  this ticket (no `app/` files were touched). Not a regression from this
  work; flagged honestly rather than silently skipped.

## Recommendation

Take this back to a planning round before further implementation. The
core question to resolve is architectural (how to detect "this isn't one
of the 101 dishes" before trusting the classifier's answer), not a
parameter to tune inside the current design. The latency/memory/ESM/
decode-library findings above remain valid and reusable for whatever
approach comes next — they're independent of the accuracy problem.
