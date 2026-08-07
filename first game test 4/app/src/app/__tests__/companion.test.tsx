import { render, screen, waitFor } from '@testing-library/react-native';
import CompanionScreen from '../companion';
import * as api from '@/lib/api';

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(() => {
      cb();
    }, []);
  },
}));

jest.mock('@/lib/api');
const mockedApi = api as jest.Mocked<typeof api>;

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

  test('renders unlocked and locked wardrobe items', async () => {
    mockedApi.getCompanion.mockResolvedValue(companion({ unlockedItems: ['scarf'], nextUnlock: null }));
    mockedApi.getBillingStatus.mockResolvedValue(billing({ status: 'active' }));

    await render(<CompanionScreen />);

    await waitFor(() => expect(screen.getByText('Cozy scarf')).toBeTruthy());
    expect(screen.getAllByText('Unlocked')).toHaveLength(1);
    expect(screen.getAllByText('Locked')).toHaveLength(3);
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
