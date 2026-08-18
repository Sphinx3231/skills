// No mocks of `react-native-fast-tflite` here, deliberately — same
// reasoning as speech-recognition.test.ts (see that file's comment):
// jest-expo has no real native Nitro/TurboModule registered for it, so
// requiring the actual package unmocked throws "Failed to get NitroModules:
// The native NitroModules Turbo/Native-Module could not be found" at
// module scope, exactly like a real dev-client build that predates this
// dependency would. This exercises food-recognition.ts's "native module
// unavailable" fallback for free, using the real package rather than a
// fake — kept in its own file (like log-no-speech.test.tsx is split from
// log.test.tsx) specifically so this real, unmocked import doesn't collide
// with food-recognition.test.ts's `jest.mock('react-native-fast-tflite', ...)`
// in the same module registry.
import * as api from '../api';

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  getBillingStatus: jest.fn(),
}));
const mockedApi = api as jest.Mocked<typeof api>;

import { classifyFoodPhoto, isOnDeviceModelAvailable } from '../food-recognition';

const photo = { uri: 'file:///cache/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' };

function activeBilling(): api.BillingStatus {
  return { status: 'active', trialEndsAt: '2026-01-01T00:00:00.000Z', daysLeft: 0 };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.getBillingStatus.mockResolvedValue(activeBilling());
});

test('isOnDeviceModelAvailable is false when the native module is not linked', () => {
  expect(isOnDeviceModelAvailable).toBe(false);
});

test('classifyFoodPhoto surfaces an honest error instead of crashing when the native module is unavailable', async () => {
  await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({
    message: expect.stringMatching(/could not classify this photo/i),
  });
});

test('still checks billing before failing — an expired-trial user sees the paywall, not the "native module unavailable" error', async () => {
  mockedApi.getBillingStatus.mockResolvedValue({
    status: 'expired',
    trialEndsAt: '2026-01-01T00:00:00.000Z',
    daysLeft: 0,
  });

  await expect(classifyFoodPhoto(photo)).rejects.toMatchObject({ status: 402 });
});
