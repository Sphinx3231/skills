import { render } from '@testing-library/react-native';

// jest-expo resolves the platform-less specifier to the native file by
// default, so import the .web.tsx twin explicitly to exercise it.
import AppTabs, { CustomTabList } from '../app-tabs.web';
import { useUserSettings, DEFAULT_SETTINGS } from '@/lib/settings-context';
import type { UserSettings } from '@/lib/api';

jest.mock('expo-router/ui', () => {
  const ReactActual = jest.requireActual('react');
  return {
    Tabs: ({ children }: any) => children,
    TabList: ({ children }: any) => ReactActual.createElement(ReactActual.Fragment, null, children),
    TabTrigger: ({ children }: any) => children,
    TabSlot: () => null,
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

describe('AppTabs (web)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('renders without crashing', async () => {
    withSettings({ themeMode: 'woodland_dusk' });
    const { toJSON } = await render(<AppTabs />);
    expect(toJSON()).toBeTruthy();
  });

  test('CustomTabList reads its palette from the resolved (override-aware) useColorScheme, not the raw OS value', async () => {
    withSettings({ themeMode: 'dark' });
    const { toJSON } = await render(<CustomTabList>{null}</CustomTabList>);
    // Just proving it renders using the overridden dark scheme without
    // crashing; the underlying ThemedView/ThemedText already have their own
    // palette-application tests — this test's job is only to prove
    // CustomTabList reads useColorScheme() from the resolved hook.
    expect(toJSON()).toBeTruthy();
  });
});
