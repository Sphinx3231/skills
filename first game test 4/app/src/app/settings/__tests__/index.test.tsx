import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SettingsIndexScreen from '../index';
import { useUserSettings, DEFAULT_SETTINGS } from '@/lib/settings-context';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('@/lib/settings-context', () => {
  const actual = jest.requireActual('@/lib/settings-context');
  return { ...actual, useUserSettings: jest.fn() };
});
const mockedUseUserSettings = useUserSettings as jest.MockedFunction<typeof useUserSettings>;

function withSyncFailed(syncFailed: boolean) {
  mockedUseUserSettings.mockReturnValue({
    settings: DEFAULT_SETTINGS,
    updateSettings: jest.fn(),
    syncFailed,
  });
}

describe('SettingsIndexScreen', () => {
  afterEach(() => jest.clearAllMocks());

  test('lists the 3 settings sub-screens', async () => {
    withSyncFailed(false);
    await render(<SettingsIndexScreen />);

    expect(screen.getByText('Goals & Targets')).toBeTruthy();
    expect(screen.getByText('Appearance & Theme')).toBeTruthy();
    expect(screen.getByText('Wardrobe')).toBeTruthy();
  });

  test('tapping a row navigates to its route', async () => {
    withSyncFailed(false);
    await render(<SettingsIndexScreen />);

    fireEvent.press(screen.getByTestId('settings-row-/settings/goals'));
    expect(mockPush).toHaveBeenCalledWith('/settings/goals');
  });

  test('tapping back navigates back', async () => {
    withSyncFailed(false);
    await render(<SettingsIndexScreen />);

    fireEvent.press(screen.getByTestId('settings-back-button'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test('does not show the sync-failed banner when sync is healthy', async () => {
    withSyncFailed(false);
    await render(<SettingsIndexScreen />);
    expect(screen.queryByTestId('sync-failed-banner')).toBeNull();
  });

  test('shows a non-blocking "changes not saved" banner when a sync has failed', async () => {
    withSyncFailed(true);
    await render(<SettingsIndexScreen />);
    await waitFor(() => expect(screen.getByTestId('sync-failed-banner')).toBeTruthy());
    expect(screen.getByText('Changes not saved')).toBeTruthy();
  });
});
