process.env.DB_PATH = ":memory:";

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

let mockedUserId = "user_c1";
mock.module("@clerk/express", {
  exports: {
    getAuth: () => ({ userId: mockedUserId }),
    clerkMiddleware: () => (req, res, next) => next(),
    clerkClient: {},
  },
});

const { companionRouter } = await import("../src/routes/companion.js");
const { db, getOrCreateUser } = await import("../src/db/index.js");

const app = express();
app.use(express.json());
app.use("/companion", companionRouter);

test("GET /companion reports zero streak and no unlocks for a brand-new user", async () => {
  mockedUserId = "user_c_new";
  getOrCreateUser(mockedUserId);
  const res = await request(app).get("/companion");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.streakCount, 0);
  assert.deepStrictEqual(res.body.unlockedItems, []);
  assert.deepStrictEqual(res.body.nextUnlock, { streak: 3, item: "scarf" });
});

test("GET /companion unlocks items retroactively once the streak crosses a threshold", async () => {
  mockedUserId = "user_c_streak7";
  getOrCreateUser(mockedUserId);
  db.prepare("UPDATE companion_state SET streak_count = 7 WHERE user_id = ?").run(mockedUserId);

  const res = await request(app).get("/companion");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.streakCount, 7);
  assert.deepStrictEqual(res.body.unlockedItems.sort(), ["hat", "scarf"]);
  assert.deepStrictEqual(res.body.newlyUnlocked.sort(), ["hat", "scarf"]);
  assert.deepStrictEqual(res.body.nextUnlock, { streak: 14, item: "backpack" });

  // Persisted, and not reported as "newly" unlocked on a second read.
  const second = await request(app).get("/companion");
  assert.deepStrictEqual(second.body.newlyUnlocked, []);
});

test("GET /companion reports nextUnlock: null once every item is unlocked", async () => {
  mockedUserId = "user_c_maxed";
  getOrCreateUser(mockedUserId);
  db.prepare("UPDATE companion_state SET streak_count = 30 WHERE user_id = ?").run(mockedUserId);

  const res = await request(app).get("/companion");
  assert.strictEqual(res.body.unlockedItems.length, 4);
  assert.strictEqual(res.body.nextUnlock, null);
});
