import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Tracks the OS "reduce motion" accessibility setting, defaulting to false until resolved. */
export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setEnabled(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setEnabled);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}
