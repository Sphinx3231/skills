import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { useUserSettings } from '@/lib/settings-context';

/**
 * Tracks the OS "reduce motion" accessibility setting, defaulting to false
 * until resolved — with a stored `motionSetting` override layered on top.
 * `force_reduced_motion` and `full_animations` force the result on/off
 * regardless of the OS value; `system_default` (the default) reproduces the
 * previous pure-OS behavior exactly. The override lives *inside* this hook
 * (not at each call site) so every existing consumer (`foxxy.tsx`,
 * `companion.tsx`) gets it for free with no changes of their own — this is
 * the same "hook owns the logic, dumb components take a prop" split
 * `FoxIdle`/`fox-idle.tsx` already uses.
 */
export function useReduceMotion(): boolean {
  const [osEnabled, setOsEnabled] = useState(false);
  const { settings } = useUserSettings();

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setOsEnabled(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setOsEnabled);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  if (settings.motionSetting === 'force_reduced_motion') return true;
  if (settings.motionSetting === 'full_animations') return false;
  return osEnabled;
}
