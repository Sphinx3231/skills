import * as SQLite from 'expo-sqlite';

import type { UserSettings } from '@/lib/api';

// A single-row local cache mirroring the backend's user_settings shape (plus
// daily_calorie_goal, which lives on `users` server-side but is cached here
// alongside everything else so a full UserSettings object round-trips
// through one row). `pending_sync` marks whether the last local write has
// been confirmed by the server yet — read by settings-context.tsx, which
// retries the pending write on every subsequent app-foreground event
// until it succeeds, not just once.
const DB_NAME = 'foxbite-settings.db';

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
    db.execSync(`
      CREATE TABLE IF NOT EXISTS settings_cache (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        daily_calorie_goal INTEGER NOT NULL,
        protein_goal_g INTEGER NOT NULL,
        carbs_goal_g INTEGER NOT NULL,
        fats_goal_g INTEGER NOT NULL,
        macro_unit TEXT NOT NULL,
        theme_mode TEXT NOT NULL,
        motion_setting TEXT NOT NULL,
        equipped_scarf INTEGER NOT NULL,
        equipped_hat INTEGER NOT NULL,
        equipped_crown INTEGER NOT NULL,
        equipped_backpack INTEGER NOT NULL,
        pending_sync INTEGER NOT NULL DEFAULT 0
      );
    `);
  }
  return db;
}

type CachedRow = {
  daily_calorie_goal: number;
  protein_goal_g: number;
  carbs_goal_g: number;
  fats_goal_g: number;
  macro_unit: UserSettings['macroUnit'];
  theme_mode: UserSettings['themeMode'];
  motion_setting: UserSettings['motionSetting'];
  equipped_scarf: number;
  equipped_hat: number;
  equipped_crown: number;
  equipped_backpack: number;
  pending_sync: number;
};

function rowToSettings(row: CachedRow): UserSettings {
  return {
    dailyCalorieGoal: row.daily_calorie_goal,
    proteinGoalG: row.protein_goal_g,
    carbsGoalG: row.carbs_goal_g,
    fatsGoalG: row.fats_goal_g,
    macroUnit: row.macro_unit,
    themeMode: row.theme_mode,
    motionSetting: row.motion_setting,
    equippedScarf: !!row.equipped_scarf,
    equippedHat: !!row.equipped_hat,
    equippedCrown: !!row.equipped_crown,
    equippedBackpack: !!row.equipped_backpack,
  };
}

/** Synchronous read so a mounting SettingsProvider can hydrate its initial
 * state before the first paint, rather than flashing defaults then
 * re-rendering once a network/async read resolves. Returns null on a
 * fresh install (no cache row yet). */
export function readCachedSettings(): UserSettings | null {
  const row = getDb().getFirstSync<CachedRow>('SELECT * FROM settings_cache WHERE id = 1');
  return row ? rowToSettings(row) : null;
}

export function isSyncPending(): boolean {
  const row = getDb().getFirstSync<{ pending_sync: number }>(
    'SELECT pending_sync FROM settings_cache WHERE id = 1'
  );
  return !!row?.pending_sync;
}

/** Upserts the full settings row. `pendingSync` records whether this write
 * still needs to be confirmed by the server. */
export function writeCachedSettings(settings: UserSettings, pendingSync: boolean): void {
  getDb().runSync(
    `INSERT INTO settings_cache (
       id, daily_calorie_goal, protein_goal_g, carbs_goal_g, fats_goal_g,
       macro_unit, theme_mode, motion_setting,
       equipped_scarf, equipped_hat, equipped_crown, equipped_backpack, pending_sync
     ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       daily_calorie_goal = excluded.daily_calorie_goal,
       protein_goal_g = excluded.protein_goal_g,
       carbs_goal_g = excluded.carbs_goal_g,
       fats_goal_g = excluded.fats_goal_g,
       macro_unit = excluded.macro_unit,
       theme_mode = excluded.theme_mode,
       motion_setting = excluded.motion_setting,
       equipped_scarf = excluded.equipped_scarf,
       equipped_hat = excluded.equipped_hat,
       equipped_crown = excluded.equipped_crown,
       equipped_backpack = excluded.equipped_backpack,
       pending_sync = excluded.pending_sync`,
    settings.dailyCalorieGoal,
    settings.proteinGoalG,
    settings.carbsGoalG,
    settings.fatsGoalG,
    settings.macroUnit,
    settings.themeMode,
    settings.motionSetting,
    settings.equippedScarf ? 1 : 0,
    settings.equippedHat ? 1 : 0,
    settings.equippedCrown ? 1 : 0,
    settings.equippedBackpack ? 1 : 0,
    pendingSync ? 1 : 0
  );
}

export function markCacheSynced(): void {
  getDb().runSync('UPDATE settings_cache SET pending_sync = 0 WHERE id = 1');
}

// Test-only escape hatch to force re-opening a fresh in-memory database
// between test cases, since the module-level `db` is otherwise cached for
// the lifetime of the process.
export function __resetForTests(): void {
  db = null;
}
