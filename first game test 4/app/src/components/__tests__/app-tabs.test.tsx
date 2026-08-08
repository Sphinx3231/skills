import { render } from '@testing-library/react-native';

import AppTabs from '../app-tabs';
import { useUserSettings, DEFAULT_SETTINGS } from '@/lib/settings-context';
import type { UserSettings } from '@/lib/api';

// expo-router/unstable-native-tabs has real native-tab requirements this
// jest environment can't satisfy — mocked to plain Views so this test can
// focus on what it actually needs to prove: that AppTabs reads its colors
// from the resolved (override-aware) useColorScheme, not RN's raw hook.
jest.mock('expo-router/unstable-native-tabs', () => {
  const ReactActual = jest.requireActual('react');
  const { View: RNView, Text: RNText } = jest.requireActual('react-native');
  return {
    NativeTabs: Object.assign(
      ({ children, backgroundColor }: any) =>
        ReactActual.createElement(RNView, { testID: 'native-tabs', backgroundColor }, children),
      { Trigger: ({ children }: any) => ReactActual.createElement(RNView, null, children) }
    ),
    Icon: () => null,
    Label: ({ children }: any) => ReactActual.createElement(RNText, null, children),
  };
});

jest.mock('@/lib/settings-context', () => {
  const actual = jest.requireActual('@/lib/settings-context');
  return { ...actual, useUserSettings: jest.fn() };
});
const mockedUseUserSettings = useUserSettings as jest.MockedFunction<typeof useUserSettings>;

function withSettings(overrides: Partial<UserSettings>) {
  mockedUseUserSettings.mockReturnValue({
    settings: { ...DEFAULT_SETTINGS, ...overrides },
    updateSettings: jest.fn(),
    syncFailed: false,
  });
}

describe('AppTabs (native)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('uses the light palette background when themeMode resolves to woodland_dusk', async () => {
    withSettings({ themeMode: 'woodland_dusk' });
    const { getByTestId } = await render(<AppTabs />);
    expect(getByTestId('native-tabs').props.backgroundColor).toBe('#ffffff');
  });

  test('uses the dark palette background when themeMode is overridden to dark', async () => {
    withSettings({ themeMode: 'dark' });
    const { getByTestId } = await render(<AppTabs />);
    expect(getByTestId('native-tabs').props.backgroundColor).toBe('#000000');
  });
});
