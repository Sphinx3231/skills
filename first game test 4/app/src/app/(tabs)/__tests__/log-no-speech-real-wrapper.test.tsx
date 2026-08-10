// Integration counterpart to `log-no-speech.test.tsx`.
//
// That file mocks `@/lib/speech-recognition` to force the unavailable branch,
// which proves `log.tsx`'s guard works but never exercises the wrapper itself.
// This file deliberately does NOT mock the wrapper (nor the underlying
// `expo-speech-recognition` package), so the REAL wrapper runs and resolves to
// its unavailable branch — jest-expo has no native `ExpoSpeechRecognition`
// module registered, so the wrapper's `require()` throws and is caught exactly
// as it is on Expo Go.
//
// This is the closest automated proxy for the original bug (ticket 007): the
// question isn't just "does the guard fire?" but "does the Log route file load
// and render at all when the native module is missing?" — since Expo Router
// eagerly requires every route file to build the tab tree, and a module-scope
// throw here is what silently dropped the whole Log tab. It also covers the
// real no-op `useSpeechRecognitionEvent` fallback surviving a live React
// render, which no other test touches.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import LogScreen from '../log';
import { isSpeechRecognitionAvailable } from '@/lib/speech-recognition';
import * as api from '@/lib/api';

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(() => {
      cb();
    });
  },
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

jest.mock('expo-camera', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
    CameraView: () => React.createElement(View, { testID: 'camera-view' }),
  };
});

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getFrequentFoods: jest.fn(),
  analyzePhoto: jest.fn(),
  analyzeText: jest.fn(),
  lookupBarcode: jest.fn(),
  createLog: jest.fn(),
  createCheckoutSession: jest.fn(),
}));

beforeEach(() => {
  (api.getFrequentFoods as jest.Mock).mockResolvedValue([]);
});

afterEach(() => jest.clearAllMocks());

describe('LogScreen — real speech-recognition wrapper, native module not linked', () => {
  test('the real wrapper resolves to unavailable in this environment', () => {
    expect(isSpeechRecognitionAvailable).toBe(false);
  });

  test('LogScreen still loads and renders — the Log route is never lost', async () => {
    await render(<LogScreen />);
    expect(screen.getByText('Log a meal')).toBeTruthy();
    expect(screen.getByText('Voice Input')).toBeTruthy();
    expect(screen.getByText('Needs the full app build')).toBeTruthy();
  });

  test('tapping Voice Input degrades gracefully through the real fallback hook', async () => {
    await render(<LogScreen />);

    await fireEvent.press(screen.getByText('Voice Input'));

    await waitFor(() =>
      expect(
        screen.getByText('Voice Input needs the full app build — not available in this preview.')
      ).toBeTruthy()
    );
  });
});
