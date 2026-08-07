import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import LogScreen from '../log';
import * as api from '@/lib/api';
import * as ImagePicker from 'expo-image-picker';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
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

jest.mock('@/lib/api', () => ({
  // Keep the real ApiError class (auto-mocking it would strip its
  // constructor, breaking `err.message`/`err.status` in the component) and
  // only mock the network-calling functions.
  ...jest.requireActual('@/lib/api'),
  getFrequentFoods: jest.fn(),
  analyzePhoto: jest.fn(),
  createLog: jest.fn(),
  createCheckoutSession: jest.fn(),
}));
const mockedApi = api as jest.Mocked<typeof api>;
const mockedPicker = ImagePicker as jest.Mocked<typeof ImagePicker>;

const analysis: api.FoodAnalysis = {
  foodName: 'Grilled chicken',
  calories: 520,
  proteinG: 40,
  carbsG: 30,
  fatG: 12,
  confidence: 'high',
  notes: '',
};

const asset = { uri: 'file://photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' };

beforeEach(() => {
  mockedApi.getFrequentFoods.mockResolvedValue([]);
  mockedPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as any);
  mockedPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as any);
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
});

describe('LogScreen — analyze + review flow', () => {
  test('camera photo analyzes successfully and shows the review card', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(analysis);

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() => expect(screen.getByDisplayValue('Grilled chicken')).toBeTruthy());
    expect(screen.getByDisplayValue('520')).toBeTruthy();
  });

  test('library photo goes through requestMediaLibraryPermissionsAsync', async () => {
    mockedPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(analysis);

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('From library'));

    await waitFor(() => expect(mockedApi.analyzePhoto).toHaveBeenCalled());
    expect(mockedPicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
  });

  test('shows the low-confidence warning when the model is unsure', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue({ ...analysis, confidence: 'low' });

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() => expect(screen.getByText(/Low confidence/)).toBeTruthy());
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

  test('editing the review fields updates their values', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(analysis);

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
    mockedApi.analyzePhoto.mockResolvedValue({ ...analysis, notes: 'Looks like a large portion.' });

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));

    await waitFor(() => expect(screen.getByText('Looks like a large portion.')).toBeTruthy());
  });

  test('discard returns to the idle hub without saving', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(analysis);

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));
    await waitFor(() => expect(screen.getByText('Discard')).toBeTruthy());

    await fireEvent.press(screen.getByText('Discard'));
    expect(screen.getByText('Snap & Track')).toBeTruthy();
    expect(mockedApi.createLog).not.toHaveBeenCalled();
  });

  test('saving successfully calls createLog and navigates home', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(analysis);
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

  test('a save failure shows an error and stays on the review card', async () => {
    mockedPicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset] } as any);
    mockedApi.analyzePhoto.mockResolvedValue(analysis);
    mockedApi.createLog.mockRejectedValue(new api.ApiError(500, 'Could not save this entry.'));

    await render(<LogScreen />);
    await fireEvent.press(screen.getByText('Snap & Track'));
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
