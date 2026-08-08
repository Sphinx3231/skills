import { useColorScheme as useRNColorScheme } from 'react-native';

import { useUserSettings } from '@/lib/settings-context';

/**
 * Resolves the app's actual color scheme: a stored `themeMode` override
 * (`woodland_dusk` -> 'light', `dark` -> 'dark') takes precedence over the
 * OS value; `themeMode === 'system'` falls through to the OS value exactly
 * like this hook's previous pure-passthrough behavior. This is one of 6
 * files that must all read from this resolved source for a theme change to
 * take effect everywhere — see docs/plans/user-settings-plan.md's
 * theme-wiring section.
 */
export function useColorScheme() {
  const { settings } = useUserSettings();
  const osScheme = useRNColorScheme();

  if (settings.themeMode === 'woodland_dusk') return 'light';
  if (settings.themeMode === 'dark') return 'dark';
  return osScheme;
}
