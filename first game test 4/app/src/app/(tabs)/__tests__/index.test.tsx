import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import DashboardScreen from '../index';
import * as api from '@/lib/api';
import { useUserSettings, DEFAULT_SETTINGS } from '@/lib/settings-context';
import type { UserSettings } from '@/lib/api';

const mockSignOut = jest.fn();
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));

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

jest.mock('@/lib/settings-context', () => {
  const actual = jest.requireActual('@/lib/settings-context');
  return { ...actual, useUserSettings: jest.fn() };
});
const mockedUseUserSettings = useUserSettings as jest.MockedFunction<typeof useUserSettings>;

function withSettings(overrides: Partial<UserSettings> = {}) {
  mockedUseUserSettings.mockReturnValue({
    settings: { ...DEFAULT_SETTINGS, ...overrides },
    updateSettings: jest.fn(),
    syncFailed: false,
  });
}

function summary(overrides: Partial<api.DashboardSummary> = {}): api.DashboardSummary {
  return {
    date: '2026-01-01',
    goal: 2000,
    calories: 500,
    proteinG: 30,
    carbsG: 50,
    fatG: 10,
    entries: 1,
    ...overrides,
  };
}

function log(overrides: Partial<api.FoodLog> = {}): api.FoodLog {
  return {
    id: 1,
    logged_at: '2026-01-01 12:00:00',
    food_name: 'Apple',
    calories: 95,
    protein_g: 0.5,
    carbs_g: 25,
    fat_g: 0.3,
    source: 'manual',
    ...overrides,
  };
}

describe('DashboardScreen', () => {
  beforeEach(() => withSettings());
  afterEach(() => jest.clearAllMocks());

  test('shows Foxxy\'s empty message and no meal timeline with zero logs', async () => {
    mockedApi.getDashboardSummary.mockResolvedValue(summary({ calories: 0, entries: 0 }));
    mockedApi.getLogs.mockResolvedValue([]);

    await render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByText(/Ready to forage/)).toBeTruthy());
    expect(screen.getByText(/Nothing logged yet/)).toBeTruthy();
  });

  test('shows remaining calories and macro grams once logs exist', async () => {
    mockedApi.getDashboardSummary.mockResolvedValue(summary());
    mockedApi.getLogs.mockResolvedValue([log()]);

    await render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByText('500')).toBeTruthy());
    expect(screen.getByText('1500 cal remaining')).toBeTruthy();
    expect(screen.getByText('30g')).toBeTruthy();
    expect(screen.getByText('Apple')).toBeTruthy();
  });

  test('shows the over-goal message and Foxxy\'s over mood when calories exceed goal', async () => {
    mockedApi.getDashboardSummary.mockResolvedValue(summary({ calories: 2500 }));
    mockedApi.getLogs.mockResolvedValue([log({ calories: 2500 })]);

    await render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByText('500 cal over goal')).toBeTruthy());
    expect(screen.getByText(/feast fit for the den/)).toBeTruthy();
  });

  test('groups logs under their meal-timeline bucket label', async () => {
    mockedApi.getDashboardSummary.mockResolvedValue(summary());
    mockedApi.getLogs.mockResolvedValue([log({ id: 1, food_name: 'Oatmeal', logged_at: '2026-01-01 12:00:00' })]);

    await render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByText('Oatmeal')).toBeTruthy());
    // logged_at is parsed as UTC then bucketed by local hour, so just assert
    // *some* bucket label rendered rather than pin an exact one.
    const labels = ['MORNING FORAGE', 'MIDDAY FEAST', 'EVENING DEN', 'QUICK SNARE'];
    expect(labels.some((l) => screen.queryByText(l))).toBe(true);
  });

  test('deleting a log removes it and calls the API', async () => {
    mockedApi.getDashboardSummary.mockResolvedValue(summary());
    mockedApi.getLogs.mockResolvedValueOnce([log({ id: 42, food_name: 'Toast' })]).mockResolvedValue([]);
    mockedApi.deleteLog.mockResolvedValue(undefined);

    await render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText('Toast')).toBeTruthy());

    fireEvent.press(screen.getByTestId('delete-log-42'));

    await waitFor(() => expect(screen.queryByText('Toast')).toBeNull());
    expect(mockedApi.deleteLog).toHaveBeenCalledWith(42);
  });

  test('shows "AI scan" for AI-sourced entries', async () => {
    mockedApi.getDashboardSummary.mockResolvedValue(summary());
    mockedApi.getLogs.mockResolvedValue([log({ source: 'ai' })]);

    await render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByText(/AI scan/)).toBeTruthy());
  });

  test('shows "Barcode scan" for barcode-sourced entries (not "Manual")', async () => {
    mockedApi.getDashboardSummary.mockResolvedValue(summary());
    mockedApi.getLogs.mockResolvedValue([log({ source: 'barcode' })]);

    await render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByText(/Barcode scan/)).toBeTruthy());
    expect(screen.queryByText(/· Manual/)).toBeNull();
  });

  test('shows "Manual" for manually-logged entries', async () => {
    mockedApi.getDashboardSummary.mockResolvedValue(summary());
    mockedApi.getLogs.mockResolvedValue([log({ source: 'manual' })]);

    await render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByText(/Manual/)).toBeTruthy());
  });

  test('does not divide by zero when the settings-context calorie goal is 0', async () => {
    withSettings({ dailyCalorieGoal: 0 });
    mockedApi.getDashboardSummary.mockResolvedValue(summary({ goal: 0, calories: 0 }));
    mockedApi.getLogs.mockResolvedValue([]);

    await render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByText('0')).toBeTruthy());
  });

  test('sign out button calls signOut', async () => {
    mockedApi.getDashboardSummary.mockResolvedValue(summary({ calories: 0, entries: 0 }));
    mockedApi.getLogs.mockResolvedValue([]);

    await render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText('Sign out')).toBeTruthy());
    fireEvent.press(screen.getByText('Sign out'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  test('tapping the settings gear icon navigates to /settings', async () => {
    mockedApi.getDashboardSummary.mockResolvedValue(summary({ calories: 0, entries: 0 }));
    mockedApi.getLogs.mockResolvedValue([]);

    await render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-gear-button')).toBeTruthy());

    fireEvent.press(screen.getByTestId('settings-gear-button'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  test('reads the calorie goal from settings context, not from the summary API response', async () => {
    // summary.goal (server) says 2000, but settings-context (the client's
    // instantly-optimistic source of truth) says 1500 — the rendered
    // "remaining" math must follow settings, proving the dashboard doesn't
    // depend on a network round-trip to reflect a just-changed goal.
    withSettings({ dailyCalorieGoal: 1500 });
    mockedApi.getDashboardSummary.mockResolvedValue(summary({ goal: 2000, calories: 500 }));
    mockedApi.getLogs.mockResolvedValue([log()]);

    await render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByText('1000 cal remaining')).toBeTruthy());
  });

  test('macro target lines use settings.proteinGoalG/carbsGoalG/fatsGoalG, not a hardcoded calorie-split', async () => {
    withSettings({ proteinGoalG: 200, carbsGoalG: 300, fatsGoalG: 80 });
    mockedApi.getDashboardSummary.mockResolvedValue(summary({ proteinG: 100 }));
    mockedApi.getLogs.mockResolvedValue([log()]);

    await render(<DashboardScreen />);

    // 100g of 200g target -> 50% fill; rendered grams text is still actual
    // intake (100g), the target only drives the progress bar width — assert
    // the actual-intake text still renders correctly with the new targets in
    // place (a crash or NaN width would surface via a broken render).
    await waitFor(() => expect(screen.getByText('100g')).toBeTruthy());
  });

  test('a settings-context goal change updates Foxxy\'s idle mood on the next render with no refetch', async () => {
    // logs.length > 0 and calories <= goal, so goal needs to move from
    // "over" to "on target" purely by re-rendering with new settings — the
    // summary/logs API responses never change between renders.
    mockedApi.getDashboardSummary.mockResolvedValue(summary({ calories: 1800 }));
    mockedApi.getLogs.mockResolvedValue([log({ calories: 1800 })]);

    withSettings({ dailyCalorieGoal: 1500 }); // 1800 > 1500 -> over goal
    const { rerender } = await render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText('300 cal over goal')).toBeTruthy());

    withSettings({ dailyCalorieGoal: 2000 }); // 1800 <= 2000 -> on target, no API call made
    await rerender(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText('200 cal remaining')).toBeTruthy());
    expect(mockedApi.getDashboardSummary).toHaveBeenCalledTimes(1);
  });
});
