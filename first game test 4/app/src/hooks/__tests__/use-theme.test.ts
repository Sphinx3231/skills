import { renderHook } from '@testing-library/react-native';
import { useTheme } from '../use-theme';
import { Colors } from '@/constants/theme';

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: jest.fn() }));
import { useColorScheme } from '@/hooks/use-color-scheme';

describe('useTheme', () => {
  test('returns the dark palette when the scheme is dark', async () => {
    (useColorScheme as jest.Mock).mockReturnValue('dark');
    const { result } = await renderHook(() => useTheme());
    expect(result.current).toEqual(Colors.dark);
  });

  test('returns the light palette when the scheme is light', async () => {
    (useColorScheme as jest.Mock).mockReturnValue('light');
    const { result } = await renderHook(() => useTheme());
    expect(result.current).toEqual(Colors.light);
  });

  test('falls back to the light palette when the scheme is null/undefined', async () => {
    (useColorScheme as jest.Mock).mockReturnValue(null);
    const { result } = await renderHook(() => useTheme());
    expect(result.current).toEqual(Colors.light);
  });
});
