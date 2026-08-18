// Native/mobile food-recognition module (ticket 016). Replaces ticket 014's
// thin `api.analyzePhoto()` passthrough with fully on-device inference via
// `react-native-fast-tflite`, running the bundled Google AIY
// `vision-classifier-food-v1` model (app/assets/models/food_classifier.tflite,
// Apache 2.0, 2,024-class taxonomy incl. a `__background__` non-food class —
// see docs/tickets/016-...md's "Model selection" section) entirely offline.
// No network call to POST /food/analyze happens for this path anymore.
//
// food-recognition.web.ts (still CLIP-via-WASM, ticket 011/014) is
// deliberately untouched by this ticket — this file only ever affects the
// native/mobile build.
//
// THREAT MODEL (restated verbatim-in-spirit from the ticket, not a
// paraphrase — see this ticket's outcome doc for the full disclosure): this
// module does NOT enforce a hard paywall boundary around scan execution.
// Once the model file and the JSI execution engine are bundled inside the
// app binary, a determined user can reverse-engineer the binary, strip the
// `assertActiveAccess()` check below, and run the local model offline
// indefinitely without an active subscription. `assertActiveAccess()`
// remains an app-level product gate (same UX as today), not a technical
// guarantee that scan execution is unbypassable.
import * as api from './api';
import { decodeBase64ToUint8Array } from './base64';
import { classifyFoodClassifierOutput } from './food-classifier-shared';
import type { FoodAnalysisResult } from './food-recognition-shared';

// The model's fixed square input resolution (ticket 016's Model selection
// section: Google AIY `vision-classifier-food-v1`, MobileNetV1, 192x192
// input) — not derived from the model file at runtime, since
// react-native-fast-tflite's `Tensor` metadata (see below) only exposes
// dtype/shape/name, and reading `inputs[0].shape` at call time to derive
// this would just move a compile-time-knowable constant into a runtime
// lookup for no benefit.
const MODEL_INPUT_SIZE = 192;

type TFLiteModule = typeof import('react-native-fast-tflite');
type TensorflowModel = import('react-native-fast-tflite').TensorflowModel;

// Same module-scope try/catch pattern as speech-recognition.ts, and for the
// identical reason (documented there in full): Expo Router eagerly requires
// every route file to build its route tree, and log.tsx statically imports
// this module, so a plain top-level `import` here would crash the whole Log
// tab on any build where `react-native-fast-tflite`'s native Nitro module
// isn't linked (bare Expo Go, or a dev-client APK built before this
// dependency was added) — this project has already been bitten by that
// exact failure class once (ticket 007). Requiring inside a `try` at module
// scope, once, means that throw is caught here instead of taking down the
// route tree.
let tfliteModule: TFLiteModule | null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  tfliteModule = require('react-native-fast-tflite') as TFLiteModule;
} catch {
  tfliteModule = null;
}

export const isOnDeviceModelAvailable = tfliteModule !== null;

// Memoized across calls within a JS session — loading a ~21MB bundled model
// file and constructing the TFLite interpreter is not free, and nothing
// about the model changes between scans, so every call after the first
// reuses the same loaded model instead of reloading it per photo.
let modelPromise: Promise<TensorflowModel> | null = null;

function getModel(): Promise<TensorflowModel> {
  if (!tfliteModule) {
    return Promise.reject(new Error('react-native-fast-tflite native module is not available'));
  }
  if (!modelPromise) {
    // `require(...)` of the `.tflite` file itself (not the npm package) —
    // this is Metro's asset-require mechanism, resolved at bundle time into
    // an asset module id. Requires metro.config.js's `assetExts` to include
    // `'tflite'` (ticket 016) or this throws a JSON/JS parse error instead
    // of returning an asset reference.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    modelPromise = tfliteModule.loadTensorflowModel(require('../../assets/models/food_classifier.tflite'), []);
  }
  return modelPromise;
}

// Ticket 016's client-side billing pre-check — the on-device model runs
// with zero network call, which would otherwise silently remove the
// backend's only enforcement point (`requireActiveAccess` on
// POST /food/analyze) for the 30-day trial -> subscription gate. Identical
// approach and identical fail-closed behavior to
// food-recognition.web.ts's `assertActiveAccess()` (ticket 011) — see that
// file's comment for the full rationale; duplicated here rather than
// shared because the two platforms' modules are intentionally independent
// (this file must keep working even if food-recognition.web.ts's approach
// changes, and vice versa).
async function assertActiveAccess(): Promise<void> {
  let billing: api.BillingStatus;
  try {
    billing = await api.getBillingStatus();
  } catch {
    throw new api.ApiError(0, "Couldn't check your subscription — try again when you're back online.");
  }
  if (billing.status === 'expired') {
    throw new api.ApiError(402, 'Your free trial has ended', { error: 'Your free trial has ended', billing });
  }
}

// Resizes the captured photo to the model's fixed 192x192 input (via
// expo-image-manipulator, already a dependency of image-prep.ts) and
// decodes the resulting JPEG bytes into a flat RGB pixel buffer (via
// jpeg-js, a pure-JS decoder — no additional native module, so nothing new
// for this function's own try/catch to guard against beyond
// expo-image-manipulator's native module itself).
//
// Deliberately requires both `expo-image-manipulator` and `jpeg-js` lazily,
// inside this function, not at module scope — same reasoning as
// image-prep.ts's own lazy require of `expo-image-manipulator` (see that
// file's C1 comment): a dev-client build predating this dependency would
// otherwise crash at import time instead of being caught here. Note
// image-prep.ts's own `prepareImageForUpload()` call (already run on this
// same photo, earlier in log.tsx's pickAndAnalyze) swallows its own
// manipulator failures internally and falls back to the original photo, so
// by the time control reaches here we cannot assume the manipulator
// already succeeded once this session — it must be treated as
// independently fallible every time.
async function decodeToRgbPixels(uri: string): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ImageManipulator, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const jpeg = require('jpeg-js') as typeof import('jpeg-js');

  const resized = await ImageManipulator.manipulate(uri)
    .resize({ width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE })
    .renderAsync();
  const saved = await resized.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true });
  if (!saved.base64) {
    throw new Error('expo-image-manipulator did not return base64 image data');
  }

  const jpegBytes = decodeBase64ToUint8Array(saved.base64);
  // `formatAsRGBA: false` gives 3 bytes/pixel (no alpha) — matches the
  // model's expected 192x192x3 input exactly, with no channel-stripping
  // step needed afterward.
  const decoded = jpeg.decode(jpegBytes, { useTArray: true, formatAsRGBA: false });

  if (decoded.width !== MODEL_INPUT_SIZE || decoded.height !== MODEL_INPUT_SIZE) {
    throw new Error(
      `Resized photo decoded to ${decoded.width}x${decoded.height}, expected ${MODEL_INPUT_SIZE}x${MODEL_INPUT_SIZE}`
    );
  }

  return decoded.data;
}

// Builds the model's input ArrayBuffer from raw RGB pixel bytes, honoring
// whatever input dtype the loaded model actually reports rather than
// assuming one. Ticket 016's Model selection section: this specific model
// takes "raw uint8 pixels in, dequantized internally" — so the expected,
// common case is `pixels` copied in as-is (0-255 uint8, no normalization).
// The float32 branch below is a defensive fallback for a differently
// exported build of the same model, not the expected path for the file
// actually bundled here.
//
// NOT verified on a real device/interpreter (see this ticket's outcome doc)
// — `react-native-fast-tflite`'s `Tensor` type exposes only
// `{ name, dataType, shape }`, with no quantization scale/zero-point, so
// there is no way to derive the exact expected byte layout from this
// library's public API alone short of running it on real hardware.
function buildInputBuffer(pixels: Uint8Array, dataType: string): ArrayBuffer {
  if (dataType === 'uint8') {
    // Copy into a fresh buffer sized exactly to the pixel data — `pixels`
    // may be a view into a larger underlying buffer (jpeg-js's internal
    // allocation), so `.buffer` alone would be the wrong size/offset.
    return pixels.slice().buffer;
  }
  if (dataType === 'float32') {
    const floats = new Float32Array(pixels.length);
    for (let i = 0; i < pixels.length; i++) {
      floats[i] = pixels[i] / 255;
    }
    return floats.buffer;
  }
  throw new Error(`Unsupported model input tensor type: ${dataType}`);
}

// Converts the model's raw output tensor into a same-length array of
// per-class scores in the FOOD_CLASSIFIER_LABELS index order, ready for
// classifyFoodClassifierOutput(). See buildInputBuffer()'s comment above —
// the same "not verified on real hardware" caveat applies here for the
// uint8 branch's dequantization: absent scale/zero-point metadata from this
// library, uint8 output is assumed to be a linear encoding of a [0, 1]
// probability into [0, 255] (score = byte / 255), which is the common
// convention for a fully-quantized classifier's final softmax layer but is
// an assumption, not something confirmed against this exact model file.
function decodeOutputScores(buffer: ArrayBuffer, dataType: string): number[] {
  if (dataType === 'float32') {
    return Array.from(new Float32Array(buffer));
  }
  if (dataType === 'uint8') {
    return Array.from(new Uint8Array(buffer), (byte) => byte / 255);
  }
  throw new Error(`Unsupported model output tensor type: ${dataType}`);
}

function toPhotoAnalysis(result: FoodAnalysisResult): api.PhotoAnalysis {
  if (!result.foodName) return { items: [] };
  return {
    items: [
      {
        foodName: result.foodName,
        // This model gives no portion/serving estimate of its own (it's a
        // single-label classifier, not a vision-language model) — left
        // blank rather than fabricating one, same convention
        // food-recognition.web.ts's toPhotoAnalysis() already uses for its
        // own single-result CLIP path.
        portionDescription: '',
        calories: result.calories,
        proteinG: result.proteinG,
        carbsG: result.carbsG,
        fatG: result.fatG,
        confidence: result.confidence,
        notes: result.notes,
        caveat: result.caveat ?? null,
      },
    ],
  };
}

export async function classifyFoodPhoto(photo: { uri: string; name: string; type: string }): Promise<api.PhotoAnalysis> {
  await assertActiveAccess();

  let scores: number[];
  try {
    const model = await getModel();
    const pixels = await decodeToRgbPixels(photo.uri);

    const inputDataType = model.inputs[0]?.dataType;
    const outputDataType = model.outputs[0]?.dataType;
    if (!inputDataType || !outputDataType) {
      throw new Error('Loaded model reported no input/output tensor metadata');
    }

    const inputBuffer = buildInputBuffer(pixels, inputDataType);
    const [outputBuffer] = await model.run([inputBuffer]);
    if (!outputBuffer) {
      throw new Error('Model produced no output tensor');
    }
    scores = decodeOutputScores(outputBuffer, outputDataType);
  } catch (err) {
    throw new api.ApiError(
      0,
      'Could not classify this photo — try again.',
      { originalError: err instanceof Error ? err.message : String(err) }
    );
  }

  return toPhotoAnalysis(classifyFoodClassifierOutput(scores));
}

export type ModelLoadProgress =
  | { status: 'downloading'; progress: number }
  | { status: 'ready' }
  | { status: 'error'; message: string };

// The bundled model has no cold network-download step (it ships inside the
// app binary, loaded via Metro's asset system) — there is nothing
// analogous to food-recognition.web.ts's CDN-download progress to report,
// so this stays the same permanent no-op ticket 011/014's native module
// already used, kept only so log.tsx can call the same function on both
// platforms with no Platform.OS check.
export function onModelLoadProgress(_callback: (progress: ModelLoadProgress) => void): () => void {
  return () => {};
}
