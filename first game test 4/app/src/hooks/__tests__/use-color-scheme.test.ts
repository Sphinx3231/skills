import { renderHook } from '@testing-library/react-native';
import { useColorScheme } from '../use-color-scheme';

describe('useColorScheme (native re-export)', () => {
  test('is callable and returns a scheme value', async () => {
    const { result } = await renderHook(() => useColorScheme());
    expect(['light', 'dark', null]).toContain(result.current);
  });
});
