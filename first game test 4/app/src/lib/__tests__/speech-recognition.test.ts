// No mocks here, deliberately. jest-expo has no real native
// `ExpoSpeechRecognition` module registered, so requiring the actual
// `expo-speech-recognition` package unmocked throws
// `Cannot find native module 'ExpoSpeechRecognition'` at module scope — this
// exercises the wrapper's "module unavailable" path for free, using the
// real package rather than a fake.
import {
  isSpeechRecognitionAvailable,
  requestSpeechPermissions,
  startSpeechRecognition,
  stopSpeechRecognition,
} from '../speech-recognition';

describe('speech-recognition wrapper — native module not linked', () => {
  test('isSpeechRecognitionAvailable is false', () => {
    expect(isSpeechRecognitionAvailable).toBe(false);
  });

  test('requestSpeechPermissions resolves to not granted, without throwing', async () => {
    await expect(requestSpeechPermissions()).resolves.toEqual({ granted: false });
  });

  test('startSpeechRecognition does not throw', () => {
    expect(() => startSpeechRecognition({ lang: 'en-US', interimResults: true })).not.toThrow();
  });

  test('stopSpeechRecognition does not throw', () => {
    expect(() => stopSpeechRecognition()).not.toThrow();
  });
});
