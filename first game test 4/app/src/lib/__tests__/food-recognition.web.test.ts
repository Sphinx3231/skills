/**
 * @jest-environment jsdom
 */
// Explicit-path import of the .web.ts file (ticket 011, Step 5's real
// gotcha): jest-expo's preset does not resolve `.web.ts` files automatically
// (`haste.platforms` excludes 'web', `defaultPlatform: 'ios'`) — the same
// reason settings-db.web.test.ts imports `../settings-db.web` explicitly
// rather than `../settings-db`. Importing the platform-less specifier here
// would silently exercise food-recognition.ts (the native file) instead.
//
// Per the plan's Step 2: this mocks `window.__foxbiteClipPipelineReady`
// directly (a resolved promise wrapping a fake classifier function) — no
// module mocking of `@huggingface/transformers` needed or possible, since
// food-recognition.web.ts never imports it. This sidesteps the Jest
// dynamic-import limitation documented in log.test.tsx entirely rather than
// working around it.
import * as api from '@/lib/api';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getBillingStatus: jest.fn(),
}));
const mockedApi = api as jest.Mocked<typeof api>;

import { classifyFoodPhoto, onModelLoadProgress } from '../food-recognition.web';

const photo = { uri: 'blob:http://localhost/fake-photo', name: 'photo.jpg', type: 'image/jpeg' };

function activeBilling(): api.BillingStatus {
  return { status: 'active', trialEndsAt: '2026-01-01T00:00:00.000Z', daysLeft: 0 };
}

function trialingBilling(): api.BillingStatus {
  return { status: 'trialing', trialEndsAt: '2026-01-01T00:00:00.000Z', daysLeft: 10 };
}

function expiredBilling(): api.BillingStatus {
  return { status: 'expired', trialEndsAt: '2026-01-01T00:00:00.000Z', daysLeft: 0 };
}

beforeEach(() => {
  delete (window as any).__foxbiteClipPipelineReady;
  delete (window as any).__foxbiteClipPipeline;
  delete (window as any).__foxbiteClipProgressState;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('classifyFoodPhoto (web)', () => {
  test('an active-billing user gets a real classification, reading the classifier off window', async () => {
    mockedApi.getBillingStatus.mockResolvedValue(activeBilling());
    const fakeClassifier = jest.fn().mockResolvedValue([
      { label: 'a photo of a banana', score: 0.95 },
      { label: 'a photo of an apple', score: 0.2 },
    ]);
    window.__foxbiteClipPipelineReady = Promise.resolve(fakeClassifier);

    const result = await classifyFoodPhoto(photo);

    expect(result.foodName).toBe('Banana');
    expect(result.calories).toBe(105);
    expect(fakeClassifier).toHaveBeenCalledWith(
      photo.uri,
      expect.any(Array),
      expect.objectContaining({ hypothesis_template: '{}' })
    );
  });

  test('REGRESSION: a trialing (free-trial, not yet expired) user is NOT blocked — the check is `status === \'expired\'`, not `status !== \'active\'`', async () => {
    // CTO verdict (ticket 011) finding C1: mutating the `=== 'expired'` check
    // to `!== 'active'` stayed fully green with no test noticing, and that
    // mutant would block every user in their 30-day free trial — the default
    // state of every new signup — from ever scanning a photo.
    mockedApi.getBillingStatus.mockResolvedValue(trialingBilling());
    const fakeClassifier = jest.fn().mockResolvedValue([{ label: 'a photo of pizza', score: 0.9 }]);
    window.__foxbiteClipPipelineReady = Promise.resolve(fakeClassifier);

    await expect(classifyFoodPhoto(photo)).resolves.toBeDefined();
    expect(fakeClassifier).toHaveBeenCalled();
  });

  test('checks billing status on every call, not just once', async () => {
    mockedApi.getBillingStatus.mockResolvedValue(activeBilling());
    const fakeClassifier = jest.fn().mockResolvedValue([{ label: 'a photo of pizza', score: 0.9 }]);
    window.__foxbiteClipPipelineReady = Promise.resolve(fakeClassifier);

    await classifyFoodPhoto(photo);
    await classifyFoodPhoto(photo);

    expect(mockedApi.getBillingStatus).toHaveBeenCalledTimes(2);
  });

  test('an expired-trial user is blocked before the classifier is ever called', async () => {
    mockedApi.getBillingStatus.mockResolvedValue(expiredBilling());
    const fakeClassifier = jest.fn();
    window.__foxbiteClipPipelineReady = Promise.resolve(fakeClassifier);

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      status: 402,
      body: { billing: expiredBilling() },
    });
    expect(fakeClassifier).not.toHaveBeenCalled();
  });

  test('fails closed with an honest, network-specific message if the billing check itself throws — does NOT fall through to local inference', async () => {
    mockedApi.getBillingStatus.mockRejectedValue(new Error('network down'));
    const fakeClassifier = jest.fn();
    window.__foxbiteClipPipelineReady = Promise.resolve(fakeClassifier);

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      message: expect.stringMatching(/couldn't check your subscription/i),
    });
    expect(fakeClassifier).not.toHaveBeenCalled();
  });

  test('a not-yet-loaded (or failed-to-load) CDN pipeline throws an honest, non-"server" message', async () => {
    mockedApi.getBillingStatus.mockResolvedValue(activeBilling());
    // window.__foxbiteClipPipelineReady was never set by +html.tsx's script.

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      message: expect.stringMatching(/model failed to load/i),
    });
  });

  test('REGRESSION: a rejected pipeline promise (CDN script ran, model download failed) surfaces an honest error, not "Could not reach the server."', async () => {
    mockedApi.getBillingStatus.mockResolvedValue(activeBilling());
    // Unlike the "never set" case above, +html.tsx's script DID run and DID
    // assign window.__foxbiteClipPipelineReady — but the promise it assigned
    // rejects (e.g. the model download itself failed after the script
    // started). Before this fix, `getClassifier()` was awaited outside the
    // surrounding try/catch, so this raw rejection propagated uncaught by
    // this module and reached log.tsx's generic catch-all, which prints
    // "Could not reach the server." — actively misleading for a call that
    // never touched a server.
    window.__foxbiteClipPipelineReady = Promise.reject(new Error('model.onnx fetch failed: 503'));

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      message: expect.stringMatching(/could not classify this photo/i),
    });
  });

  test('a classifier call failure surfaces an honest local-inference error, not the generic server-error string', async () => {
    mockedApi.getBillingStatus.mockResolvedValue(activeBilling());
    const fakeClassifier = jest.fn().mockRejectedValue(new Error('WASM crashed'));
    window.__foxbiteClipPipelineReady = Promise.resolve(fakeClassifier);

    await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
      message: expect.stringMatching(/could not classify this photo/i),
    });
  });
});

describe('onModelLoadProgress (web)', () => {
  test('translates a progress-status event into a downloading progress update', () => {
    const callback = jest.fn();
    const unsubscribe = onModelLoadProgress(callback);

    window.dispatchEvent(
      new CustomEvent('foxbite-clip-progress', { detail: { status: 'progress', progress: 42 } })
    );

    expect(callback).toHaveBeenCalledWith({ status: 'downloading', progress: 42 });
    unsubscribe();
  });

  test('translates a ready event', () => {
    const callback = jest.fn();
    onModelLoadProgress(callback);

    window.dispatchEvent(new CustomEvent('foxbite-clip-progress', { detail: { status: 'ready' } }));

    expect(callback).toHaveBeenCalledWith({ status: 'ready' });
  });

  test('translates an error event', () => {
    const callback = jest.fn();
    onModelLoadProgress(callback);

    window.dispatchEvent(
      new CustomEvent('foxbite-clip-progress', { detail: { status: 'error', message: 'boom' } })
    );

    expect(callback).toHaveBeenCalledWith({ status: 'error', message: 'boom' });
  });

  test('REGRESSION (found via run-foxbite-web live verification): a late subscriber immediately catches up to whatever already happened, instead of missing it', () => {
    // Simulates +html.tsx's script having already reached 'ready' before
    // onModelLoadProgress() is ever called — the real scenario live
    // verification found: the CDN script starts downloading on page load,
    // independent of sign-in or the Log tab mounting, so a plain
    // fire-and-forget CustomEvent would silently lose this.
    window.__foxbiteClipProgressState = { status: 'ready' };

    const callback = jest.fn();
    onModelLoadProgress(callback);

    expect(callback).toHaveBeenCalledWith({ status: 'ready' });
  });

  test('a subscriber with no prior state gets nothing until a real event fires', () => {
    const callback = jest.fn();
    onModelLoadProgress(callback);
    expect(callback).not.toHaveBeenCalled();
  });

  test('unsubscribe stops further callbacks', () => {
    const callback = jest.fn();
    const unsubscribe = onModelLoadProgress(callback);
    unsubscribe();

    window.dispatchEvent(new CustomEvent('foxbite-clip-progress', { detail: { status: 'ready' } }));

    expect(callback).not.toHaveBeenCalled();
  });
});
