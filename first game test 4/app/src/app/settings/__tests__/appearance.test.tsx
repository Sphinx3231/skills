import { fireEvent, render, screen } from '@testing-library/react-native';
import AppearanceSettingsScreen from '../appearance';
import { useUserSettings, DEFAULT_SETTINGS } from '@/lib/settings-context';
import type { UserSettings } from '@/lib/api';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

const mockUpdateSettings = jest.fn();
jest.mock('@/lib/settings-context', () => {
  const actual = jest.requireActual('@/lib/settings-context');
  return { ...actual, useUserSettings: jest.fn() };
});
const mockedUseUserSettings = useUserSettings as jest.MockedFunction<typeof useUserSettings>;

function withSettings(overrides: Partial<UserSettings> = {}) {
  mockedUseUserSettings.mockReturnValue({
    settings: { ...DEFAULT_SETTINGS, ...overrides },
    updateSettings: mockUpdateSettings,
    syncFailed: false,
  });
}

describe('AppearanceSettingsScreen', () => {
  beforeEach(() => withSettings());
  afterEach(() => jest.clearAllMocks());

  test('lists all 3 theme options and all 3 motion options', async () => {
    await render(<AppearanceSettingsScreen />);

    expect(screen.getByText('Woodland Dusk')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText('System default')).toBeTruthy();
    expect(screen.getByText('Always reduce motion')).toBeTruthy();
    expect(screen.getByText('Always animate')).toBeTruthy();
  });

  test('tapping the dark theme option updates themeMode', async () => {
    withSettings({ themeMode: 'woodland_dusk' });
    await render(<AppearanceSettingsScreen />);

    fireEvent.press(screen.getByTestId('appearance-theme-dark'));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ themeMode: 'dark' });
  });

  test('tapping the system theme option updates themeMode', async () => {
    await render(<AppearanceSettingsScreen />);

    fireEvent.press(screen.getByTestId('appearance-theme-system'));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ themeMode: 'system' });
  });

  test('tapping force_reduced_motion updates motionSetting', async () => {
    await render(<AppearanceSettingsScreen />);

    fireEvent.press(screen.getByTestId('appearance-motion-force_reduced_motion'));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ motionSetting: 'force_reduced_motion' });
  });

  test('tapping full_animations updates motionSetting', async () => {
    await render(<AppearanceSettingsScreen />);

    fireEvent.press(screen.getByTestId('appearance-motion-full_animations'));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ motionSetting: 'full_animations' });
  });

  test('the currently-selected theme option is visually marked with a checkmark, others are not', async () => {
    withSettings({ themeMode: 'dark' });
    await render(<AppearanceSettingsScreen />);
    expect(screen.getByTestId('appearance-theme-dark-checkmark')).toBeTruthy();
    expect(screen.queryByTestId('appearance-theme-woodland_dusk-checkmark')).toBeNull();
    expect(screen.queryByTestId('appearance-theme-system-checkmark')).toBeNull();
  });

  test('tapping back navigates back', async () => {
    await render(<AppearanceSettingsScreen />);
    fireEvent.press(screen.getByTestId('appearance-back-button'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
