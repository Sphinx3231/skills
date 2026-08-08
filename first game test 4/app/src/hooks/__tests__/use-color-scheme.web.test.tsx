import { renderHook, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';

// Import the .web.ts file explicitly — jest-expo resolves the platform-less
// specifier to the native file by default, so this is the only way to
// exercise the web-specific hydration-guard implementation.
import { useColorScheme } from '../use-color-scheme.web';
import { useUserSettings, DEFAULT_SETTINGS } from '@/lib/settings-context';
import type { UserSettings } from '@/lib/api';

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

// Rewritten per the user-settings ticket: this web-specific twin
// (`@/hooks/use-color-scheme` resolves to *this* file on web) must apply
// the same themeMode-override logic as the native file, or the override
// would silently do nothing on the one platform this project's own
// headless verification (the run-foxbite-web skill) actually exercises.
// Previously this test only asserted pure OS-passthrough behavior, which
// would have kept passing even if this file were never touched.
describe('useColorScheme (web, with themeMode override)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('woodland_dusk override resolves to light immediately, even before hydration/OS resolves', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
    withSettings({ themeMode: 'woodland_dusk' });

    const { result } = await renderHook(() => useColorScheme());
    expect(result.current).toBe('light');
  });

  test('dark override resolves to dark regardless of the OS value', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light');
    withSettings({ themeMode: 'dark' });

    const { result } = await renderHook(() => useColorScheme());
    expect(result.current).toBe('dark');
  });

  test('system returns light before hydration, then the real OS scheme after', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
    withSettings({ themeMode: 'system' });

    const { result } = await renderHook(() => useColorScheme());
    await waitFor(() => expect(result.current).toBe('dark'));
  });

  test('system reflects a light OS scheme once hydrated', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light');
    withSettings({ themeMode: 'system' });

    const { result } = await renderHook(() => useColorScheme());
    await waitFor(() => expect(result.current).toBe('light'));
  });
});
