// Manual mock for the native expo-sqlite module, used automatically by Jest
// for every test (no per-file `jest.mock('expo-sqlite')` needed — Jest picks
// up root-adjacent `__mocks__/<package>` files for node_modules packages).
// Only implements the exact statement shapes settings-db.ts issues; this is
// not a general SQL engine.

let rows = {};

function openDatabaseSync() {
  return {
    execSync() {
      // CREATE TABLE IF NOT EXISTS — nothing to do for the in-memory fake.
    },
    runSync(sql, ...params) {
      if (sql.includes('INSERT INTO settings_cache')) {
        rows[1] = {
          daily_calorie_goal: params[0],
          protein_goal_g: params[1],
          carbs_goal_g: params[2],
          fats_goal_g: params[3],
          macro_unit: params[4],
          theme_mode: params[5],
          motion_setting: params[6],
          equipped_scarf: params[7],
          equipped_hat: params[8],
          equipped_crown: params[9],
          equipped_backpack: params[10],
          pending_sync: params[11],
        };
      } else if (sql.includes('UPDATE settings_cache SET pending_sync = 0')) {
        if (rows[1]) rows[1].pending_sync = 0;
      }
      return { changes: 1, lastInsertRowId: 1 };
    },
    getFirstSync(sql) {
      if (sql.includes('SELECT * FROM settings_cache')) {
        return rows[1] ?? null;
      }
      if (sql.includes('SELECT pending_sync FROM settings_cache')) {
        return rows[1] ? { pending_sync: rows[1].pending_sync } : null;
      }
      return null;
    },
  };
}

// Exposed only for tests to reset the fake store between cases.
function __resetMockDb() {
  rows = {};
}

module.exports = { openDatabaseSync, __resetMockDb };
