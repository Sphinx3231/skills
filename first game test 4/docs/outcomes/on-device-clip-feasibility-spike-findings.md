# Spike findings: true on-device CLIP food recognition (ticket 011, Step 0)

Ticket: [docs/tickets/011-true-on-device-food-recognition.md](../tickets/011-true-on-device-food-recognition.md)

This is a feasibility/data-gathering spike only. **No product code was
changed, no branch was created, nothing in `app/` or `backend/` was
modified.** All empirical testing happened in a scratch directory outside
the repo (`%TEMP%\claude\...\scratchpad\clip-web-test`), using a throwaway
`npm init` + Playwright install, cleaned up conceptually at the end (nothing
was installed into the repo's `node_modules`).

Every claim below is labeled **VERIFIED** (I ran something and observed the
result myself, in this session) or **DOCUMENTED BUT NOT TESTED** (found in
official docs/READMEs/npm registry metadata, not independently exercised).

---

## Q1: Can `@huggingface/transformers` run inside a React Native app?

**Short answer: not directly — its ONNX Runtime Web backend targets Node.js
and browsers, not React Native's JS engine (Hermes/JSC), and there is no
official RN backend for this exact package.** Running CLIP on-device on
mobile requires a *different* library with its own native module, not the
same package ticket 010 already uses.

- **DOCUMENTED BUT NOT TESTED**: `onnxruntime-react-native` (npm,
  v1.24.3, last published 2026-07-16 — actively maintained) is Microsoft's
  official ONNX Runtime binding for React Native. `engines: {node: '>=18'}`,
  `peerDependencies: {react: '*', 'react-native': '*'}` (verified via
  `npm view`). It is a **native module** — per Microsoft's own docs and
  multiple community threads (including an open `microsoft/onnxruntime`
  GitHub discussion titled "Cannot get onnxruntime-react-native to run on
  expo"), it requires Expo prebuild / a custom dev client; it cannot run in
  plain Expo Go. This matches ticket 011's suspicion exactly: a rebuild of
  this project's existing custom dev client (not just a JS bundle push)
  would be required. It does **not** give you `@huggingface/transformers`'s
  JS API — you'd be writing your own CLIP pre/post-processing (image
  resize/normalize, tokenization, softmax) against the raw ONNX Runtime
  tensor API, since transformers.js's high-level `pipeline()` abstraction is
  not itself ported to this backend.
- **DOCUMENTED BUT NOT TESTED**: `daviddaytw/react-native-transformers`
  (fetched its GitHub page directly) is the closest thing to "transformers.js
  for React Native" — it wraps `onnxruntime-react-native` and mirrors some
  of the HF API shape. However: **it is explicitly archived/deprecated as of
  July 2025** ("no longer actively maintained"), and — critically — **it only
  supports text generation and text-embedding models** (Llama-160M,
  Phi-3-mini, DistilGPT-2, all-MiniLM-L6-v2). No CLIP, no image models at
  all. Ruled out on both maintenance status and capability grounds.
- Conclusion: there is no path to reuse ticket 010's exact backend module
  (`local-food-recognition.js`, `@huggingface/transformers`) unchanged on
  mobile. Any mobile on-device implementation is a **rewrite** against a
  different runtime, not a port.

### Alternative RN ML runtimes surveyed

| Package | Version (npm view) | Maintenance | Expo compatibility | CLIP / zero-shot support |
|---|---|---|---|---|
| `onnxruntime-react-native` | 1.24.3 (published 2026-07-16) | Active (Microsoft) | Custom dev client / prebuild required, not Expo Go — DOCUMENTED, matches community reports | Raw ONNX tensors only; no CLIP-specific pre/post-processing shipped — you build the pipeline yourself |
| `react-native-fast-tflite` | 3.0.1 | Active (Marc Rousavy / mrousavy), depends on `react-native-nitro-modules` (peer dep, verified via `npm view`) | Requires prebuild if not already in native manifest (per its own GitHub issue #6 on Expo) — custom dev client needed | Runs `.tflite` models generically (JSI zero-copy buffers); **no CLIP-specific pipeline** — would need a CLIP model *converted to TFLite* (not the ONNX files ticket 010 uses) plus hand-written pre/post-processing, same rewrite cost as the ONNX path |
| `react-native-executorch` (software-mansion) | 0.9.3 | Active — 0.8.0 was called "the library's biggest release," ongoing releases past 0.2.x which is now called out as unmaintained in its own docs | Custom dev client (native module), not Expo Go — DOCUMENTED | This is the most promising mobile candidate found: its own docs advertise `useImageEmbeddings`/CLIP-style image+text embedding hooks and dedicated computer-vision docs pages, i.e. some CLIP-shaped support is a first-class, documented feature rather than something you'd hand-build. Not independently tested in this spike (would require an actual Expo dev-client rebuild, out of scope for a doc/data-gathering spike run without device access) |

**Net for mobile**: no candidate lets ticket 010's existing backend code run
unmodified. Every real option (`onnxruntime-react-native` directly,
`react-native-fast-tflite`, or `react-native-executorch`) requires (a) a
native module and therefore an EAS dev-client rebuild — exactly the
ticket-009-precedent deploy step ticket 011 asked to flag explicitly — and
(b) a from-scratch reimplementation of CLIP's pre/post-processing logic,
since none of them run `@huggingface/transformers`'s pipeline API as-is.
`react-native-executorch` looks like the least-worst option on paper (active
maintenance + documented CLIP-shaped embedding support) but this is
**DOCUMENTED, NOT TESTED** — no install/build was attempted against this
project's actual Expo SDK 54 setup.

---

## Q2: What does web actually get?

**VERIFIED — `@huggingface/transformers` genuinely runs a real CLIP
zero-shot-image-classification call in a real headless browser via WASM, no
server involved.** I wrote a throwaway HTML file
(`test.html`, loading `@huggingface/transformers@4.2.0` from the jsDelivr
CDN as an ES module) and drove it with Playwright/Chromium
(`npx playwright install chromium`, fresh throwaway `npm init` in the
scratchpad — nothing installed into the repo). It called
`pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32')`
against a real (trivial 1x1 pixel, since this only needed to prove
mechanics, not re-test accuracy already covered by ticket 010's own spike)
image, with three real candidate labels.

**Real measured numbers from that run:**
- Library import (CDN fetch of the JS module itself): **2.4s**
- Model load (`pipeline()` call, cold — no cache): **14.3s**
- Inference call itself: **0.7s**
- **Total data downloaded for the model: ~153.7MB** (measured via the
  library's own `progress_callback` total-bytes reporting) — this is the
  browser default quantized (`q8`/`uint8`) variant, not the ~606MB fp32
  file ticket 010's backend downloads. transformers.js defaults to `q8` for
  WASM per its own docs, and that default was not overridden in this test.
- Real inference output came back well-formed:
  `[{score: 0.398, label: "a photo of pizza"}, {score: 0.303, label:
  "a photo of sushi"}, {score: 0.299, label: "a photo of a cat"}]` — proving
  the whole pipeline actually executed (a solid-color test image scoring
  all three close together is expected/uninformative, matching ticket 010's
  own precedent of using a synthetic image purely to test mechanics, not
  accuracy).

This directly confirms option (a) from ticket 011's Q2: **web can run a
genuinely on-device path**, no backend call, using the exact same npm
package and exact same model family already validated server-side. This
is a materially different (better) situation than mobile: on web, no native
module, no dev-client rebuild, and (mostly) no rewrite — the same
`pipeline()` API from ticket 010's backend code is directly reusable in a
browser context, modulo needing to swap the file input for
`log.tsx`'s captured photo instead of a data URL constant, and modulo Metro
needing to serve/bundle the model download correctly (this test loaded the
library from a CDN, not from this project's own Metro/webpack bundle — the
model weights themselves are always fetched at runtime from the HF Hub or a
self-hosted CDN either way, they are not bundled into the JS bundle, so
Metro's `assetExts` concern from ticket 011's problem #3 applies far less to
this path than to a `.tflite`/`.onnx` file baked into a mobile binary).

**Not tested**: whether this actually works inside this project's real
Expo-web bundle (Metro's web bundler) as opposed to a bare CDN-loaded HTML
page — that's a materially easier, but still separate, verification a real
implementation attempt would need to do.

---

## Q3: Model size options

**VERIFIED (via Hugging Face Hub API file listing, `curl` against
`huggingface.co/api/models/...`, not just docs)**:

`Xenova/clip-vit-base-patch32` (the exact model ticket 010 already ships),
combined `model.onnx` variants:

| Variant | Size |
|---|---|
| `model.onnx` (fp32 — what ticket 010's backend downloads) | 606MB (matches ticket 010's own outcome doc: 605,799,029 bytes) |
| `model_fp16.onnx` | 304MB |
| `model_q4.onnx` | 189MB |
| `model_quantized.onnx` / `model_uint8.onnx` | 154MB / 153MB — **this is what the Q2 browser test above actually downloaded** |

`Xenova/mobileclip_s1` (Apple's MobileCLIP, ONNX-converted for
transformers.js — a genuinely smaller *architecture*, not just a quantized
version of the same one) — **VERIFIED sizes via the HF Hub API's blob
listing**:

| Component | fp32 | quantized/uint8 |
|---|---|---|
| vision_model | 86.0MB | 22.4MB |
| text_model | 253.9MB | 64.1MB |
| **combined (quantized)** | — | **~86.5MB** |

That's roughly **44% smaller** than `clip-vit-base-patch32`'s quantized
combined size (153MB), for the vision half specifically it's dramatically
smaller (22MB vs the base model's much larger vision-only footprint).

**DOCUMENTED BUT NOT TESTED — accuracy tradeoff**: Apple's own
`apple/ml-mobileclip` GitHub README publishes ImageNet-1k zero-shot top-1
numbers: MobileCLIP-S0 67.8%, S1 72.6%, S2 74.4%, B 76.8%. The README
states MobileCLIP-S0 "obtains similar zero-shot performance as OpenAI's
ViT-B/16 model while being 4.8x faster and 2.8x smaller" (their words, not
independently reproduced here). I did not find a same-source, apples-to-apples
number for `ViT-B/32` (the model ticket 010 actually ships) in the material
I fetched — OpenAI's CLIP paper is widely cited elsewhere as reporting
~63.2% for ViT-B/32 on ImageNet zero-shot, but that figure was **not**
re-verified from a primary source in this spike, so it should be treated as
a plausible reference point, not a confirmed number. Net: MobileCLIP-S1
looks like a real, smaller, plausibly-comparable-or-better-accuracy
candidate, but this spike did not run it and did not verify accuracy
first-hand — only file sizes were empirically confirmed.

**Important nuance found while testing**: `mobileclip_s1`'s own README
(fetched directly) shows usage as **separate manual `CLIPTextModelWithProjection`
/ `CLIPVisionModelWithProjection` calls plus hand-written `softmax`/`dot`
score computation** — not the single-line `pipeline('zero-shot-image-classification',
...)` convenience call ticket 010's backend code currently uses for
`clip-vit-base-patch32`. Swapping to MobileCLIP would require adapting
`local-food-recognition.js`'s call shape, not a drop-in model-ID swap.

---

## Q4: Nutrition data placement

**Recommendation: import `food-nutrition-data.js` as a plain JS constant
directly into the Expo app bundle. Do not bundle a SQLite asset for this.**

Reasoning:
- Read the actual file
  (`backend/src/data/food-nutrition-data.js`): it's a ~36-row, flat array of
  plain objects (`{label, foodName, calories, proteinG, carbsG, fatG,
  servingDescription}`), already generated as ES module `export const`
  syntax — this is directly `import`-able by any JS bundler (Metro
  included) with zero transformation. No native module, no
  `metro.config.js` changes, no `SQLiteProvider`/`assetSource`/
  `importAssetDatabaseAsync` API at all.
- Rough size: 36 rows × ~7 short fields is on the order of a few KB of JS —
  negligible compared to even the smallest CLIP model variant surveyed
  above (86MB). It is not worth introducing `expo-sqlite`'s asset-bundling
  machinery (confirmed present and real at v16.0.10 in this project, so it
  *would* work if needed) for a dataset this small — that complexity earns
  its keep for something like a multi-MB or growing/query-heavy dataset,
  neither of which describes this table today.
- The one reason to prefer SQLite would be if the data needed relational
  querying, migrations, or was expected to grow substantially — none of
  which apply to a static, hand-maintained 36-row reference table per
  ticket 010's own outcome doc.

This is a low-uncertainty recommendation; it does not depend on which
mobile/web runtime decision gets made elsewhere in this ticket.

---

## Q5: Dev-client rebuild implications (if mobile needs a native module)

Confirmed from this project's actual `eas.json`
(`app/eas.json`, read directly): build profiles are `development`
(`developmentClient: true, distribution: "internal"`), `preview`, and
`production` (`autoIncrement: true`). Adding any of the native-module
candidates from Q1 (`onnxruntime-react-native`, `react-native-fast-tflite`,
`react-native-executorch`) would require:

1. Running `npx expo prebuild` (or letting EAS Build do it) so the new
   native module is linked into the generated `ios`/`android` projects —
   this project currently has no committed native project directories
   (confirmed: `ls` of the app root shows no `ios`/`android` folders),
   consistent with a managed-workflow + custom-dev-client setup.
2. A new `eas build --profile development` run to produce an updated
   dev-client binary/APK — the existing installed dev-client APK on any
   test device does **not** contain the new native module until this
   rebuild happens and is reinstalled, exactly matching ticket 011's own
   citation of ticket 009's `expo-image-manipulator` precedent.
3. **DOCUMENTED, consistent with this project's own prior friction (ticket
   010's outcome doc, cited by ticket 011)**: this repo lives in an
   OneDrive-synced Windows path. Ticket 010 already hit real friction from
   this with native/binary build artifacts (`better-sqlite3`,
   `onnxruntime-node` postinstall/native-build steps) during backend work.
   The same class of risk (OneDrive sync interfering with native build
   toolchains, long path issues, file locking during a native build) applies
   at least as much, likely more, to an actual `expo prebuild` + native
   Android/iOS compile step for any of the Q1 candidates — this was not
   re-tested in this spike (no prebuild was actually attempted, correctly
   out of scope for a docs/data-gathering-only spike), but it is a named,
   realistic risk carried over from documented prior experience in this
   exact repo, not a hypothetical.

---

## Summary table: candidate architectures

| Platform | Candidate | Real feasibility | Native/dev-client rebuild? | Code reuse from ticket 010 | Verdict for this spike |
|---|---|---|---|---|---|
| **Web** | `@huggingface/transformers` in-browser via WASM (same package, same model) | **VERIFIED working** — real Playwright/Chromium run, real inference output | No — pure JS/WASM, no native module | High — same `pipeline()` API, same model IDs | **Viable candidate to build a real plan around** |
| **Web** | Same, but with `Xenova/mobileclip_s1` (smaller model) | Sizes VERIFIED (86MB quantized combined vs 153MB); accuracy DOCUMENTED BUT NOT TESTED, and the call shape differs (manual embeddings, not one-line pipeline) | No | Medium — requires adapting `local-food-recognition.js`'s call pattern | Worth a follow-up spike specifically on accuracy, not ruled out |
| **Mobile** | `onnxruntime-react-native` (raw ONNX Runtime) | Package itself DOCUMENTED as actively maintained; requires hand-building CLIP pre/post-processing | Yes — confirmed via docs + community reports | Low — no pipeline API, tensor-level rewrite | Technically possible, high implementation cost |
| **Mobile** | `daviddaytw/react-native-transformers` (HF-style wrapper) | DOCUMENTED — archived/deprecated July 2025, **no image-model support at all** | Yes | None (text-only library) | **Ruled out** — deprecated and lacks CLIP/image support entirely |
| **Mobile** | `react-native-fast-tflite` | DOCUMENTED — actively maintained, generic TFLite runner | Yes | Low — needs a CLIP model converted to `.tflite` (not the ONNX files already on hand) plus hand-written pipeline | Possible but requires a model-format conversion step not yet attempted |
| **Mobile** | `react-native-executorch` | DOCUMENTED — actively maintained, and uniquely among the mobile options has first-class documented CLIP-style image/text embedding hooks | Yes | Low-medium — has a purpose-built API surface for this use case, unlike the other two | **Most promising mobile candidate on paper; not installed or tested — needs a real spike with an actual dev-client rebuild before it can be trusted** |
| **Mobile** | Keep backend HTTP call (ticket 010's existing path), unchanged | Already shipped and working (per ticket 010's own outcome doc) | No | Full | Not "on-device" — but the only mobile option requiring zero new work, and the honest fallback if none of the above prove out |

**Bottom line for whoever writes the follow-up plan**: web has a real,
verified, low-risk on-device path today. Mobile does not — every real
option demands a native module, an EAS dev-client rebuild (with this
project's own previously-documented OneDrive/Windows native-build friction
as a named risk, not resolved here), and a non-trivial rewrite of the
CLIP pipeline logic rather than a reuse of ticket 010's backend code.
`react-native-executorch` is the most promising mobile candidate found but
was not installed or run in this spike. Per ticket 011's own instructions,
this document does not choose an architecture — it hands these tradeoffs
to the next planning step, including the open product question (ticket
011's Q6) of whether mobile keeps calling the existing backend permanently
while only web goes fully on-device.

---

## Follow-up: react-native-executorch mobile spike

This section closes the "not installed or tested" gap left above. Work
happened in a real git worktree
(`.claude/worktrees/foxbite-executorch-spike`, branch
`foxbite-executorch-spike`, off `main`) with the package **actually
installed into `app/package.json`** — not a scratch directory — because
this spike specifically needed to test real Expo/EAS integration
mechanics (autolinking, prebuild, dependency resolution against this
project's real lockfile). No product code in `log.tsx`/`api.ts`/backend
files was touched.

### Step 1 — Install: VERIFIED, resolves cleanly

`npx expo install react-native-executorch` against this project's real
`app/package.json` (Expo SDK `^54.0.0`, React Native `0.81.5`, React
`19.1.0`) **succeeded with no ERESOLVE hard failures**. Resolved version:
`react-native-executorch@0.9.3` (latest at install time), added cleanly to
`package.json`'s dependencies with 5 new packages
(`zod@^4.3.6`, `jsonrepair@^3.12.0`, `jsonschema@^1.5.0`,
`@huggingface/jinja@^0.5.0`, plus the package itself). The only npm
warnings emitted were **pre-existing** `ERESOLVE overriding peer
dependency` noise from `@clerk/expo`/`react-reconciler`/`test-renderer`
version overlaps already present in this project's baseline `npm install`
(reproduced identically before touching executorch at all) — nothing
attributable to the new package. Also installed the two companion packages
its own README's quickstart calls for:
`react-native-executorch-expo-resource-fetcher` and `expo-file-system`
(the project already had `expo-asset`) — both resolved cleanly too, no new
warnings.

Environment note: `npm -v` in this environment is 11.16.0, not the
10.8.2 documented as required for lockfile consistency in the prior
ticket-010-era Android build fix (per memory). The install completed
without a lockfile-format error here, but this mismatch is exactly the
class of thing that memory entry warns bites at `eas build` time, not
`npm install` time — flagging it forward rather than re-litigating it
here, since a real EAS build was not reachable in this environment (see
Step 3).

### Step 2 — Real CLIP API shape: VERIFIED via reading installed source, confirms and sharpens the prior spike's claim

The prior spike's "documented CLIP-style image/text embedding hooks"
claim is **confirmed, but with an important correction**: there is no
`useCLIP` hook and no zero-shot classification helper anywhere in the
package. Read directly from the installed
`node_modules/react-native-executorch/src/`:

- `useImageEmbeddings({ model })` → `forward(imageSource): Promise<Float32Array>` —
  a raw embedding vector, nothing else
  (`src/hooks/computer_vision/useImageEmbeddings.ts`,
  `src/types/imageEmbeddings.ts`).
- `useTextEmbeddings({ model })` → `forward(text): Promise<Float32Array>` —
  same shape, text side (`src/hooks/natural_language_processing/useTextEmbeddings.ts`).
- A separate `useClassification` hook exists
  (`src/types/classification.ts`) but it is **not** CLIP/zero-shot — it
  only supports two fixed models (`efficientnet-v2-s` /
  `-quantized`) against a hardcoded `Imagenet1kLabel` label set. It cannot
  be pointed at arbitrary text labels like "pizza" / "sushi" / "salad",
  so it is not a substitute for CLIP zero-shot classification.
- **There is no `pipeline()`-equivalent, no `classifier(image, labels)`
  call, and no built-in cosine-similarity/softmax helper anywhere in the
  package.** Getting from "food photo in, food label out" requires
  hand-writing: (1) a call to `useImageEmbeddings().forward(photo)`, (2)
  one `useTextEmbeddings().forward(label)` call per candidate food label
  (or precomputing all label embeddings once), (3) manual cosine
  similarity between the image vector and each text vector, (4) manual
  argmax/softmax over the results to pick a winner and a confidence score.

**Direct comparison to ticket 010's actual pipeline call is honest and
unflattering for on-device mobile**: ticket 010's backend does
`await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32')(image, candidateLabels)`
— one call, output is already a sorted, scored label list. The
`react-native-executorch` path is architecturally the same idea (CLIP dual
encoder) but is **materially more custom code**, not a similar shape: it's
closer to MobileCLIP's manual `CLIPTextModelWithProjection`/
`CLIPVisionModelWithProjection` pattern already flagged as a heavier lift
in this doc's Q3 section than to ticket 010's one-liner. Concretely this
means writing and testing, from scratch, the embedding-comparison and
label-scoring logic that `@huggingface/transformers`'s `pipeline()`
currently gives for free.

### Step 3 — `expo prebuild`: VERIFIED succeeds, no OneDrive/path friction observed at this stage

`npx expo prebuild --no-install` completed successfully in the worktree
(itself also under the same OneDrive-synced, space-containing path
structure). It generated a real `android/` directory (Windows can't
generate `ios/` locally without a Mac, so only Android was checked) with
no errors, no EPERM/EBUSY, no path-length failures. **This directly
contradicts the theoretical risk flagged in this doc's Q5 section as
untested** — for the prebuild step specifically, OneDrive did not cause a
problem here. This does **not** clear ticket 010's own documented
native-build friction wholesale: that friction (with `better-sqlite3`,
`onnxruntime-node`) happened during actual native **compilation**
(`node-gyp`/postinstall steps), not during `expo prebuild`'s
templating/config step, and this environment has no Android SDK to
actually run a Gradle compile (see below) — so the compile-time risk is
still genuinely untested, only the prebuild-time risk is now cleared.

Autolinking was independently verified two ways:
1. `npx expo-modules-autolinking resolve --platform android` — does
   **not** list `react-native-executorch` (expected: it is a plain React
   Native community-style native module, not an Expo Module, so it
   doesn't use Expo's own modules-autolinking registry).
2. `npx expo-modules-autolinking react-native-config` — **does** list
   `react-native-executorch` correctly (root path, `.podspec`, version
   `0.9.3` all resolved), confirming the project's Gradle/CocoaPods
   autolinking (wired through `expoAutolinking.rnConfigCommand` in the
   generated `android/settings.gradle`) will pick it up as a native
   dependency at build time, same mechanism as this project's other
   native modules (`react-native-svg`, `react-native-reanimated`, etc.).

**Not attempted, and explicitly reported rather than skipped**: an actual
EAS **local** build (`eas build --profile development --platform android
--local`). This environment has no `ANDROID_HOME`/`ANDROID_SDK_ROOT`, no
`adb`, no `gradle` on PATH, and no Xcode (Windows). `npx eas-cli` itself
is fetchable (`eas-cli@22.0.0` resolved via npx), but a local build
requires the Android SDK/NDK toolchain physically installed, which is
absent here — so whether the actual native Gradle compile succeeds under
this OneDrive path (where ticket 010's real friction lived) remains
genuinely unverified. A cloud `eas build --profile development
--platform android` run was not attempted either, since that requires
this project's real EAS account/credentials and consumes a real build
credit — out of scope for a spike without explicit sign-off to spend that.

### Step 4 — Model format: VERIFIED — pre-converted CLIP `.pte` files exist, no conversion needed

`react-native-executorch` requires ExecuTorch's `.pte` format, confirmed
by reading `src/constants/modelUrls.ts`/`modelRegistry.ts` directly. It
ships a **ready-to-use, pre-converted CLIP ViT-B/32** (the exact same base
architecture ticket 010 already uses) — no Python export step needed for
this specific model. Verified real hosted file sizes via `curl -I` against
the actual Hugging Face-hosted URLs the library's own source code
constructs (`software-mansion/react-native-executorch-clip-vit-base-patch32`,
confirmed via that repo's HF API file listing too):

| File | Size |
|---|---|
| `clip_vit_base_patch32_image_xnnpack_fp32.pte` | 351,606,400 bytes (~335MB) |
| `clip_vit_base_patch32_image_xnnpack_int8.pte` (quantized) | 96,351,232 bytes (~92MB) |
| `clip_vit_base_patch32_text_xnnpack_fp32.pte` | 253,953,152 bytes (~242MB) — **no quantized text variant is offered**, only fp32 |
| `tokenizer.json` | present, small |

Usage is via the library's own model registry helpers —
`models.image_embedding.clip_vit_base_patch32_image()` and
`models.text_embedding.clip_vit_base_patch32_text()` — both real,
resolvable exports confirmed in `src/constants/modelRegistry.ts`.

Two things worth flagging for whoever plans this next: (1) the text tower
alone (242MB, fp32-only) is not much smaller than the entire quantized
image+text combo the web spike already validated (~153MB total, Q3
above), so a naive "quantized image + fp32 text" mobile bundle would
download **~92MB + 242MB ≈ 334MB total**, i.e. more data than
`clip-vit-base-patch32`'s single combined *fp32* ONNX file (606MB is still
larger, but ~334MB is not a clear win over just using the web-verified
153MB combined-quantized ONNX path); and (2) since text embeddings for a
short, fixed label set can be precomputed once and cached, the "234MB text
tower download" cost may only need to be paid once per device, not per
inference — this matters for a real cost/UX tradeoff but wasn't modeled
further here (out of scope for this spike).

### Step 5 — Maintenance signals: VERIFIED, strong

Checked directly via `npm view` and the GitHub API (not just docs
claims):

- **npm**: `react-native-executorch@0.9.3`, published **1 week before**
  this spike (2026-08-16); maintainers listed as `swm-bot` and a named
  Software Mansion engineer (`msluszniak`); an `executorch-nightly`
  dist-tag exists and is actively updated (`0.10.0-nightly-2558259-...`
  timestamped the same day as this spike), indicating a live, fast-moving
  release cadence, not an abandoned project.
- **GitHub** (`software-mansion/react-native-executorch`, via
  `api.github.com`): **1,687 stars, 93 forks, 61 open issues, not
  archived, `pushed_at` 2 days before this spike.** Software Mansion is a
  well-known, credible React Native ecosystem contributor — they
  already maintain two libraries this project directly depends on
  (`react-native-reanimated`, `react-native-screens`, both in
  `app/package.json`), which is a meaningfully stronger maintenance
  signal than an unfamiliar or single-maintainer project would be.
- **Compatibility table** (fetched from
  `docs.swmansion.com/react-native-executorch/docs/next/other/compatibility`):
  explicitly lists **React Native 0.81 and Expo SDK 54 as supported** by
  both the 0.8.x and 0.9.x release lines — this project's exact versions,
  not an approximation.
- **Hard requirement confirmed**: the package's own README states it
  "supports only the New React Native architecture" and requires iOS 17+
  / Android 13+. This project already has the New Architecture enabled by
  default (confirmed via `npx expo config --type introspect`, which shows
  `RCTNewArchEnabled: true`), so this requirement is already satisfied —
  it is not a blocker, but it is a hard floor worth naming (any device
  below Android 13 / iOS 17 is unsupported outright, unlike ticket 010's
  server-side path which has no such device-side floor).

### Cleanup decision

**The worktree was left in place**, not removed:
`.claude/worktrees/foxbite-executorch-spike` (branch
`foxbite-executorch-spike`, based on `main`), with
`react-native-executorch`, `react-native-executorch-expo-resource-fetcher`,
and `expo-file-system` installed into `app/package.json`, and `expo
prebuild`'s generated `android/` directory present. This is left as real
groundwork rather than cleaned up: the install and prebuild are the
expensive, now-already-verified steps of any future implementation
attempt, and per this spike's own instructions leaving it in place is
preferred when "the install got far enough to be useful groundwork" — it
did. Nothing here was merged to `main` and no product code changed.

### Go/no-go recommendation for `react-native-executorch` as ticket 011's mobile runtime

**Conditional go — technically sound and well-supported, but budget for
a real rewrite, not a port, and the actual native-compile step is still
unverified.**

Reasons for "go":
- Install, dependency resolution, and `expo prebuild` all **VERIFIED**
  clean against this project's real SDK 54 / RN 0.81 setup — no version
  conflicts, no OneDrive/path failures at this stage.
- A ready-to-use, pre-converted CLIP ViT-B/32 `.pte` model **VERIFIED**
  to exist and be hosted — zero Python/ML conversion tooling required for
  the base case.
- Maintenance signals are **VERIFIED strong**: Software Mansion, active
  weekly releases, 1.6k+ GitHub stars, not archived, explicit SDK
  54/RN 0.81 support in its own compatibility table.

Reasons for "conditional," not unconditional:
- The CLIP API is **raw embeddings only** — confirmed no zero-shot
  classification helper exists. This is a genuine rewrite of the
  label-scoring logic ticket 010's `pipeline()` call currently provides
  for free, not a drop-in swap. Plan implementation time accordingly.
- The actual native Gradle/Android compile step — where ticket 010's
  real OneDrive friction previously lived — was **not reachable in this
  environment** (no Android SDK) and remains genuinely untested. The next
  step before committing to this path should be a real
  `eas build --profile development --platform android` (cloud, using a
  real build credit) or a local build on a machine with the Android SDK
  installed, specifically watching for OneDrive-path native-compile
  issues.
- Device floor (Android 13+/iOS 17+, New Architecture only) is
  satisfied by this project today but is a permanent constraint the
  server-side path doesn't have.
- Total download footprint for the two `.pte` files
  (~92MB quantized image + 242MB fp32-only text = ~334MB) is not
  obviously better than the web path's already-verified 153MB combined
  quantized ONNX bundle — worth factoring into ticket 011's Q6 tradeoff
  between mobile-native vs. keeping mobile on the backend call.
