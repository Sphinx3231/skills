import { renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useReduceMotion } from '../use-reduce-motion';
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

describe('useReduceMotion', () => {
  afterEach(() => jest.restoreAllMocks());

  test('resolves to true when the OS reports reduce motion enabled (system_default)', async () => {
    withSettings({ motionSetting: 'system_default' });
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

    const { result } = await renderHook(() => useReduceMotion());
    await waitFor(() => expect(result.current).toBe(true));
  });

  test('resolves to false when the OS reports reduce motion disabled (system_default)', async () => {
    withSettings({ motionSetting: 'system_default' });
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

    const { result } = await renderHook(() => useReduceMotion());
    await waitFor(() => expect(result.current).toBe(false));
  });

  test('updates when the reduceMotionChanged event fires (system_default)', async () => {
    withSettings({ motionSetting: 'system_default' });
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

  test('force_reduced_motion forces true even when the OS reports it disabled', async () => {
    withSettings({ motionSetting: 'force_reduced_motion' });
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

    const { result } = await renderHook(() => useReduceMotion());
    await waitFor(() => expect(result.current).toBe(true));
  });

  test('full_animations forces false even when the OS reports it enabled', async () => {
    withSettings({ motionSetting: 'full_animations' });
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);

    const { result } = await renderHook(() => useReduceMotion());
    // Give the OS promise a chance to resolve; the override must still win.
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBe(false);
  });

  test('force_reduced_motion wins even if the reduceMotionChanged event later reports false', async () => {
    withSettings({ motionSetting: 'force_reduced_motion' });
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    let changeHandler: ((enabled: boolean) => void) | undefined;
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((_event, handler) => {
      changeHandler = handler as unknown as (enabled: boolean) => void;
      return { remove: jest.fn() } as any;
    });

    const { result } = await renderHook(() => useReduceMotion());
    await waitFor(() => expect(result.current).toBe(true));

    changeHandler?.(false);
    expect(result.current).toBe(true);
  });
});
