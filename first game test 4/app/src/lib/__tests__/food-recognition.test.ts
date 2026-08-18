// Native/mobile on-device food-recognition module (ticket 016). This file
// exercises the "model successfully loaded and linked" path — see
// food-recognition-model-unavailable.test.ts (a separate file, same reason
// log-no-speech.test.tsx is separate from log.test.tsx: a from-scratch
// module registry is the only way to also cover the "native module isn't
// linked at all" path without fighting one file's hoisted jest.mock calls).
import * as api from '../api';
import { FOOD_CLASSIFIER_LABELS, BACKGROUND_CLASS_INDEX } from '../food-classifier-labelmap';
import { NO_MACROS_CAVEAT } from '../food-classifier-shared';

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  getBillingStatus: jest.fn(),
}));
const mockedApi = api as jest.Mocked<typeof api>;

// Jest has no transform for `.tflite` binaries (jest-expo's asset-extension
// allowlist doesn't include it — see metro.config.js's own comment on why
// this project needed one at all). `virtual: true` lets us mock this exact
// relative specifier without Jest needing to actually read/transform the
// real 21MB binary file on disk.
jest.mock('../../../assets/models/food_classifier.tflite', () => 999, { virtual: true });

const mockLoadTensorflowModel = jest.fn();
jest.mock('react-native-fast-tflite', () => ({
  loadTensorflowModel: (...args: unknown[]) => mockLoadTensorflowModel(...args),
}));

const mockManipulate = jest.fn();
const mockSaveAsync = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: (...args: unknown[]) => mockManipulate(...args) },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

const mockJpegDecode = jest.fn();
jest.mock('jpeg-js', () => ({
  decode: (...args: unknown[]) => mockJpegDecode(...args),
}));

import { classifyFoodPhoto, isOnDeviceModelAvailable, onModelLoadProgress } from '../food-recognition';

const photo = { uri: 'file:///cache/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' };

// See food-classifier-shared.test.ts for why this labelmap has no bare
// 'Pizza' entry — index 500 is just a stable, known-non-background index.
const PIZZA_INDEX = 500;
const PIZZA_NAME = FOOD_CLASSIFIER_LABELS[PIZZA_INDEX];
const NUM_CLASSES = FOOD_CLASSIFIER_LABELS.length;

// See food-classifier-shared.test.ts's scoresWith() comment: a flat,
// all-zero baseline ties `__background__` (index 0) for last place with
// every un-overridden class, and a stable sort's tie-breaking then puts it
// in the TOP_K_BACKGROUND_CHECK window by sort-order accident rather than
// because a test actually put it there. A strictly-increasing baseline
// avoids that.
function scoresWith(overrides: Record<number, number>): number[] {
  const scores = FOOD_CLASSIFIER_LABELS.map((_, i) => i * 1e-7);
  for (const [index, score] of Object.entries(overrides)) scores[Number(index)] = score;
  return scores;
}

function activeBilling(): api.BillingStatus {
  return { status: 'active', trialEndsAt: '2026-01-01T00:00:00.000Z', daysLeft: 0 };
}
function trialingBilling(): api.BillingStatus {
  return { status: 'trialing', trialEndsAt: '2026-01-01T00:00:00.000Z', daysLeft: 10 };
}
function expiredBilling(): api.BillingStatus {
  return { status: 'expired', trialEndsAt: '2026-01-01T00:00:00.000Z', daysLeft: 0 };
}

// A stable mock model object reused across tests (mutated per test, not
// reloaded) — matches real behavior: food-recognition.ts memoizes the
// loaded model across calls, so exercising "different scores per test" is
// done by changing what `run()` resolves to and the reported input/output
// dtypes, not by reloading the model itself.
const mockRun = jest.fn();
const mockModel = {
  inputs: [{ name: 'input', dataType: 'uint8', shape: [1, 192, 192, 3] }],
  outputs: [{ name: 'output', dataType: 'float32', shape: [1, NUM_CLASSES] }],
  run: mockRun,
};

function setOutputScores(scores: number[], dataType: 'float32' | 'uint8' = 'float32') {
  mockModel.outputs[0].dataType = dataType;
  const buffer =
    dataType === 'float32'
      ? Float32Array.from(scores).buffer
      : Uint8Array.from(scores.map((s) => Math.round(s * 255))).buffer;
  mockRun.mockResolvedValue([buffer]);
}

function makeManipulateChain() {
  const context: any = {
    resize: jest.fn(() => context),
    renderAsync: jest.fn(async () => ({
      width: 192,
      height: 192,
      saveAsync: mockSaveAsync,
    })),
  };
  return context;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadTensorflowModel.mockResolvedValue(mockModel);
  // Reassign the whole arrays, not just mutate index 0 — some tests (e.g.
  // "no input/output tensor metadata") replace `mockModel.inputs` with an
  // empty array entirely, and this needs to restore a real entry before
  // the next test rather than throwing on `mockModel.inputs[0]`.
  mockModel.inputs = [{ name: 'input', dataType: 'uint8', shape: [1, 192, 192, 3] }];
  mockModel.outputs = [{ name: 'output', dataType: 'float32', shape: [1, NUM_CLASSES] }];
  mockManipulate.mockReturnValue(makeManipulateChain());
  mockSaveAsync.mockResolvedValue({ uri: 'file:///cache/resized.jpg', width: 192, height: 192, base64: 'ZmFrZQ==' });
  mockJpegDecode.mockReturnValue({ width: 192, height: 192, data: new Uint8Array(192 * 192 * 3).fill(10) });
  setOutputScores(scoresWith({ [PIZZA_INDEX]: 0.99 }));
  mockedApi.getBillingStatus.mockResolvedValue(activeBilling());
});

describe('isOnDeviceModelAvailable', () => {
  test('is true when react-native-fast-tflite is linked (mocked as available here)', () => {
    expect(isOnDeviceModelAvailable).toBe(true);
  });
});

describe('classifyFoodPhoto (native, on-device model)', () => {
  // Deliberately the FIRST test in this describe block: food-recognition.ts
  // memoizes the loaded model in a module-scope variable that survives for
  // the lifetime of this whole test file (jest.clearAllMocks() in
  // beforeEach resets call counts/mock implementations, but not that
  // module-scope cache) — so this assertion is only meaningful before any
  // other test in this file has already triggered a load.
  test('loads the model only once across multiple scans (memoized)', async () => {
    await classifyFoodPhoto(photo);
    await classifyFoodPhoto(photo);

    expect(mockLoadTensorflowModel).toHaveBeenCalledTimes(1);
  });

  test('a clear high-confidence match produces a single-item PhotoAnalysis with no macro data', async () => {
    const result = await classifyFoodPhoto(photo);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].foodName).toBe(PIZZA_NAME);
    expect(result.items[0].confidence).toBe('high');
    expect(result.items[0].calories).toBe(0);
    expect(result.items[0].proteinG).toBe(0);
    expect(result.items[0].carbsG).toBe(0);
    expect(result.items[0].fatG).toBe(0);
    expect(result.items[0].portionDescription).toBe('');
    expect(result.items[0].caveat).toBe(NO_MACROS_CAVEAT);
  });

  test('makes no network call to POST /food/analyze — api.analyzePhoto is never touched by this module', async () => {
    const analyzePhotoSpy = jest.spyOn(api, 'analyzePhoto');
    await classifyFoodPhoto(photo);
    expect(analyzePhotoSpy).not.toHaveBeenCalled();
  });

  test('a background-class top-1 (non-food photo) produces zero items, not a fabricated result', async () => {
    setOutputScores(scoresWith({ [BACKGROUND_CLASS_INDEX]: 0.95 }));

    const result = await classifyFoodPhoto(photo);

    expect(result.items).toEqual([]);
  });

  test('correctly decodes a uint8-quantized output tensor (score = byte / 255), not just float32', async () => {
    // A real uint8 byte array only has 256 distinct possible values across
    // 2,024 classes, so scoresWith()'s usual tiny strictly-increasing
    // baseline collapses to a mass tie at byte 0 once rounded — including
    // `__background__` (index 0), which a stable sort's tie-break would
    // then place right behind the real top scorer purely by index order.
    // Giving two other, non-background classes distinctly higher (but
    // still non-winning) bytes than everything else keeps `__background__`
    // out of the TOP_K_BACKGROUND_CHECK window here, so this test is
    // actually exercising the uint8-decode arithmetic, not accidentally
    // re-triggering the background-near-top defensive branch that
    // food-classifier-shared.test.ts already covers directly.
    setOutputScores(
      scoresWith({ [PIZZA_INDEX]: 0.8, [PIZZA_INDEX + 1]: 0.1, [PIZZA_INDEX + 2]: 0.05 }),
      'uint8'
    );

    const result = await classifyFoodPhoto(photo);

    expect(result.items[0].foodName).toBe(PIZZA_NAME);
    expect(result.items[0].confidence).toBe('high');
  });

  test('feeds raw 0-255 pixel bytes straight through for a uint8 input tensor (no normalization)', async () => {
    mockModel.inputs[0].dataType = 'uint8';
    const pixelBytes = new Uint8Array(192 * 192 * 3).fill(200);
    mockJpegDecode.mockReturnValue({ width: 192, height: 192, data: pixelBytes });

    await classifyFoodPhoto(photo);

    const [inputBuffers] = mockRun.mock.calls[0];
    const fedBytes = new Uint8Array(inputBuffers[0]);
    expect(fedBytes[0]).toBe(200);
    expect(fedBytes.length).toBe(192 * 192 * 3);
  });

  test('normalizes pixel bytes to 0-1 floats for a float32 input tensor', async () => {
    mockModel.inputs[0].dataType = 'float32';
    const pixelBytes = new Uint8Array(192 * 192 * 3).fill(255);
    mockJpegDecode.mockReturnValue({ width: 192, height: 192, data: pixelBytes });

    await classifyFoodPhoto(photo);

    const [inputBuffers] = mockRun.mock.calls[0];
    const fedFloats = new Float32Array(inputBuffers[0]);
    expect(fedFloats[0]).toBeCloseTo(1, 5);
  });

  test('an expired-trial user is blocked before the model is ever loaded', async () => {
    mockedApi.getBillingStatus.mockResolvedValue(expiredBilling());

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      status: 402,
      body: { billing: expiredBilling() },
    });
    expect(mockLoadTensorflowModel).not.toHaveBeenCalled();
  });

  test('REGRESSION: a trialing (not-yet-expired) user is NOT blocked', async () => {
    mockedApi.getBillingStatus.mockResolvedValue(trialingBilling());

    await expect(classifyFoodPhoto(photo)).resolves.toBeDefined();
  });

  test('checks billing status on every call, not just once', async () => {
    await classifyFoodPhoto(photo);
    await classifyFoodPhoto(photo);

    expect(mockedApi.getBillingStatus).toHaveBeenCalledTimes(2);
  });

  test('fails closed with an honest, network-specific message if the billing check itself throws — does not fall through to running the model', async () => {
    mockedApi.getBillingStatus.mockRejectedValue(new Error('network down'));

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      message: expect.stringMatching(/couldn't check your subscription/i),
    });
    expect(mockLoadTensorflowModel).not.toHaveBeenCalled();
  });

  test('an image-decode failure surfaces an honest, non-"server" error message', async () => {
    mockJpegDecode.mockReturnValue({ width: 100, height: 100, data: new Uint8Array(100 * 100 * 3) });

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      message: expect.stringMatching(/could not classify this photo/i),
    });
  });

  test('a model-run failure surfaces an honest, non-"server" error message', async () => {
    mockRun.mockRejectedValue(new Error('interpreter crashed'));

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      message: expect.stringMatching(/could not classify this photo/i),
    });
  });

  test('an unsupported output tensor dtype surfaces an honest error rather than misreading garbage scores', async () => {
    mockModel.outputs[0].dataType = 'int16';
    mockRun.mockResolvedValue([new ArrayBuffer(NUM_CLASSES * 2)]);

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      message: expect.stringMatching(/could not classify this photo/i),
    });
  });

  test('an unsupported input tensor dtype surfaces an honest error before ever calling model.run()', async () => {
    mockModel.inputs[0].dataType = 'int16';

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      message: expect.stringMatching(/could not classify this photo/i),
    });
    expect(mockRun).not.toHaveBeenCalled();
  });

  test('missing base64 image data from expo-image-manipulator surfaces an honest error', async () => {
    mockSaveAsync.mockResolvedValue({ uri: 'file:///cache/resized.jpg', width: 192, height: 192 });

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      message: expect.stringMatching(/could not classify this photo/i),
    });
  });

  test('a model reporting no input/output tensor metadata surfaces an honest error', async () => {
    mockModel.inputs = [];

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      message: expect.stringMatching(/could not classify this photo/i),
    });
  });

  test('a model producing no output tensor at all surfaces an honest error', async () => {
    mockRun.mockResolvedValue([]);

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      message: expect.stringMatching(/could not classify this photo/i),
    });
  });
});

describe('onModelLoadProgress (native)', () => {
  test('is a permanent no-op — the bundled model has no cold download step to report progress for', () => {
    const callback = jest.fn();
    const unsubscribe = onModelLoadProgress(callback);
    expect(callback).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });
});
