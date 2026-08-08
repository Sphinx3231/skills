import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { useUserSettings } from '@/lib/settings-context';

/**
 * Web twin of `use-color-scheme.ts` (Metro resolves `@/hooks/use-color-
 * scheme` to *this* file on web) — must apply the same `themeMode` override
 * logic, or it silently does nothing on web while appearing to work on
 * native. See docs/plans/user-settings-plan.md's theme-wiring section: this
 * was missed in an earlier draft precisely because it's easy to forget this
 * file exists.
 *
 * The hydration guard below is unrelated to the override — it exists only
 * for the OS-driven ('system') branch, to avoid a static-rendering/client
 * mismatch on first paint. An explicit override (`woodland_dusk`/`dark`)
 * doesn't depend on the OS at all, so it resolves immediately regardless of
 * hydration state.
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const { settings } = useUserSettings();
  const osScheme = useRNColorScheme();

  if (settings.themeMode === 'woodland_dusk') return 'light';
  if (settings.themeMode === 'dark') return 'dark';

  return hasHydrated ? osScheme : 'light';
}
