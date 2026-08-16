import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { FOOD_NUTRITION_DATA } from "../data/food-nutrition-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tests set DB_PATH=":memory:" so runs don't touch or depend on real data.
const dbPath = process.env.DB_PATH ?? (() => {
  const dataDir = path.join(__dirname, "..", "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "app.db");
})();

export const db = new Database(dbPath);
if (dbPath !== ":memory:") db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON"); // schema declares ON DELETE CASCADE; off by default in sqlite

// Identity (email, password, social login) is owned entirely by Clerk — see
// src/middleware/auth.js. This table only holds the app-specific state Clerk
// doesn't: calorie goal, trial/subscription status, Stripe linkage.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- Clerk user id, e.g. "user_2abc..."
    daily_calorie_goal INTEGER NOT NULL DEFAULT 2000,
    subscription_status TEXT NOT NULL DEFAULT 'trialing',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS food_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    logged_at TEXT NOT NULL DEFAULT (datetime('now')),
    food_name TEXT NOT NULL,
    calories INTEGER NOT NULL,
    protein_g REAL,
    carbs_g REAL,
    fat_g REAL,
    source TEXT NOT NULL DEFAULT 'manual',
    ai_raw_response TEXT
  );

  CREATE TABLE IF NOT EXISTS companion_state (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    streak_count INTEGER NOT NULL DEFAULT 0,
    last_log_date TEXT,
    unlocked_items TEXT NOT NULL DEFAULT '[]'
  );

  -- New in the user-settings ticket. Follows companion_state's 1-row-per-user
  -- pattern exactly. macro_unit/theme_mode/motion_setting are allowlist-
  -- validated in the route layer (backend/src/routes/user.js), not via a SQL
  -- CHECK constraint, matching this codebase's existing route-layer
  -- validation style (see food.js's barcode regex / billing gate).
  -- equipped_* default to 1 (not 0): rendering already gates on BOTH
  -- unlocked and equipped (see app/src/app/(tabs)/companion.tsx), so a locked item
  -- defaulting to "equipped" is harmless and exactly preserves today's
  -- behavior for already-unlocked items.
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    protein_goal_g INTEGER NOT NULL DEFAULT 125,
    carbs_goal_g INTEGER NOT NULL DEFAULT 225,
    fats_goal_g INTEGER NOT NULL DEFAULT 67,
    macro_unit TEXT NOT NULL DEFAULT 'grams',
    theme_mode TEXT NOT NULL DEFAULT 'woodland_dusk',
    motion_setting TEXT NOT NULL DEFAULT 'system_default',
    equipped_scarf INTEGER NOT NULL DEFAULT 1,
    equipped_hat INTEGER NOT NULL DEFAULT 1,
    equipped_crown INTEGER NOT NULL DEFAULT 1,
    equipped_backpack INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- New in ticket 010 (local CLIP food recognition). "label" matches a
  -- food-candidate-labels.js CANDIDATE_LABELS[].key, never a raw model
  -- prompt string — see local-food-analysis.js for why that distinction
  -- matters. Anchor labels never get a row here (filtered out before
  -- lookup, not looked up and expected to miss).
  CREATE TABLE IF NOT EXISTS food_nutrition_reference (
    label TEXT PRIMARY KEY,
    food_name TEXT NOT NULL,
    calories INTEGER NOT NULL,
    protein_g REAL NOT NULL,
    carbs_g REAL NOT NULL,
    fat_g REAL NOT NULL,
    serving_description TEXT NOT NULL
  );
`);

// Idempotent (INSERT OR IGNORE): safe to run on every boot, including every
// DB_PATH=":memory:" test run, with no manual seeding step. Source data is
// the checked-in output of backend/scripts/build-food-nutrition-data.mjs.
const seedNutritionRow = db.prepare(
  `INSERT OR IGNORE INTO food_nutrition_reference
     (label, food_name, calories, protein_g, carbs_g, fat_g, serving_description)
   VALUES (@label, @foodName, @calories, @proteinG, @carbsG, @fatG, @servingDescription)`
);
for (const row of FOOD_NUTRITION_DATA) {
  seedNutritionRow.run(row);
}

export function getOrCreateUser(clerkUserId) {
  db.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)").run(clerkUserId);
  db.prepare("INSERT OR IGNORE INTO companion_state (user_id) VALUES (?)").run(clerkUserId);
  db.prepare("INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)").run(clerkUserId);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(clerkUserId);
}
