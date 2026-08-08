process.env.DB_PATH = ":memory:";

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

let mockedUserId = "user_u1";

mock.module("@clerk/express", {
  exports: {
    getAuth: () => ({ userId: mockedUserId }),
    clerkMiddleware: () => (req, res, next) => next(),
    clerkClient: {},
  },
});

const { userRouter } = await import("../src/routes/user.js");
const { db, getOrCreateUser } = await import("../src/db/index.js");

const app = express();
app.use(express.json());
app.use("/user", userRouter);

test("GET /user/settings returns defaults for a fresh user", async () => {
  mockedUserId = "user_u_new";
  getOrCreateUser(mockedUserId);

  const res = await request(app).get("/user/settings");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, {
    dailyCalorieGoal: 2000,
    proteinGoalG: 125,
    carbsGoalG: 225,
    fatsGoalG: 67,
    macroUnit: "grams",
    themeMode: "woodland_dusk",
    motionSetting: "system_default",
    equippedScarf: true,
    equippedHat: true,
    equippedCrown: true,
    equippedBackpack: true,
  });
});

test("GET /user/settings returns previously-set values", async () => {
  mockedUserId = "user_u_prev";
  getOrCreateUser(mockedUserId);
  db.prepare(
    "UPDATE user_settings SET theme_mode = 'dark', protein_goal_g = 150 WHERE user_id = ?"
  ).run(mockedUserId);

  const res = await request(app).get("/user/settings");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.themeMode, "dark");
  assert.strictEqual(res.body.proteinGoalG, 150);
});

test("PATCH /user/settings updates only the field present in the body", async () => {
  mockedUserId = "user_u_partial";
  getOrCreateUser(mockedUserId);

  const first = await request(app).patch("/user/settings").send({ carbsGoalG: 300 });
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.body.carbsGoalG, 300);
  assert.strictEqual(first.body.proteinGoalG, 125); // untouched, still default

  const second = await request(app).patch("/user/settings").send({ proteinGoalG: 140 });
  assert.strictEqual(second.status, 200);
  assert.strictEqual(second.body.proteinGoalG, 140);
  assert.strictEqual(second.body.carbsGoalG, 300); // survives the earlier write untouched
});

test("PATCH /user/settings rejects negative calorie/macro values", async () => {
  mockedUserId = "user_u_negative";
  getOrCreateUser(mockedUserId);

  const res = await request(app).patch("/user/settings").send({ dailyCalorieGoal: -100 });
  assert.strictEqual(res.status, 400);

  const macroRes = await request(app).patch("/user/settings").send({ proteinGoalG: -5 });
  assert.strictEqual(macroRes.status, 400);
});

test("PATCH /user/settings rejects non-finite calorie values", async () => {
  mockedUserId = "user_u_nonfinite";
  getOrCreateUser(mockedUserId);

  const res = await request(app).patch("/user/settings").send({ dailyCalorieGoal: Infinity });
  assert.strictEqual(res.status, 400);
});

test("PATCH /user/settings rejects an invalid themeMode", async () => {
  mockedUserId = "user_u_theme";
  getOrCreateUser(mockedUserId);
  const res = await request(app).patch("/user/settings").send({ themeMode: "neon" });
  assert.strictEqual(res.status, 400);
});

test("PATCH /user/settings rejects an invalid motionSetting", async () => {
  mockedUserId = "user_u_motion";
  getOrCreateUser(mockedUserId);
  const res = await request(app).patch("/user/settings").send({ motionSetting: "bogus" });
  assert.strictEqual(res.status, 400);
});

test("PATCH /user/settings rejects an invalid macroUnit", async () => {
  mockedUserId = "user_u_macrounit";
  getOrCreateUser(mockedUserId);
  const res = await request(app).patch("/user/settings").send({ macroUnit: "ounces" });
  assert.strictEqual(res.status, 400);
});

test("PATCH /user/settings rejects equippedScarf: true for an unlocked-but-not-yet-earned slot (reject-on-change)", async () => {
  mockedUserId = "user_u_equip_reject";
  getOrCreateUser(mockedUserId);
  // No streak — scarf is not in unlocked_items, current DB value is the
  // default true. Explicitly flip it false first so this genuinely
  // exercises a false -> true *change*, not a no-op resend.
  db.prepare("UPDATE user_settings SET equipped_scarf = 0 WHERE user_id = ?").run(mockedUserId);

  const res = await request(app).patch("/user/settings").send({ equippedScarf: true });
  assert.strictEqual(res.status, 400);
});

test("PATCH /user/settings accepts a no-op resend of the default-true value for a locked slot", async () => {
  mockedUserId = "user_u_equip_noop";
  getOrCreateUser(mockedUserId);
  // Fresh row: equipped_scarf defaults to 1/true even though scarf isn't
  // unlocked. Re-sending true must succeed (a real bug caught in review).
  const res = await request(app).patch("/user/settings").send({ equippedScarf: true });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.equippedScarf, true);
});

test("PATCH /user/settings accepts equippedScarf: true once the slot is actually unlocked", async () => {
  mockedUserId = "user_u_equip_ok";
  getOrCreateUser(mockedUserId);
  db.prepare(
    "UPDATE companion_state SET unlocked_items = ? WHERE user_id = ?"
  ).run(JSON.stringify(["scarf"]), mockedUserId);
  db.prepare("UPDATE user_settings SET equipped_scarf = 0 WHERE user_id = ?").run(mockedUserId);

  const res = await request(app).patch("/user/settings").send({ equippedScarf: true });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.equippedScarf, true);
});

test("PATCH /user/settings accepts equippedX: false regardless of unlock state", async () => {
  mockedUserId = "user_u_equip_false";
  getOrCreateUser(mockedUserId);
  const res = await request(app).patch("/user/settings").send({ equippedCrown: false });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.equippedCrown, false);
});

test("PATCH /user/settings rejects non-boolean equipped fields", async () => {
  mockedUserId = "user_u_equip_type";
  getOrCreateUser(mockedUserId);
  const res = await request(app).patch("/user/settings").send({ equippedHat: "yes" });
  assert.strictEqual(res.status, 400);
});

test("PATCH /user/settings dailyCalorieGoal writes through to users.daily_calorie_goal", async () => {
  mockedUserId = "user_u_calorie";
  getOrCreateUser(mockedUserId);

  const res = await request(app).patch("/user/settings").send({ dailyCalorieGoal: 2400 });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.dailyCalorieGoal, 2400);

  // Verify a real round-trip via a direct DB read, not just the response body.
  const row = db.prepare("SELECT daily_calorie_goal FROM users WHERE id = ?").get(mockedUserId);
  assert.strictEqual(row.daily_calorie_goal, 2400);
});

test("PATCH /user/settings accepts a valid themeMode/motionSetting/macroUnit change", async () => {
  mockedUserId = "user_u_enum_ok";
  getOrCreateUser(mockedUserId);

  const res = await request(app).patch("/user/settings").send({
    themeMode: "dark",
    motionSetting: "force_reduced_motion",
    macroUnit: "percentage",
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.themeMode, "dark");
  assert.strictEqual(res.body.motionSetting, "force_reduced_motion");
  assert.strictEqual(res.body.macroUnit, "percentage");
});

test("PATCH /user/settings with only dailyCalorieGoal leaves user_settings columns untouched", async () => {
  mockedUserId = "user_u_calorie_only";
  getOrCreateUser(mockedUserId);

  const res = await request(app).patch("/user/settings").send({ dailyCalorieGoal: 1800 });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.dailyCalorieGoal, 1800);
  assert.strictEqual(res.body.proteinGoalG, 125); // untouched default
});
