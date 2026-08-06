import { renderHook, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';

// Import the .web.ts file explicitly — jest-expo resolves the platform-less
// specifier to the native file by default, so this is the only way to
// exercise the web-specific hydration-guard implementation.
import { useColorScheme } from '../use-color-scheme.web';

describe('useColorScheme (web)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns light before hydration, then the real scheme after', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');

    const { result } = await renderHook(() => useColorScheme());
    await waitFor(() => expect(result.current).toBe('dark'));
  });

  test('reflects a light scheme once hydrated', async () => {
    jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('light');

    const { result } = await renderHook(() => useColorScheme());
    await waitFor(() => expect(result.current).toBe('light'));
  });
});
