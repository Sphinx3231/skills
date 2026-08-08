import { fireEvent, render, screen } from '@testing-library/react-native';
import GoalsSettingsScreen from '../goals';
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

describe('GoalsSettingsScreen', () => {
  beforeEach(() => withSettings());
  afterEach(() => jest.clearAllMocks());

  test('renders the current stored values in each field', async () => {
    withSettings({ dailyCalorieGoal: 2200, proteinGoalG: 140, carbsGoalG: 260, fatsGoalG: 70 });
    await render(<GoalsSettingsScreen />);

    expect(screen.getByTestId('goals-input-dailyCalorieGoal').props.value).toBe('2200');
    expect(screen.getByTestId('goals-input-proteinGoalG').props.value).toBe('140');
    expect(screen.getByTestId('goals-input-carbsGoalG').props.value).toBe('260');
    expect(screen.getByTestId('goals-input-fatsGoalG').props.value).toBe('70');
  });

  test('editing the calorie goal field calls updateSettings with the parsed number', async () => {
    await render(<GoalsSettingsScreen />);

    fireEvent.changeText(screen.getByTestId('goals-input-dailyCalorieGoal'), '2500');
    expect(mockUpdateSettings).toHaveBeenCalledWith({ dailyCalorieGoal: 2500 });
  });

  test('editing a macro target field calls updateSettings with that field only', async () => {
    await render(<GoalsSettingsScreen />);

    fireEvent.changeText(screen.getByTestId('goals-input-proteinGoalG'), '160');
    expect(mockUpdateSettings).toHaveBeenCalledWith({ proteinGoalG: 160 });
  });

  test('clearing a field to empty does not call updateSettings with a bad value', async () => {
    await render(<GoalsSettingsScreen />);

    fireEvent.changeText(screen.getByTestId('goals-input-dailyCalorieGoal'), '');
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  test('typing a negative number does not call updateSettings', async () => {
    await render(<GoalsSettingsScreen />);

    fireEvent.changeText(screen.getByTestId('goals-input-proteinGoalG'), '-5');
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  test('tapping the percentage macro-unit option calls updateSettings', async () => {
    withSettings({ macroUnit: 'grams' });
    await render(<GoalsSettingsScreen />);

    fireEvent.press(screen.getByTestId('goals-macro-unit-percentage'));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ macroUnit: 'percentage' });
  });

  test('tapping back navigates back', async () => {
    await render(<GoalsSettingsScreen />);
    fireEvent.press(screen.getByTestId('goals-back-button'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
