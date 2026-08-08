import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import * as api from '@/lib/api';
import type { UserSettings } from '@/lib/api';
import { isSyncPending, markCacheSynced, readCachedSettings, writeCachedSettings } from '@/lib/settings-db';

export type { UserSettings };

export const DEFAULT_SETTINGS: UserSettings = {
  dailyCalorieGoal: 2000,
  proteinGoalG: 125,
  carbsGoalG: 225,
  fatsGoalG: 67,
  macroUnit: 'grams',
  themeMode: 'woodland_dusk',
  motionSetting: 'system_default',
  equippedScarf: true,
  equippedHat: true,
  equippedCrown: true,
  equippedBackpack: true,
};

// Trailing-edge debounce per the plan — rapid slider drags / multiple quick
// taps collapse into one PATCH call. Hand-rolled since this codebase has no
// debounce utility today (confirmed by grep) and prefers small hand-written
// helpers (dashboard-logic.ts) over a library for one function.
const SYNC_DEBOUNCE_MS = 500;

type SettingsContextValue = {
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
  /** True once a debounced sync (or a foreground retry of one) has failed —
   * surfaced by the settings screens as a small "changes not saved"
   * indicator, per the plan's "don't lie about sync state" rule. Clears on
   * the next successful sync. While a write stays pending, retrySync() is
   * attempted again on every subsequent app-foreground event, not just
   * once. */
  syncFailed: boolean;
};

// Falling back to defaults (rather than throwing) when no provider is
// mounted lets every existing screen/component that reads theme or
// reduce-motion state via useTheme()/useReduceMotion() keep working
// unchanged in isolation (e.g. component-level tests that render a single
// widget without standing up the full app tree) — mirroring today's actual
// production tree, where SettingsProvider is always mounted at the root
// (`_layout.tsx`), so this fallback is only ever exercised in tests.
const defaultContextValue: SettingsContextValue = {
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
  syncFailed: false,
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // Hydrate synchronously from the local expo-sqlite cache so there's no
  // default-then-correct-value flash on boot — this is what makes "zero
  // layout flash" true, not a network round-trip.
  const [settings, setSettings] = useState<UserSettings>(() => readCachedSettings() ?? DEFAULT_SETTINGS);
  const [syncFailed, setSyncFailed] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriedRef = useRef(false);

  const persistAndSync = useCallback((next: UserSettings, patch: Partial<UserSettings>) => {
    writeCachedSettings(next, true);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      api
        .updateUserSettings(patch)
        .then((serverSettings) => {
          setSettings(serverSettings);
          writeCachedSettings(serverSettings, false);
          markCacheSynced();
          setSyncFailed(false);
          retriedRef.current = false;
        })
        .catch(() => {
          // Leave the optimistic local state as-is (still marked pending in
          // the cache) and surface the non-blocking failure flag.
          // retrySync() below will retry again on the next app-foreground
          // event — and on every one after that for as long as a write
          // stays pending, not just a single one-shot retry.
          setSyncFailed(true);
        });
    }, SYNC_DEBOUNCE_MS);
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<UserSettings>) => {
      const next = { ...settingsRef.current, ...patch };
      setSettings(next);
      persistAndSync(next, patch);
    },
    [persistAndSync]
  );

  const retrySync = useCallback(() => {
    if (!isSyncPending() || retriedRef.current) return;
    retriedRef.current = true;
    api
      .updateUserSettings(settingsRef.current)
      .then((serverSettings) => {
        setSettings(serverSettings);
        writeCachedSettings(serverSettings, false);
        markCacheSynced();
        setSyncFailed(false);
      })
      .catch(() => {
        setSyncFailed(true);
      })
      .finally(() => {
        retriedRef.current = false;
      });
  }, []);

  // Initial load: reconcile the instantly-hydrated cache against the
  // server's copy (source of truth once reachable).
  useEffect(() => {
    api
      .getUserSettings()
      .then((serverSettings) => {
        setSettings(serverSettings);
        writeCachedSettings(serverSettings, false);
      })
      .catch(() => {
        // Offline on boot — keep the cached/default value, retry policy
        // covers reconciling once connectivity returns.
      });
  }, []);

  // Retries a pending sync every time the app comes back to the foreground
  // (retriedRef just guards against overlapping in-flight attempts if
  // multiple 'active' events fire close together) — not a single one-shot
  // retry, per the plan's "retry ... on the next successful app-foreground
  // event" trigger.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') retrySync();
    });
    return () => subscription.remove();
  }, [retrySync]);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, syncFailed }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useUserSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  return ctx ?? defaultContextValue;
}
