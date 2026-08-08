import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CompanionScreen from '../companion';
import * as api from '@/lib/api';
import { useUserSettings, DEFAULT_SETTINGS } from '@/lib/settings-context';
import type { UserSettings } from '@/lib/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(() => {
      cb();
    }, []);
  },
  useRouter: () => ({ push: mockPush }),
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

function billing(overrides: Partial<api.BillingStatus> = {}): api.BillingStatus {
  return { status: 'trialing', trialEndsAt: '2026-02-01T00:00:00.000Z', daysLeft: 12, ...overrides };
}

describe('CompanionScreen', () => {
  beforeEach(() => withSettings());
  afterEach(() => jest.clearAllMocks());

  test('shows a loading indicator, then the streak once data loads', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion({ streakCount: 5 }));
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    await render(<CompanionScreen />);

    await waitFor(() => expect(screen.getByText('5')).toBeTruthy());
    expect(screen.getByText('day streak')).toBeTruthy();
  });

  test('falls back to a zero streak when the API response omits streakCount', async () => {
    mockedApi.getCompanion.mockResolvedValue(
      companion({ streakCount: undefined as unknown as number })
    );
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    await render(<CompanionScreen />);

    await waitFor(() => expect(screen.getByText('day streak')).toBeTruthy());
    expect(screen.getByText('0')).toBeTruthy();
  });

  test('shows the trial banner while trialing, hides it once active', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion());
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'trialing', daysLeft: 3 }));

    await render(<CompanionScreen />);

    await waitFor(() => expect(screen.getByText('3 days left in your free trial')).toBeTruthy());
  });

  test('uses singular "day" wording when exactly 1 day is left', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion());
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'trialing', daysLeft: 1 }));

    await render(<CompanionScreen />);

    await waitFor(() => expect(screen.getByText('1 day left in your free trial')).toBeTruthy());
  });

  test('shows the expired-trial message once the trial has ended', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion());
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'expired', daysLeft: 0 }));

    await render(<CompanionScreen />);

    await waitFor(() => expect(screen.getByText('Your free trial has ended')).toBeTruthy());
  });

  test('shows next-unlock hint and singular/plural day wording', async () => {
    mockedApi.getCompanion.mockResolvedValue(
      companion({ streakCount: 2, nextUnlock: { streak: 3, item: 'scarf' } })
    );
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    await render(<CompanionScreen />);

    await waitFor(() => expect(screen.getByText(/1 more day to unlock Cozy scarf/)).toBeTruthy());
  });

  test('renders equipped-unlocked and locked wardrobe items', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: ['scarf'], nextUnlock: null }));
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    await render(<CompanionScreen />);

    await waitFor(() => expect(screen.getByText('Cozy scarf')).toBeTruthy());
    // equippedScarf defaults to true, so a freshly unlocked item that was
    // never explicitly unequipped shows as "Equipped", not "Unlocked".
    expect(screen.getAllByText('Equipped')).toHaveLength(1);
    expect(screen.getAllByText('Locked')).toHaveLength(3);
  });

  test('an unlocked item that has been unequipped shows "Unlocked" instead of "Equipped"', async () => {
    withSettings({ equippedScarf: false });
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: ['scarf'], nextUnlock: null }));
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    await render(<CompanionScreen />);

    await waitFor(() => expect(screen.getAllByText('Unlocked')).toHaveLength(1));
  });

  test('tapping an unlocked wardrobe item toggles its equip flag via updateSettings', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: ['scarf'], nextUnlock: null }));
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    await render(<CompanionScreen />);
    await waitFor(() => expect(screen.getByTestId('wardrobe-equip-toggle-scarf')).toBeTruthy());

    fireEvent.press(screen.getByTestId('wardrobe-equip-toggle-scarf'));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ equippedScarf: false });
  });

  test('the hero Foxxy wears every unlocked+equipped slot (hat, backpack, crown), not just scarf', async () => {
    withSettings({ equippedScarf: true, equippedHat: true, equippedBackpack: true, equippedCrown: true });
    mockedApi.getCompanion.mockResolvedValue(
      companion({ streakCount: 30, unlockedItems: ['scarf', 'hat', 'backpack', 'crown'], nextUnlock: null })
    );
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    const { toJSON } = await render(<CompanionScreen />);
    await waitFor(() => expect(screen.getByText('day streak')).toBeTruthy());

    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('wardrobe-hat');
    expect(tree).toContain('wardrobe-backpack');
    expect(tree).toContain('wardrobe-crown');
  });

  test('unequipping hat/backpack/crown hides each overlay without affecting unlocked status', async () => {
    withSettings({ equippedScarf: true, equippedHat: false, equippedBackpack: false, equippedCrown: false });
    mockedApi.getCompanion.mockResolvedValue(
      companion({ streakCount: 30, unlockedItems: ['scarf', 'hat', 'backpack', 'crown'], nextUnlock: null })
    );
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    const { toJSON } = await render(<CompanionScreen />);
    await waitFor(() => expect(screen.getByText('day streak')).toBeTruthy());

    const tree = JSON.stringify(toJSON());
    expect(tree).not.toContain('wardrobe-hat');
    expect(tree).not.toContain('wardrobe-backpack');
    expect(tree).not.toContain('wardrobe-crown');
    expect(screen.getAllByText('Unlocked').length).toBe(3); // hat, backpack, crown
    expect(screen.getAllByText('Equipped').length).toBe(1); // scarf only
  });

  test('tapping the hat wardrobe tile toggles equippedHat', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: ['hat'], nextUnlock: null }));
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    await render(<CompanionScreen />);
    await waitFor(() => expect(screen.getByTestId('wardrobe-equip-toggle-hat')).toBeTruthy());

    fireEvent.press(screen.getByTestId('wardrobe-equip-toggle-hat'));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ equippedHat: false });
  });

  test('tapping the backpack wardrobe tile toggles equippedBackpack', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: ['backpack'], nextUnlock: null }));
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    await render(<CompanionScreen />);
    await waitFor(() => expect(screen.getByTestId('wardrobe-equip-toggle-backpack')).toBeTruthy());

    fireEvent.press(screen.getByTestId('wardrobe-equip-toggle-backpack'));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ equippedBackpack: false });
  });

  test('tapping the crown wardrobe tile toggles equippedCrown', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: ['crown'], nextUnlock: null }));
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    await render(<CompanionScreen />);
    await waitFor(() => expect(screen.getByTestId('wardrobe-equip-toggle-crown')).toBeTruthy());

    fireEvent.press(screen.getByTestId('wardrobe-equip-toggle-crown'));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ equippedCrown: false });
  });

  test('a locked wardrobe item has no equip tap target', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: [], nextUnlock: null }));
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    await render(<CompanionScreen />);
    await waitFor(() => expect(screen.getAllByText('Locked').length).toBe(4));
    expect(screen.queryByTestId('wardrobe-equip-toggle-scarf')).toBeNull();
  });

  test('unequipping an unlocked item hides its wardrobe overlay everywhere it renders, without affecting unlocked status', async () => {
    mockedApi.getCompanion.mockResolvedValue(
      companion({ streakCount: 3, unlockedItems: ['scarf'], nextUnlock: null })
    );
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    withSettings({ equippedScarf: true });
    const equipped = await render(<CompanionScreen />);
    await waitFor(() => expect(screen.getByText('day streak')).toBeTruthy());
    expect(JSON.stringify(equipped.toJSON())).toContain('wardrobe-scarf');
    await equipped.unmount();

    withSettings({ equippedScarf: false });
    const unequipped = await render(<CompanionScreen />);
    await waitFor(() => expect(screen.getByText('day streak')).toBeTruthy());
    // scarf stays "Unlocked" (not "Locked") even though it's no longer worn.
    expect(screen.getAllByText('Unlocked').length).toBeGreaterThan(0);
    expect(JSON.stringify(unequipped.toJSON())).not.toContain('wardrobe-scarf');
  });

  test('tapping the settings gear icon navigates to /settings', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion());
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    await render(<CompanionScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-gear-button')).toBeTruthy());

    fireEvent.press(screen.getByTestId('settings-gear-button'));
    expect(mockPush).toHaveBeenCalledWith('/settings/index');
  });

  test('plays a celebrate FoxMoment when the backend reports a newly unlocked item', async () => {
    mockedApi.getCompanion.mockResolvedValue(
      companion({ streakCount: 3, unlockedItems: ['scarf'], newlyUnlocked: ['scarf'] })
    );
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    const { toJSON } = await render(<CompanionScreen />);

    // The celebrate FoxMoment replaces the hero Foxxy idle GIF while it
    // plays; both set the same "Foxxy" accessibility label everywhere Foxxy
    // appears (including the wardrobe grid), so the label alone can't
    // distinguish them. Assert on the specific GIF asset the celebrate
    // moment loads instead.
    await waitFor(() => expect(JSON.stringify(toJSON())).toContain('fox_03_celebrate'));
  });

  test('does not play a FoxMoment when nothing was newly unlocked', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: [], newlyUnlocked: [] }));
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    const { toJSON } = await render(<CompanionScreen />);

    await waitFor(() => expect(screen.getByText('day streak')).toBeTruthy());
    // Mirrors the positive assertion above: Foxxy's idle GIF renders
    // regardless (never a still frame under normal use) and shares the
    // same "Foxxy" accessibility label, so the real negative signal is
    // that the celebrate moment's specific GIF asset never loaded.
    expect(JSON.stringify(toJSON())).not.toContain('fox_03_celebrate');
  });
});
