import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import DashboardScreen from '../index';
import * as api from '@/lib/api';

const mockSignOut = jest.fn();
jest.mock('@clerk/expo', () => ({ useAuth: () => ({ signOut: mockSignOut }) }));

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

  test('does not divide by zero when the calorie goal is 0', async () => {
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
});
