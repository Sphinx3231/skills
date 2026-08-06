process.env.DB_PATH = ":memory:";

import { test } from "node:test";
import assert from "node:assert/strict";
import { db, getOrCreateUser } from "../src/db/index.js";

test("getOrCreateUser creates a user row and companion_state row on first call", () => {
  const user = getOrCreateUser("user_abc");
  assert.strictEqual(user.id, "user_abc");
  assert.strictEqual(user.daily_calorie_goal, 2000);
  assert.strictEqual(user.subscription_status, "trialing");

  const companion = db.prepare("SELECT * FROM companion_state WHERE user_id = ?").get("user_abc");
  assert.ok(companion, "companion_state row should exist");
  assert.strictEqual(companion.streak_count, 0);
  assert.strictEqual(companion.unlocked_items, "[]");
});

test("getOrCreateUser is idempotent — second call doesn't duplicate or reset the row", () => {
  getOrCreateUser("user_dup");
  db.prepare("UPDATE users SET daily_calorie_goal = 2500 WHERE id = ?").run("user_dup");

  const user = getOrCreateUser("user_dup");
  assert.strictEqual(user.daily_calorie_goal, 2500, "existing row must not be overwritten");

  const count = db.prepare("SELECT COUNT(*) AS n FROM users WHERE id = ?").get("user_dup").n;
  assert.strictEqual(count, 1);
});

test("food_logs cascade-deletes when the owning user is deleted", () => {
  getOrCreateUser("user_cascade");
  db.prepare(
    "INSERT INTO food_logs (user_id, food_name, calories) VALUES ('user_cascade', 'Toast', 200)"
  ).run();

  db.prepare("DELETE FROM users WHERE id = 'user_cascade'").run();

  const remaining = db.prepare("SELECT COUNT(*) AS n FROM food_logs WHERE user_id = 'user_cascade'").get().n;
  assert.strictEqual(remaining, 0);
});
