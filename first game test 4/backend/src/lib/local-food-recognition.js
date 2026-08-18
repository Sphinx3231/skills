// DEPRECATED-IN-PLACE (ticket 019, engine reconciliation audit). This is
// the backend's own copy of the local CLIP zero-shot classifier (ticket
// 010/011) — a separate implementation from `app/src/lib/food-recognition.web.ts`,
// which runs its own in-browser copy of CLIP independently and is still
// live. This backend copy has had no live caller since ticket 014 reverted
// `POST /food/analyze` to Claude vision; ticket 017 removed the boot-time
// `getClassifier()` warm-up this module used to receive. See
// `local-food-analysis.js`'s matching comment (its sole caller in this
// codebase) for the full keep/delete reasoning and the safe-to-delete
// condition — repeated in full there rather than summarized here so either
// file read alone gives a complete picture.
import os from "node:os";
import path from "node:path";
import { CANDIDATE_LABELS } from "./food-candidate-labels.js";

// Cache-dir relocation (plan Step 0 item 5): @huggingface/transformers has
// no env-var-based cache override (an earlier draft of this plan assumed
// `HF_HOME` would work — checked directly against the installed
// @huggingface/transformers@4.2.0's src/env.js and that's wrong: this
// library reads a programmatic `env.cacheDir` property, defaulting to
// `<package-dir>/.cache/` inside node_modules, per
// src/utils/cache.js:`new FileCache(file_cache_dir ?? env.cacheDir)`. So the
// relocation has to happen by importing the library's `env` singleton and
// setting `env.cacheDir` before the first `pipeline()` call, not via an
// environment variable read at process start.
//
// The chosen location is outside node_modules (survives `npm ci`, which
// wipes node_modules) and outside this repo's OneDrive-synced working tree
// (avoids native-binding + on-demand-sync friction) — LOCALAPPDATA on
// Windows, XDG_CACHE_HOME on Linux, os.tmpdir() as a last-resort fallback.
// FOXBITE_HF_CACHE_DIR is available for tests/ops to override explicitly.
export function resolveModelCacheDir() {
  if (process.env.FOXBITE_HF_CACHE_DIR) return process.env.FOXBITE_HF_CACHE_DIR;
  const base = process.env.LOCALAPPDATA || process.env.XDG_CACHE_HOME || os.tmpdir();
  return path.join(base, "foxbite", "hf-cache");
}

let classifierPromise = null;

// `pipelineFactory` defaults to a lazy dynamic import of the real
// transformers pipeline, NOT a static top-level import. A static
// `import { pipeline } from '@huggingface/transformers'` at module scope
// would pull onnxruntime-node's native binding and sharp into ANY test
// process that merely imports this file, regardless of whether the test
// ever calls getClassifier(). The dynamic import inside this default
// factory only runs when the function is actually invoked — tests avoid it
// entirely by passing their own fake pipelineFactory into
// getClassifier()/classifyFoodPhoto().
async function defaultPipeline(...args) {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = resolveModelCacheDir();
  return pipeline(...args);
}

export function getClassifier(pipelineFactory = defaultPipeline) {
  if (!classifierPromise) {
    classifierPromise = pipelineFactory(
      "zero-shot-image-classification",
      "Xenova/clip-vit-base-patch32"
    );
  }
  return classifierPromise;
}

const PROMPTS = CANDIDATE_LABELS.map((l) => l.prompt);

// Confirmed against @huggingface/transformers@4.2.0's actual source
// (RawImage.read / RawImage.fromBlob) during Step 0: it accepts a
// string|URL, an HTMLCanvasElement (browser-only), or a Blob — not a raw
// Buffer or file path. multer's memory storage gives us a Buffer
// (`req.file.buffer`), so it's wrapped in a Blob here rather than round-
// tripping through a temp file. Output is `[{label, score}, ...]`, sorted
// descending by score (confirmed directly against
// ZeroShotImageClassificationPipeline._call in
// src/pipelines/zero-shot-image-classification.js).
//
// Correction to the plan's Step 2 code sketch, caught by reading that same
// source file: the pipeline's real signature is
// `classifier(images, candidate_labels, { hypothesis_template }?)`, and it
// substitutes each candidate label into `hypothesis_template` (default
// `'This is a photo of {}'`) itself — candidate_labels are NOT passed to the
// model verbatim. Since CANDIDATE_LABELS[].prompt is already a complete
// sentence ("a photo of pizza", or a full anchor sentence), passing the
// default template would have double-wrapped every prompt into nonsense
// like "This is a photo of a photo of pizza". `hypothesis_template: '{}'`
// makes the template a pure passthrough so PROMPTS are sent to the model
// exactly as written, which is what CANDIDATE_LABELS' single-source-of-
// truth design (Step 0 item 1) requires.
export async function classifyFoodPhoto(buffer, mimetype, pipelineFactory) {
  const classifier = await getClassifier(pipelineFactory);
  const blob = new Blob([buffer], { type: mimetype });
  return classifier(blob, PROMPTS, { hypothesis_template: "{}" });
}
