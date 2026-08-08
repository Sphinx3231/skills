import { renderHook } from '@testing-library/react-native';
import * as ReactNative from 'react-native';

import { useColorScheme } from '../use-color-scheme';
import { useUserSettings } from '@/lib/settings-context';
import { DEFAULT_SETTINGS } from '@/lib/settings-context';
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

// Rewritten per the user-settings ticket: this hook is no longer a pure OS
// passthrough — a stored `themeMode` override now takes precedence, and
// only `themeMode: 'system'` falls through to the OS value. The previous
// version of this test only asserted "returns a scheme value", which would
// keep passing by accident even if the override wiring were entirely
// missing — this version pins the override behavior directly.
describe('useColorScheme (native, with themeMode override)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('woodland_dusk override resolves to light regardless of the OS value', async () => {
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

  test('system falls through to the live OS value (dark)', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
    withSettings({ themeMode: 'system' });

    const { result } = await renderHook(() => useColorScheme());
    expect(result.current).toBe('dark');
  });

  test('system falls through to the live OS value (light)', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light');
    withSettings({ themeMode: 'system' });

    const { result } = await renderHook(() => useColorScheme());
    expect(result.current).toBe('light');
  });
});
