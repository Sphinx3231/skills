import { renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useReduceMotion } from '../use-reduce-motion';

describe('useReduceMotion', () => {
  afterEach(() => jest.restoreAllMocks());

  test('resolves to true when the OS reports reduce motion enabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

    const { result } = await renderHook(() => useReduceMotion());
    await waitFor(() => expect(result.current).toBe(true));
  });

  test('resolves to false when the OS reports reduce motion disabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

    const { result } = await renderHook(() => useReduceMotion());
    await waitFor(() => expect(result.current).toBe(false));
  });

  test('updates when the reduceMotionChanged event fires', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    let changeHandler: ((enabled: boolean) => void) | undefined;
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, handler) => {
      changeHandler = handler as unknown as (enabled: boolean) => void;
      return { remove: jest.fn() } as any;
    });

    const { result } = await renderHook(() => useReduceMotion());
    await waitFor(() => expect(result.current).toBe(false));

    changeHandler?.(true);
    await waitFor(() => expect(result.current).toBe(true));
  });
});
