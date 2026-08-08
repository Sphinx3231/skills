import type { UserSettings } from '@/lib/api';

// Web-specific twin of settings-db.ts. expo-sqlite's web backend (wa-sqlite,
// WASM-based) isn't resolvable by Metro without extra asset config, and even
// with that fixed its web support is still experimental (no durable storage
// without extra COOP/COEP headers for the WASM worker threads) — so instead
// of a real local SQLite database, web uses localStorage as a single-row
// JSON cache. Same exported function signatures as settings-db.ts so
// settings-context.tsx doesn't need to know which platform it's on.
const STORAGE_KEY = 'foxbite-settings-cache';

// Mirrors settings-context.tsx's DEFAULT_SETTINGS (duplicated, not imported,
// to avoid a circular import — settings-context.tsx imports this module).
// Used only to backfill missing keys from a stale/partial cached blob (e.g.
// after a future schema change adds a field this cache predates), never to
// silently invent a value for a key that's actually present.
const DEFAULTS: UserSettings = {
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

type CachedRow = UserSettings & { pendingSync: boolean };

function readRow(): CachedRow | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CachedRow) : null;
  } catch {
    // Private-browsing Safari (and similar) can throw on localStorage
    // access entirely, not just on write — treat exactly like "no cache
    // yet" rather than crashing the settings provider on mount.
    return null;
  }
}

export function readCachedSettings(): UserSettings | null {
  const row = readRow();
  if (!row) return null;
  const { pendingSync: _pendingSync, ...settings } = row;
  return { ...DEFAULTS, ...settings };
}

export function isSyncPending(): boolean {
  return !!readRow()?.pendingSync;
}

export function writeCachedSettings(settings: UserSettings, pendingSync: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, pendingSync }));
  } catch {
    // Storage full or unavailable — the in-memory context state (the
    // optimistic update that triggered this write) still holds the correct
    // value for the current session; only cross-restart persistence is
    // lost, which matches this project's existing "don't crash on a
    // storage failure" posture elsewhere (e.g. the retry-sync path).
  }
}

export function markCacheSynced(): void {
  const row = readRow();
  if (!row) return;
  writeCachedSettings(row, false);
}

export function __resetForTests(): void {
  localStorage.removeItem(STORAGE_KEY);
}
