import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import WardrobeSettingsScreen from '../wardrobe';
import * as api from '@/lib/api';
import { useUserSettings, DEFAULT_SETTINGS } from '@/lib/settings-context';
import type { UserSettings } from '@/lib/api';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(() => {
      cb();
    }, []);
  },
}));

jest.mock('@/lib/api');
const mockedApi = api as jest.Mocked<typeof api>;

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

function companion(overrides: Partial<api.CompanionState> = {}): api.CompanionState {
  return {
    streakCount: 0,
    lastLogDate: null,
    unlockedItems: [],
    newlyUnlocked: [],
    nextUnlock: { streak: 3, item: 'scarf' },
    ...overrides,
  };
}

describe('WardrobeSettingsScreen', () => {
  beforeEach(() => withSettings());
  afterEach(() => jest.clearAllMocks());

  test('shows a loading indicator, then locked/unlocked rows once loaded', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: ['scarf'] }));
    await render(<WardrobeSettingsScreen />);

    await waitFor(() => expect(screen.getByText('Cozy scarf')).toBeTruthy());
    expect(screen.getAllByText('Locked')).toHaveLength(3);
  });

  test('an unlocked+equipped item shows "Equipped"', async () => {
    withSettings({ equippedScarf: true });
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: ['scarf'] }));
    await render(<WardrobeSettingsScreen />);

    await waitFor(() => expect(screen.getByText('Equipped')).toBeTruthy());
  });

  test('an unlocked+unequipped item shows "Unlocked"', async () => {
    withSettings({ equippedScarf: false });
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: ['scarf'] }));
    await render(<WardrobeSettingsScreen />);

    await waitFor(() => expect(screen.getByText('Unlocked')).toBeTruthy());
  });

  test('tapping an unlocked item toggles its equip flag', async () => {
    withSettings({ equippedScarf: true });
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: ['scarf'] }));
    await render(<WardrobeSettingsScreen />);

    await waitFor(() => expect(screen.getByTestId('wardrobe-settings-toggle-scarf')).toBeTruthy());
    fireEvent.press(screen.getByTestId('wardrobe-settings-toggle-scarf'));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ equippedScarf: false });
  });

  test('tapping the hat/backpack/crown rows toggles their respective equip flags', async () => {
    withSettings({ equippedHat: true, equippedBackpack: true, equippedCrown: true });
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: ['hat', 'backpack', 'crown'] }));
    const screenRender = await render(<WardrobeSettingsScreen />);

    await waitFor(() => expect(screen.getByTestId('wardrobe-settings-toggle-hat')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('wardrobe-settings-toggle-hat'));
    });
    expect(mockUpdateSettings).toHaveBeenCalledWith({ equippedHat: false });

    await act(async () => {
      fireEvent.press(screen.getByTestId('wardrobe-settings-toggle-backpack'));
    });
    expect(mockUpdateSettings).toHaveBeenCalledWith({ equippedBackpack: false });

    await act(async () => {
      fireEvent.press(screen.getByTestId('wardrobe-settings-toggle-crown'));
    });
    expect(mockUpdateSettings).toHaveBeenCalledWith({ equippedCrown: false });

    await screenRender.unmount();
  });

  test('a locked item has no tap target', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: [] }));
    await render(<WardrobeSettingsScreen />);

    await waitFor(() => expect(screen.getAllByText('Locked').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('wardrobe-settings-toggle-scarf')).toBeNull();
  });

  test('tapping back navigates back', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion());
    await render(<WardrobeSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('wardrobe-back-button')).toBeTruthy());

    fireEvent.press(screen.getByTestId('wardrobe-back-button'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
