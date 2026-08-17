// Direct test of the native/default food-recognition module (ticket 011,
// Step 4) — this is the file that proves mobile's photo-scan behavior is
// completely unchanged by this ticket: it's a thin, unconditional
// passthrough to api.analyzePhoto(), with no branch that could have
// diverged from ticket 010's already-shipped mobile behavior.
import * as api from '../api';
import { classifyFoodPhoto, onModelLoadProgress } from '../food-recognition';

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  analyzePhoto: jest.fn(),
}));
const mockedApi = api as jest.Mocked<typeof api>;

const photo = { uri: 'file://photo.jpg', name: 'photo.jpg', type: 'image/jpeg' };

describe('classifyFoodPhoto (native)', () => {
  test('forwards directly to api.analyzePhoto with no transformation', async () => {
    const analysis: api.PhotoAnalysis = {
      items: [
        {
          foodName: 'Pizza',
          portionDescription: 'about 2 slices',
          calories: 285,
          proteinG: 12,
          carbsG: 36,
          fatG: 10,
          confidence: 'high',
          notes: '',
        },
      ],
    };
    mockedApi.analyzePhoto.mockResolvedValue(analysis);

    const result = await classifyFoodPhoto(photo);

    expect(mockedApi.analyzePhoto).toHaveBeenCalledWith(photo);
    expect(result).toBe(analysis);
  });

  test('propagates a rejection from api.analyzePhoto unchanged (e.g. the 402 paywall shape)', async () => {
    const err = new api.ApiError(402, 'Your free trial has ended', {
      billing: { status: 'expired', trialEndsAt: '2026-01-01T00:00:00.000Z', daysLeft: 0 },
    });
    mockedApi.analyzePhoto.mockRejectedValue(err);

    await expect(classifyFoodPhoto(photo)).rejects.toBe(err);
  });
});

describe('onModelLoadProgress (native)', () => {
  test('is a permanent no-op — mobile has no cold local-model-load step', () => {
    const callback = jest.fn();
    const unsubscribe = onModelLoadProgress(callback);
    expect(callback).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });
});
