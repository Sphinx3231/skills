import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import LogScreen from '../log';
import * as api from '@/lib/api';
import * as ImagePicker from 'expo-image-picker';

// This file exercises the "native speech-recognition module unavailable"
// path by mocking the wrapper module (`@/lib/speech-recognition`) directly,
// rather than mocking the raw `expo-speech-recognition` package the way
// `log.test.tsx` does. Per the plan, the existing `jest.mock('expo-speech-recognition', ...)`
// in `log.test.tsx` must not be moved or altered — this is a separate file
// so the two mocking strategies (raw package vs. wrapper) don't collide.
const mockRequestSpeechPermissions = jest.fn();
const mockStartSpeechRecognition = jest.fn();
const mockStopSpeechRecognition = jest.fn();
jest.mock('@/lib/speech-recognition', () => ({
  isSpeechRecognitionAvailable: false,
  requestSpeechPermissions: mockRequestSpeechPermissions,
  startSpeechRecognition: mockStartSpeechRecognition,
  stopSpeechRecognition: mockStopSpeechRecognition,
  useSpeechRecognitionEvent: () => {},
}));

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

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn().mockResolvedValue(undefined),
}));

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
const mockedApi = api as jest.Mocked<typeof api>;
const mockedPicker = ImagePicker as jest.Mocked<typeof ImagePicker>;

beforeEach(() => {
  mockedApi.getFrequentFoods.mockResolvedValue([]);
  mockedPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as any);
  mockedPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as any);
});

afterEach(() => jest.clearAllMocks());

describe('LogScreen — speech recognition unavailable', () => {
  test('the Voice Input tile shows the "needs the full app build" sublabel', async () => {
    await render(<LogScreen />);
    expect(screen.getByText('Needs the full app build')).toBeTruthy();
  });

  test('tapping Voice Input shows a clear message and never starts recognition', async () => {
    await render(<LogScreen />);

    await fireEvent.press(screen.getByText('Voice Input'));

    await waitFor(() =>
      expect(
        screen.getByText('Voice Input needs the full app build — not available in this preview.')
      ).toBeTruthy()
    );
    expect(mockRequestSpeechPermissions).not.toHaveBeenCalled();
    expect(mockStartSpeechRecognition).not.toHaveBeenCalled();
  });

  test('other tiles are unaffected — Snap & Track and Barcode Hunt still render', async () => {
    await render(<LogScreen />);
    expect(screen.getByText('Snap & Track')).toBeTruthy();
    expect(screen.getByText('From library')).toBeTruthy();
    expect(screen.getByText('Barcode Hunt')).toBeTruthy();
  });
});
