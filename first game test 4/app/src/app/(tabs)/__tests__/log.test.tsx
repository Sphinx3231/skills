import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import LogScreen from '../log';
import * as api from '@/lib/api';
import * as foodRecognition from '@/lib/food-recognition';
import * as ImagePicker from 'expo-image-picker';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

const mockNavigate = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, push: mockPush }),
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

const mockOpenBrowserAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

// expo-speech-recognition is event-based: `start`/`stop`/`requestPermissionsAsync`
// are plain jest.fn()s, and `useSpeechRecognitionEvent` is faked as a tiny event
// bus so tests can fire 'result'/'error' events the same way the native module
// would, driving the component's real listeners.
type SpeechListener = (event: any) => void;
const speechListeners: Record<string, SpeechListener[]> = {};
function emitSpeechEvent(name: string, event: any) {
  (speechListeners[name] ?? []).forEach((l) => l(event));
}
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  },
  useSpeechRecognitionEvent: (name: string, listener: SpeechListener) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(() => {
      speechListeners[name] = [...(speechListeners[name] ?? []), listener];
      return () => {
        speechListeners[name] = (speechListeners[name] ?? []).filter((l) => l !== listener);
      };
    });
  },
}));

// expo-camera: useCameraPermissions is a hook returning [permission, request],
// and CameraView is faked as a plain view so tests can invoke onBarcodeScanned
// directly (mirrors how expo-image-picker's async functions are mocked above).
const mockRequestCameraPermission = jest.fn();
let mockCameraPermission: { granted: boolean } | null = null;
let latestOnBarcodeScanned: ((result: { type: string; data: string }) => void) | null = null;
jest.mock('expo-camera', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    useCameraPermissions: () => [mockCameraPermission, mockRequestCameraPermission],
    CameraView: (props: any) => {
      latestOnBarcodeScanned = props.onBarcodeScanned;
      return React.createElement(View, { testID: 'camera-view' });
    },
  };
});

jest.mock('@/lib/api', () => ({
  // Keep the real ApiError class (auto-mocking it would strip its
  // constructor, breaking `err.message`/`err.status` in the component) and
  // only mock the network-calling functions.
  ...jest.requireActual('@/lib/api'),
  getFrequentFoods: jest.fn(),
  analyzePhoto: jest.fn(),
  analyzeText: jest.fn(),
  lookupBarcode: jest.fn(),
  createLog: jest.fn(),
  createCheckoutSession: jest.fn(),
}));
const mockedApi = api as jest.Mocked<typeof api>;

// jest-expo's default platform resolution means log.tsx's
// `import ... from '@/lib/food-recognition'` (no `.web` suffix) resolves to
// the NATIVE file here, same as it would in a real native build — so every
// existing test below that only touches `mockedApi.analyzePhoto` is, by
// construction, exercising mobile's real code path (food-recognition.ts is
// an unmocked, thin passthrough to api.analyzePhoto). This mock exists only
// to simulate the two web-specific *error shapes* food-recognition.web.ts
// can throw (an expired-trial 402, and a local-inference failure) so this
// file can verify log.tsx's existing, unmodified catch logic handles both
// correctly — it does NOT exercise food-recognition.web.ts itself (that
// module is tested directly, via an explicit-path import, in
// food-recognition.web.test.ts). By default this just forwards to the
// (already mocked) api.analyzePhoto, so it changes nothing for any test
// that doesn't explicitly override it with mockRejectedValueOnce.
jest.mock('@/lib/food-recognition', () => {
  const realApi = require('@/lib/api');
  return {
    classifyFoodPhoto: jest.fn((photo: unknown) => realApi.analyzePhoto(photo)),
    onModelLoadProgress: jest.fn(() => () => {}),
  };
});
const mockedClassifyFoodPhoto = foodRecognition.classifyFoodPhoto as jest.Mock;
const mockedPicker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const mockedSpeech = ExpoSpeechRecognitionModule as jest.Mocked<typeof ExpoSpeechRecognitionModule>;

const analysis: api.FoodAnalysis = {
  foodName: 'Grilled chicken',
  calories: 520,
  proteinG: 40,
  carbsG: 30,
  fatG: 12,
  confidence: 'high',
  notes: '',
};

// Ticket 014: POST /food/analyze (via classifyFoodPhoto -> api.analyzePhoto)
// now returns `{ items: [...] }` instead of a single merged FoodAnalysis —
// voice/barcode's `analysis` const above is untouched, still single-item.
const singleItemPhotoAnalysis: api.PhotoAnalysis = {
  items: [
    {
      foodName: 'Grilled chicken',
      portionDescription: 'a medium fillet, ~150g',
      calories: 520,
      proteinG: 40,
      carbsG: 30,
      fatG: 12,
      confidence: 'high',
      notes: '',
    },
  ],
};

const multiItemPhotoAnalysis: api.PhotoAnalysis = {
  items: [
    {
      foodName: 'Grilled chicken',
      portionDescription: 'a medium fillet, ~150g',
      calories: 260,
      proteinG: 40,
      carbsG: 0,
      fatG: 10,
      confidence: 'high',
      notes: '',
    },
    {
      foodName: 'Steamed rice',
      portionDescription: 'about 1 cup',
      calories: 205,
      proteinG: 4,
      carbsG: 45,
      fatG: 0,
      confidence: 'medium',
      notes: '',
    },
  ],
};

const asset = { uri: 'file://photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' };

// Fires a `press` event twice, unawaited, inside a single explicit `act()`
// scope — used only by the double-tap-guard tests below, which need to
// invoke the same handler twice synchronously to simulate a real double-tap
// landing before the first tap's permission promise resolves. A normal
// `await fireEvent.press(...)` per tap can't reproduce that race: each
// call's internal `act()` only settles once the whole handler (including
// its pending permission `await`) resolves, so two sequentially-awaited
// presses can never actually overlap. Calling `fireEvent.press` twice at the
// top level (each starting its own independent, unawaited `act()` scope)
// corrupts React's act-tracking across the whole file — nesting both calls
// inside one outer `act()` instead keeps them properly nested rather than
// sibling/overlapping, since the outer scope doesn't resolve (and doesn't
// need either inner call's promise to settle) until we explicitly await it
// after both taps have already fired synchronously.
function doubleTap(label: string) {
  return act(async () => {
    fireEvent.press(screen.getByText(label));
    fireEvent.press(screen.getByText(label));
  });
}

beforeEach(() => {
  mockedApi.getFrequentFoods.mockResolvedValue([]);
  mockedPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as any);
  mockedPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as any);
  mockedSpeech.requestPermissionsAsync.mockResolvedValue({ granted: true } as any);
  mockCameraPermission = { granted: true };
  mockRequestCameraPermission.mockResolvedValue({ granted: true });
  latestOnBarcodeScanned = null;
  Object.keys(speechListeners).forEach((key) => delete speechListeners[key]);
});

afterEach(() => jest.clearAllMocks());

describe('LogScreen — idle state', () => {
  test('renders the Quick Snare hub tiles', async () => {
    await render(<LogScreen />);
    expect(screen.getByText('Snap & Track')).toBeTruthy();
    expect(screen.getByText('From library')).toBeTruthy();
    expect(screen.getByText('Voice Input')).toBeTruthy();
    expect(screen.getByText('Barcode Hunt')).toBeTruthy();
  });

  test('shows the Quick Stash row once frequent foods load', async () => {
    mockedApi.getFrequentFoods.mockResolvedValue([
      { food_name: 'Oatmeal', logCount: 3, calories: 250, proteinG: 8, carbsG: 40, fatG: 5 },
    ]);
    await render(<LogScreen />);
    await waitFor(() => expect(screen.getByText('Quick Stash')).toBeTruthy());
    expect(screen.getByText('Oatmeal')).toBeTruthy();
    expect(screen.getByText('250 cal')).toBeTruthy();
  });

  test('tapping a stash item logs it and navigates home', async () => {
    mockedApi.getFrequentFoods.mockResolvedValue([
      { food_name: 'Oatmeal', logCount: 3, calories: 250, proteinG: 8, carbsG: 40, fatG: 5 },
    ]);
    mockedApi.createLog.mockResolvedValue({} as api.FoodLog);
    await render(<LogScreen />);
    await waitFor(() => expect(screen.getByText('Oatmeal')).toBeTruthy());

    await fireEvent.press(screen.getByText('Oatmeal'));

    await waitFor(() => expect(mockedApi.createLog).toHaveBeenCalledWith({
      foodName: 'Oatmeal',
      calories: 250,
      proteinG: 8,
      carbsG: 40,
      fatG: 5,
      source: 'manual',
    }));
    // A brief "order" FoxMoment plays before navigating home.
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'), { timeout: 3000 });
  });

  test('skips the FoxMoment and navigates home immediately when reduce motion is on', async () => {
    // mockResolvedValueOnce (rather than mockResolvedValue + mockRestore) so
    // this doesn't leave AccessibilityInfo permanently altered for tests that
    // run afterward in this file.
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValueOnce(true);
    mockedApi.getFrequentFoods.mockResolvedValue([
      { food_name: 'Oatmeal', logCount: 3, calories: 250, proteinG: 8, carbsG: 40, fatG: 5 },
    ]);
    mockedApi.createLog.mockResolvedValue({} as api.FoodLog);
    await render(<LogScreen />);
    await waitFor(() => expect(screen.getByText('Oatmeal')).toBeTruthy());

    await fireEvent.press(screen.getByText('Oatmeal'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    expect(screen.queryByText('Logged!')).toBeNull();
  });

  test('a stash-tap failure shows an error', async () => {
    mockedApi.getFrequentFoods.mockResolvedValue([
      { food_name: 'Oatmeal', logCount: 3, calories: 250, proteinG: 8, carbsG: 40, fatG: 5 },
    ]);
    mockedApi.createLog.mockRejectedValue(new api.ApiError(500, 'Could not save this entry.'));
    await render(<LogScreen />);
    await waitFor(() => expect(screen.getByText('Oatmeal')).toBeTruthy());

    await fireEvent.press(screen.getByText('Oatmeal'));

    await waitFor(() => expect(screen.getByText('Could not save this entry.')).toBeTruthy());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('shows a permission-denied error and never opens the camera', async () => {
    mockedPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false } as any);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() => expect(screen.getByText(/Permission to use the camera was denied/)).toBeTruthy());
    expect(mockedPicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  test('does nothing when the picker is canceled', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: null } as any);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() => expect(mockedPicker.launchCameraAsync).toHaveBeenCalled());
    expect(screen.queryByText('Foxxy is sniffing out the details…')).toBeNull();
  });

  test('tapping the settings gear icon navigates to /settings', async () => {
    await render(<LogScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-gear-button')).toBeTruthy());

    fireEvent.press(screen.getByTestId('settings-gear-button'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });
});

describe('LogScreen — analyze + review flow', () => {
  test('camera photo analyzes successfully and shows the review card', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(singleItemPhotoAnalysis);

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() => expect(screen.getByDisplayValue('Grilled chicken')).toBeTruthy());
    expect(screen.getByDisplayValue('520')).toBeTruthy();
    expect(screen.getByDisplayValue('a medium fillet, ~150g')).toBeTruthy();
  });

  test('library photo goes through requestMediaLibraryPermissionsAsync', async () => {
    mockedPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(singleItemPhotoAnalysis);

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('From library'));

    await waitFor(() => expect(mockedApi.analyzePhoto).toHaveBeenCalled());
    expect(mockedPicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
  });

  test('shows the low-confidence warning when the model is unsure', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue({
      items: [{ ...singleItemPhotoAnalysis.items[0], confidence: 'low' }],
    });

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() => expect(screen.getByText(/Low confidence/)).toBeTruthy());
  });

  test('ticket 014: a multi-item photo shows a separate, independently editable card per item', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(multiItemPhotoAnalysis);

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() => expect(screen.getByDisplayValue('Grilled chicken')).toBeTruthy());
    expect(screen.getByDisplayValue('Steamed rice')).toBeTruthy();
    expect(screen.getByDisplayValue('260')).toBeTruthy();
    expect(screen.getByDisplayValue('205')).toBeTruthy();
    expect(screen.getByText('Item 1')).toBeTruthy();
    expect(screen.getByText('Item 2')).toBeTruthy();
    expect(screen.getByText('Save all 2')).toBeTruthy();

    // Editing one item's field must not affect the other item's value.
    await fireEvent.changeText(screen.getByDisplayValue('Grilled chicken'), 'Grilled chicken thigh');
    expect(screen.getByDisplayValue('Grilled chicken thigh')).toBeTruthy();
    expect(screen.getByDisplayValue('Steamed rice')).toBeTruthy();

    // The portion field is independently editable too.
    await fireEvent.changeText(screen.getByDisplayValue('a medium fillet, ~150g'), 'a large fillet, ~200g');
    expect(screen.getByDisplayValue('a large fillet, ~200g')).toBeTruthy();
    expect(screen.getByDisplayValue('about 1 cup')).toBeTruthy();
  });

  test('ticket 014: removing an item excludes it from what gets saved', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(multiItemPhotoAnalysis);
    mockedApi.createLog.mockResolvedValue({} as api.FoodLog);

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));
    await waitFor(() => expect(screen.getByText('Item 2')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Remove item 2'));

    expect(screen.queryByDisplayValue('Steamed rice')).toBeNull();
    expect(screen.getByText('Save to today')).toBeTruthy(); // back to singular label with 1 item left

    await fireEvent.press(screen.getByText('Save to today'));

    await waitFor(() => expect(mockedApi.createLog).toHaveBeenCalledTimes(1));
    expect(mockedApi.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ foodName: 'Grilled chicken', calories: 260 })
    );
  });

  test('ticket 014: saving a multi-item scan calls createLog once per confirmed item, then navigates home', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(multiItemPhotoAnalysis);
    mockedApi.createLog.mockResolvedValue({} as api.FoodLog);

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));
    await waitFor(() => expect(screen.getByText('Save all 2')).toBeTruthy());

    await fireEvent.press(screen.getByText('Save all 2'));

    await waitFor(() => expect(mockedApi.createLog).toHaveBeenCalledTimes(2));
    expect(mockedApi.createLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ foodName: 'Grilled chicken', calories: 260, source: 'ai' })
    );
    expect(mockedApi.createLog).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ foodName: 'Steamed rice', calories: 205, source: 'ai' })
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'), { timeout: 3000 });
  });

  test("ticket 015: retrying after a partial multi-item save failure does not re-save the item(s) that already succeeded", async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(multiItemPhotoAnalysis);
    // First attempt: item 1 ("Grilled chicken") saves fine, item 2
    // ("Steamed rice") fails partway through the loop.
    mockedApi.createLog
      .mockResolvedValueOnce({} as api.FoodLog)
      .mockRejectedValueOnce(new api.ApiError(500, 'Could not save this entry.'));

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));
    await waitFor(() => expect(screen.getByText('Save all 2')).toBeTruthy());

    await fireEvent.press(screen.getByText('Save all 2'));

    await waitFor(() => expect(mockedApi.createLog).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.getByText("Could not save this entry. (1 item already saved and won't be re-saved.)")
      ).toBeTruthy()
    );

    // The already-saved item must be pruned from the review screen: only
    // the still-pending item remains, so the button reverts to the
    // singular label and there is nothing left to re-submit for item 1.
    expect(screen.queryByDisplayValue('Grilled chicken')).toBeNull();
    expect(screen.getByDisplayValue('Steamed rice')).toBeTruthy();
    expect(screen.getByText('Save to today')).toBeTruthy();
    expect(screen.queryByText(/^Save all/)).toBeNull();

    // Second attempt (retry): only the remaining item should be submitted —
    // createLog must NOT be called again for "Grilled chicken".
    mockedApi.createLog.mockResolvedValueOnce({} as api.FoodLog);
    await fireEvent.press(screen.getByText('Save to today'));

    await waitFor(() => expect(mockedApi.createLog).toHaveBeenCalledTimes(3));
    expect(mockedApi.createLog).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ foodName: 'Steamed rice', calories: 205, source: 'ai' })
    );
    // Never re-submitted for the item that already succeeded on attempt 1.
    expect(mockedApi.createLog).not.toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ foodName: 'Grilled chicken' })
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'), { timeout: 3000 });
  });

  test('ticket 014: a photo with no identifiable food shows a clear message with no editable fields and no Save button', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue({ items: [] });

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() =>
      expect(screen.getByText(/Couldn't identify any food in this photo/)).toBeTruthy()
    );
    expect(screen.queryByText('Save to today')).toBeNull();
    expect(screen.queryByText(/^Save all/)).toBeNull();

    await fireEvent.press(screen.getByText('Discard'));
    expect(screen.getByText('Snap & Track')).toBeTruthy();
    expect(mockedApi.createLog).not.toHaveBeenCalled();
  });

  test('ticket 014: clearing an item\'s food name blocks saving with a clear message instead of round-tripping to the backend', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(singleItemPhotoAnalysis);

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));
    await waitFor(() => expect(screen.getByDisplayValue('Grilled chicken')).toBeTruthy());

    await fireEvent.changeText(screen.getByDisplayValue('Grilled chicken'), '');
    await fireEvent.press(screen.getByText('Save to today'));

    await waitFor(() => expect(screen.getByText('Enter a food name for every item before saving.')).toBeTruthy());
    expect(mockedApi.createLog).not.toHaveBeenCalled();
  });

  test('a generic analyze failure shows an error and returns to idle', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockRejectedValue(new api.ApiError(502, 'Could not analyze photo, try again'));

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() => expect(screen.getByText('Could not analyze photo, try again')).toBeTruthy());
    expect(screen.getByText('Snap & Track')).toBeTruthy(); // back on the idle hub
  });

  test('a 402 analyze failure shows the trial-ended paywall', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockRejectedValue(
      new api.ApiError(402, 'Your free trial has ended', {
        billing: { status: 'expired', trialEndsAt: '2026-01-01T00:00:00.000Z', daysLeft: 0 },
      })
    );

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() => expect(screen.getByText('Your free month is up')).toBeTruthy());
  });

  // The two tests below simulate what food-recognition.web.ts (ticket 011)
  // throws for its client-side billing pre-check and its local-inference
  // failure path, by overriding the mocked classifyFoodPhoto() directly —
  // NOT by exercising the real .web.ts file (jest-expo resolves the
  // platform-less `@/lib/food-recognition` specifier to the native file in
  // this test environment; food-recognition.web.ts itself is covered by
  // food-recognition.web.test.ts's explicit-path import). What these two
  // tests verify is that log.tsx's existing, UNMODIFIED pickAndAnalyze()
  // catch logic correctly handles both error shapes web can now throw —
  // proving the plan's claim that no log.tsx branch needed to change for
  // either case.
  test('web: an expired-trial billing pre-check failure shows the same trial-ended paywall as mobile\'s 402, with zero log.tsx changes needed', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedClassifyFoodPhoto.mockRejectedValueOnce(
      new api.ApiError(402, 'Your free trial has ended', {
        billing: { status: 'expired', trialEndsAt: '2026-01-01T00:00:00.000Z', daysLeft: 0 },
      })
    );

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() => expect(screen.getByText('Your free month is up')).toBeTruthy());
    // The real backend was never called for this path.
    expect(mockedApi.analyzePhoto).not.toHaveBeenCalled();
  });

  test('web: a local-inference failure shows an honest message, not the generic "Could not reach the server" string', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedClassifyFoodPhoto.mockRejectedValueOnce(
      new api.ApiError(0, 'Could not classify this photo — try again.')
    );

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() => expect(screen.getByText('Could not classify this photo — try again.')).toBeTruthy());
    expect(screen.queryByText('Could not reach the server.')).toBeNull();
  });

  test('editing the review fields updates their values', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(singleItemPhotoAnalysis);

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));
    await waitFor(() => expect(screen.getByDisplayValue('Grilled chicken')).toBeTruthy());

    await fireEvent.changeText(screen.getByDisplayValue('Grilled chicken'), 'Grilled chicken breast');
    expect(screen.getByDisplayValue('Grilled chicken breast')).toBeTruthy();

    await fireEvent.changeText(screen.getByDisplayValue('520'), '600');
    expect(screen.getByDisplayValue('600')).toBeTruthy();

    await fireEvent.changeText(screen.getByDisplayValue('40'), '45');
    expect(screen.getByDisplayValue('45')).toBeTruthy();

    await fireEvent.changeText(screen.getByDisplayValue('30'), '35');
    expect(screen.getByDisplayValue('35')).toBeTruthy();

    await fireEvent.changeText(screen.getByDisplayValue('12'), '15');
    expect(screen.getByDisplayValue('15')).toBeTruthy();
  });

  test('shows AI notes when present', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue({
      items: [{ ...singleItemPhotoAnalysis.items[0], notes: 'Looks like a large portion.' }],
    });

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() => expect(screen.getByText('Looks like a large portion.')).toBeTruthy());
  });

  test('discard returns to the idle hub without saving', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(singleItemPhotoAnalysis);

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));
    await waitFor(() => expect(screen.getByText('Discard')).toBeTruthy());

    await fireEvent.press(screen.getByText('Discard'));
    expect(screen.getByText('Snap & Track')).toBeTruthy();
    expect(mockedApi.createLog).not.toHaveBeenCalled();
  });

  test('saving successfully calls createLog and navigates home', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(singleItemPhotoAnalysis);
    mockedApi.createLog.mockResolvedValue({} as api.FoodLog);

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));
    await waitFor(() => expect(screen.getByText('Save to today')).toBeTruthy());

    await fireEvent.press(screen.getByText('Save to today'));

    await waitFor(() =>
      expect(mockedApi.createLog).toHaveBeenCalledWith(
        expect.objectContaining({ foodName: 'Grilled chicken', calories: 520, source: 'ai' })
      )
    );
    // A brief "order" FoxMoment plays before navigating home.
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'), { timeout: 3000 });
  });

  test('saving after editing a field sends the EDITED value to createLog, not the original analyzePhoto() response value (ticket 010: raw-response capture must not affect the actually-saved values)', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(singleItemPhotoAnalysis);
    mockedApi.createLog.mockResolvedValue({} as api.FoodLog);

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));
    await waitFor(() => expect(screen.getByDisplayValue('Grilled chicken')).toBeTruthy());

    await fireEvent.changeText(screen.getByDisplayValue('Grilled chicken'), 'Grilled chicken breast');
    await fireEvent.changeText(screen.getByDisplayValue('520'), '600');

    await fireEvent.press(screen.getByText('Save to today'));

    await waitFor(() =>
      expect(mockedApi.createLog).toHaveBeenCalledWith(
        expect.objectContaining({ foodName: 'Grilled chicken breast', calories: 600 })
      )
    );
    // The call must NOT have gone out with the original, unedited values.
    const [payload] = mockedApi.createLog.mock.calls[0];
    expect(payload.foodName).not.toBe('Grilled chicken');
    expect(payload.calories).not.toBe(520);
  });

  test('a save failure shows an error and stays on the review card', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(singleItemPhotoAnalysis);
    mockedApi.createLog.mockRejectedValue(new api.ApiError(500, 'Could not save this entry.'));

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));
    await waitFor(() => expect(screen.getByText('Save to today')).toBeTruthy());

    await fireEvent.press(screen.getByText('Save to today'));

    await waitFor(() => expect(screen.getByText('Could not save this entry.')).toBeTruthy());
    expect(screen.getByText('Save to today')).toBeTruthy(); // still on review
  });
});

describe('LogScreen — Voice Input', () => {
  // Guards against the wrapper silently resolving to its "unavailable"
  // branch in a way that would make every other "Voice Input works" test
  // below pass vacuously (e.g. if the guard swallowed the tap before ever
  // touching the mocked module). With this mock in place, the wrapper's own
  // `require('expo-speech-recognition')` picks it up, so availability must
  // be true and a tap must reach the mocked module directly.
  test('sanity: the mocked speech module is genuinely wired up (available, and start() called on tap)', async () => {
    await render(<LogScreen />);

    await fireEvent.press(screen.getByText('Voice Input'));

    await waitFor(() => expect(mockedSpeech.requestPermissionsAsync).toHaveBeenCalled());
    await waitFor(() => expect(mockedSpeech.start).toHaveBeenCalledWith({ lang: 'en-US', interimResults: true }));
  });

  test('shows a permission-denied error and never starts listening', async () => {
    mockedSpeech.requestPermissionsAsync.mockResolvedValue({ granted: false } as any);
    await render(<LogScreen />);

    await fireEvent.press(screen.getByText('Voice Input'));

    await waitFor(() => expect(screen.getByText(/Permission to use the microphone was denied/)).toBeTruthy());
    expect(mockedSpeech.start).not.toHaveBeenCalled();
  });

  test('a rapid double-tap before permission resolves triggers exactly one permission request', async () => {
    let resolvePermission: (value: { granted: boolean }) => void = () => {};
    mockedSpeech.requestPermissionsAsync.mockImplementation(
      () => new Promise((resolve) => { resolvePermission = resolve as typeof resolvePermission; })
    );
    await render(<LogScreen />);

    // Both taps happen inside one `act()` so the second (guarded, no-op)
    // tap genuinely lands before the first tap's pending
    // `await requestPermissionsAsync()` settles.
    await doubleTap('Voice Input');
    await act(async () => {
      resolvePermission({ granted: true });
    });
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());

    expect(mockedSpeech.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  test('stop() is called immediately after a successful final transcript, not just on cancel/error', async () => {
    mockedApi.analyzeText.mockResolvedValue(analysis);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());
    mockedSpeech.stop.mockClear();

    emitSpeechEvent('result', { results: [{ transcript: 'grilled chicken' }], isFinal: true });

    await waitFor(() => expect(mockedSpeech.stop).toHaveBeenCalled());
  });

  test("recognition ending with no final result shows \"Didn't catch that\" and returns to idle, instead of hanging in listening", async () => {
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());

    emitSpeechEvent('end', {});

    await waitFor(() => expect(screen.getByText("Didn't catch that, try again.")).toBeTruthy());
    expect(screen.getByText('Voice Input')).toBeTruthy(); // back on the idle hub, dismissable like any other error
  });

  test("'end' firing after a final result was already submitted does not show the no-catch error", async () => {
    mockedApi.analyzeText.mockResolvedValue(analysis);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());
    emitSpeechEvent('result', { results: [{ transcript: 'grilled chicken' }], isFinal: true });
    await waitFor(() => expect(screen.getByDisplayValue('Grilled chicken')).toBeTruthy());

    emitSpeechEvent('end', {});

    expect(screen.queryByText("Didn't catch that, try again.")).toBeNull();
  });

  test("'end' firing synchronously right after a final result, before the step transition flushes, does not show the no-catch error", async () => {
    // The 'result' handler sets voiceSubmittedRef synchronously but the step
    // transition away from 'listening' happens asynchronously inside
    // submitDescription. If 'end' fires in that same tick — before the
    // component re-renders with the new step — the closure's `step` is
    // still 'listening', so this exercises the branch where the
    // `step !== 'listening'` guard is false but `voiceSubmittedRef.current`
    // is already true.
    mockedApi.analyzeText.mockResolvedValue(analysis);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());

    await act(async () => {
      emitSpeechEvent('result', { results: [{ transcript: 'grilled chicken' }], isFinal: true });
      emitSpeechEvent('end', {});
    });

    expect(screen.queryByText("Didn't catch that, try again.")).toBeNull();
  });

  test("'end' firing while not listening at all is a no-op", async () => {
    await render(<LogScreen />);
    // Never started listening — exercises the guard's early-return branch.
    emitSpeechEvent('end', {});

    expect(screen.getByText('Voice Input')).toBeTruthy();
    expect(screen.queryByText("Didn't catch that, try again.")).toBeNull();
  });

  test('tapping the tile starts listening and shows the live transcript', async () => {
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));

    await waitFor(() => expect(mockedSpeech.start).toHaveBeenCalledWith({ lang: 'en-US', interimResults: true }));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());

    // Interim (non-final) results update the display but are never sent to the backend.
    emitSpeechEvent('result', { results: [{ transcript: 'a bowl of' }], isFinal: false });
    await waitFor(() => expect(screen.getByText('a bowl of')).toBeTruthy());
    expect(mockedApi.analyzeText).not.toHaveBeenCalled();
  });

  test('a final result submits to analyzeText and shows the review card', async () => {
    mockedApi.analyzeText.mockResolvedValue(analysis);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());

    emitSpeechEvent('result', { results: [{ transcript: 'grilled chicken' }], isFinal: true });

    await waitFor(() => expect(mockedApi.analyzeText).toHaveBeenCalledWith('grilled chicken'));
    await waitFor(() => expect(screen.getByDisplayValue('Grilled chicken')).toBeTruthy());
  });

  test('editing a voice-sourced review field\'s macro numbers updates their values', async () => {
    mockedApi.analyzeText.mockResolvedValue(analysis);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());
    emitSpeechEvent('result', { results: [{ transcript: 'grilled chicken' }], isFinal: true });
    await waitFor(() => expect(screen.getByDisplayValue('520')).toBeTruthy());

    await fireEvent.changeText(screen.getByDisplayValue('520'), '600');
    expect(screen.getByDisplayValue('600')).toBeTruthy();

    await fireEvent.changeText(screen.getByDisplayValue('40'), '45');
    expect(screen.getByDisplayValue('45')).toBeTruthy();

    await fireEvent.changeText(screen.getByDisplayValue('30'), '35');
    expect(screen.getByDisplayValue('35')).toBeTruthy();

    await fireEvent.changeText(screen.getByDisplayValue('12'), '15');
    expect(screen.getByDisplayValue('15')).toBeTruthy();
  });

  test('a result event with no results falls back to an empty transcript', async () => {
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());

    emitSpeechEvent('result', { results: [], isFinal: false });

    // Still on the listening screen, transcript stayed empty — no crash.
    expect(screen.getByText(/Listening/)).toBeTruthy();
    expect(mockedApi.analyzeText).not.toHaveBeenCalled();
  });

  test('an error event with no message uses the generic fallback message', async () => {
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());

    emitSpeechEvent('error', { error: 'unknown', message: '' });

    await waitFor(() => expect(screen.getByText('Speech recognition failed, try again.')).toBeTruthy());
  });

  test('an error event fired while not listening is a no-op', async () => {
    await render(<LogScreen />);
    // Not listening yet (still on the idle hub) — the component's error
    // listener is mounted from render start, so this exercises the guard's
    // early-return branch instead of the "was listening" branch above.
    emitSpeechEvent('error', { error: 'unknown', message: 'Should be ignored' });

    expect(screen.getByText('Voice Input')).toBeTruthy();
    expect(screen.queryByText('Should be ignored')).toBeNull();
  });

  test('a repeated final result only submits once', async () => {
    mockedApi.analyzeText.mockResolvedValue(analysis);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());

    emitSpeechEvent('result', { results: [{ transcript: 'grilled chicken' }], isFinal: true });
    emitSpeechEvent('result', { results: [{ transcript: 'grilled chicken' }], isFinal: true });

    await waitFor(() => expect(screen.getByDisplayValue('Grilled chicken')).toBeTruthy());
    expect(mockedApi.analyzeText).toHaveBeenCalledTimes(1);
  });

  test('an empty final transcript returns to idle without calling analyzeText', async () => {
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());

    emitSpeechEvent('result', { results: [{ transcript: '   ' }], isFinal: true });

    await waitFor(() => expect(screen.getByText('Voice Input')).toBeTruthy());
    expect(mockedApi.analyzeText).not.toHaveBeenCalled();
  });

  test('a speech recognition error shows a message and returns to idle', async () => {
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());

    emitSpeechEvent('error', { error: 'no-speech', message: 'No speech was detected.' });

    await waitFor(() => expect(screen.getByText('No speech was detected.')).toBeTruthy());
    expect(screen.getByText('Voice Input')).toBeTruthy(); // back on the idle hub
  });

  test('a 402 from analyzeText shows the trial-ended paywall', async () => {
    mockedApi.analyzeText.mockRejectedValue(
      new api.ApiError(402, 'Your free trial has ended', {
        billing: { status: 'expired', trialEndsAt: '2026-01-01T00:00:00.000Z', daysLeft: 0 },
      })
    );
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());

    emitSpeechEvent('result', { results: [{ transcript: 'grilled chicken' }], isFinal: true });

    await waitFor(() => expect(screen.getByText('Your free month is up')).toBeTruthy());
  });

  test('a generic (non-402) analyzeText failure shows an error and returns to idle', async () => {
    mockedApi.analyzeText.mockRejectedValue(new api.ApiError(502, 'Could not analyze description, try again'));
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());

    emitSpeechEvent('result', { results: [{ transcript: 'grilled chicken' }], isFinal: true });

    await waitFor(() => expect(screen.getByText('Could not analyze description, try again')).toBeTruthy());
    expect(screen.getByText('Voice Input')).toBeTruthy(); // back on the idle hub
  });

  test('cancel while listening stops recognition and returns to idle', async () => {
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText('Cancel')).toBeTruthy());

    await fireEvent.press(screen.getByText('Cancel'));

    expect(mockedSpeech.stop).toHaveBeenCalled();
    expect(screen.getByText('Voice Input')).toBeTruthy();
  });

  test('saving a voice-sourced entry logs it with source "ai"', async () => {
    mockedApi.analyzeText.mockResolvedValue(analysis);
    mockedApi.createLog.mockResolvedValue({} as api.FoodLog);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Voice Input'));
    await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());
    emitSpeechEvent('result', { results: [{ transcript: 'grilled chicken' }], isFinal: true });
    await waitFor(() => expect(screen.getByText('Save to today')).toBeTruthy());

    await fireEvent.press(screen.getByText('Save to today'));

    await waitFor(() =>
      expect(mockedApi.createLog).toHaveBeenCalledWith(expect.objectContaining({ source: 'ai' }))
    );
  });
});

describe('LogScreen — Barcode Hunt', () => {
  function scan(data = '3017620422003') {
    latestOnBarcodeScanned?.({ type: 'ean13', data });
  }

  test('shows a permission-denied error and never opens the camera', async () => {
    mockCameraPermission = { granted: false };
    mockRequestCameraPermission.mockResolvedValue({ granted: false });
    await render(<LogScreen />);

    await fireEvent.press(screen.getByText('Barcode Hunt'));

    await waitFor(() => expect(screen.getByText(/Permission to use the camera was denied/)).toBeTruthy());
    expect(screen.queryByTestId('camera-view')).toBeNull();
  });

  test('a rapid double-tap before permission resolves triggers exactly one permission request', async () => {
    mockCameraPermission = { granted: false }; // force the async requestCameraPermission() path
    let resolvePermission: (value: { granted: boolean }) => void = () => {};
    mockRequestCameraPermission.mockImplementation(
      () => new Promise((resolve) => { resolvePermission = resolve; })
    );
    await render(<LogScreen />);

    // See the matching Voice Input test above for why both taps (and
    // resolving the permission) happen inside one `act()`.
    await doubleTap('Barcode Hunt');
    await act(async () => {
      resolvePermission({ granted: true });
    });
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());

    expect(mockRequestCameraPermission).toHaveBeenCalledTimes(1);
  });

  test('tapping the tile opens the camera view', async () => {
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Barcode Hunt'));

    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
  });

  test('a successful scan looks up the barcode and shows the review card', async () => {
    mockedApi.lookupBarcode.mockResolvedValue(analysis);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Barcode Hunt'));
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());

    scan();

    await waitFor(() => expect(mockedApi.lookupBarcode).toHaveBeenCalledWith('3017620422003'));
    await waitFor(() => expect(screen.getByDisplayValue('Grilled chicken')).toBeTruthy());
  });

  test('rapid repeated scans of the same barcode trigger exactly one lookup', async () => {
    mockedApi.lookupBarcode.mockResolvedValue(analysis);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Barcode Hunt'));
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());

    scan();
    scan();
    scan();

    await waitFor(() => expect(screen.getByDisplayValue('Grilled chicken')).toBeTruthy());
    expect(mockedApi.lookupBarcode).toHaveBeenCalledTimes(1);
  });

  test('a non-ApiError lookup failure shows the generic unreachable-server message', async () => {
    mockedApi.lookupBarcode.mockRejectedValue(new Error('network exploded'));
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Barcode Hunt'));
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());

    scan();

    await waitFor(() => expect(screen.getByText('Could not reach the server.')).toBeTruthy());
  });

  test('a not-found barcode shows a clear error, not a crash or blank review card', async () => {
    mockedApi.lookupBarcode.mockRejectedValue(new api.ApiError(404, 'No product found for this barcode'));
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Barcode Hunt'));
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());

    scan();

    await waitFor(() => expect(screen.getByText('No product found for this barcode')).toBeTruthy());
    expect(screen.queryByDisplayValue('Grilled chicken')).toBeNull();
  });

  test('a found-but-no-nutrition-data barcode shows its own distinct error', async () => {
    mockedApi.lookupBarcode.mockRejectedValue(
      new api.ApiError(404, 'Found a product, but it has no nutrition data on file')
    );
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Barcode Hunt'));
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());

    scan();

    await waitFor(() =>
      expect(screen.getByText('Found a product, but it has no nutrition data on file')).toBeTruthy()
    );
  });

  test('a product with only per-100g data shows the caveat with the low-confidence styling weight', async () => {
    mockedApi.lookupBarcode.mockResolvedValue({
      ...analysis,
      confidence: 'medium',
      caveat: 'No serving size listed for this product — values shown are per 100g.',
    });
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Barcode Hunt'));
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());

    scan();

    await waitFor(() =>
      expect(screen.getByText(/values shown are per 100g/)).toBeTruthy()
    );
  });

  test('a product with serving-size data shows no per-100g caveat', async () => {
    mockedApi.lookupBarcode.mockResolvedValue({ ...analysis, confidence: 'medium', caveat: null });
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Barcode Hunt'));
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());

    scan();

    await waitFor(() => expect(screen.getByDisplayValue('Grilled chicken')).toBeTruthy());
    expect(screen.queryByText(/per 100g/)).toBeNull();
  });

  test('cancel while scanning returns to idle and re-arms the dedup guard for next time', async () => {
    mockedApi.lookupBarcode.mockResolvedValue(analysis);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Barcode Hunt'));
    await waitFor(() => expect(screen.getByText('Cancel')).toBeTruthy());

    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.getByText('Barcode Hunt')).toBeTruthy();

    await fireEvent.press(screen.getByText('Barcode Hunt'));
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
    scan();

    await waitFor(() => expect(mockedApi.lookupBarcode).toHaveBeenCalledTimes(1));
  });

  test('saving a barcode-sourced entry logs it with source "barcode"', async () => {
    mockedApi.lookupBarcode.mockResolvedValue(analysis);
    mockedApi.createLog.mockResolvedValue({} as api.FoodLog);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Barcode Hunt'));
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
    scan();
    await waitFor(() => expect(screen.getByText('Save to today')).toBeTruthy());

    await fireEvent.press(screen.getByText('Save to today'));

    await waitFor(() =>
      expect(mockedApi.createLog).toHaveBeenCalledWith(expect.objectContaining({ source: 'barcode' }))
    );
  });

  // Ticket 014 didn't touch the single-item confirmSave() path (still used
  // by voice/barcode, unlike photo scans' new confirmSaveItems()) — these
  // two cases exercise confirmSave()'s own blank-foodName guard and its own
  // save-failure catch branch, which previously were only reachable via the
  // photo-scan flow before it moved to the multi-item review step.
  test('clearing the food name on a barcode result blocks saving with a clear message', async () => {
    mockedApi.lookupBarcode.mockResolvedValue(analysis);
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Barcode Hunt'));
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
    scan();
    await waitFor(() => expect(screen.getByDisplayValue('Grilled chicken')).toBeTruthy());

    await fireEvent.changeText(screen.getByDisplayValue('Grilled chicken'), '');
    await fireEvent.press(screen.getByText('Save to today'));

    await waitFor(() => expect(screen.getByText('Enter a food name before saving.')).toBeTruthy());
    expect(mockedApi.createLog).not.toHaveBeenCalled();
  });

  test('a save failure on a barcode result shows an error and stays on the review card', async () => {
    mockedApi.lookupBarcode.mockResolvedValue(analysis);
    mockedApi.createLog.mockRejectedValue(new api.ApiError(500, 'Could not save this entry.'));
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Barcode Hunt'));
    await waitFor(() => expect(screen.getByTestId('camera-view')).toBeTruthy());
    scan();
    await waitFor(() => expect(screen.getByText('Save to today')).toBeTruthy());

    await fireEvent.press(screen.getByText('Save to today'));

    await waitFor(() => expect(screen.getByText('Could not save this entry.')).toBeTruthy());
    expect(screen.getByText('Save to today')).toBeTruthy(); // still on review
  });
});

describe('LogScreen — TrialEndedPaywall', () => {
  async function reachPaywall() {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockRejectedValue(
      new api.ApiError(402, 'Your free trial has ended', {
        billing: { status: 'expired', trialEndsAt: '2026-01-01T00:00:00.000Z', daysLeft: 0 },
      })
    );
    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));
    await waitFor(() => expect(screen.getByText('Your free month is up')).toBeTruthy());
  }

  // Note: subscribe()'s native branch does `await import('expo-web-browser')`.
  // babel-preset-expo leaves that as a real dynamic import (for code-splitting),
  // which Jest can't intercept without --experimental-vm-modules — it always
  // throws "A dynamic import callback was invoked without
  // --experimental-vm-modules" here, caught by the component's try/catch. So
  // this test can only verify the checkout session gets requested correctly;
  // the WebBrowser hand-off itself isn't exercisable in this test environment.
  test('subscribe requests a checkout session with the right redirect URLs', async () => {
    mockedApi.createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
    await reachPaywall();

    await fireEvent.press(screen.getByText('Subscribe'));

    await waitFor(() => expect(mockedApi.createCheckoutSession).toHaveBeenCalled());
    const [successUrl, cancelUrl] = mockedApi.createCheckoutSession.mock.calls[0];
    expect(successUrl).toContain('checkout=success');
    expect(cancelUrl).toContain('checkout=cancel');
  });

  test('a checkout failure shows an error', async () => {
    mockedApi.createCheckoutSession.mockRejectedValue(new api.ApiError(502, 'Could not start checkout, try again'));
    await reachPaywall();

    await fireEvent.press(screen.getByText('Subscribe'));

    await waitFor(() => expect(screen.getByText('Could not start checkout, try again')).toBeTruthy());
  });

  test('dismissing the paywall returns to the log screen', async () => {
    await reachPaywall();
    await fireEvent.press(screen.getByText('Not now'));
    expect(screen.getByText('Snap & Track')).toBeTruthy();
  });
});
