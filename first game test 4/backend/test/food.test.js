process.env.DB_PATH = ":memory:";

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

let mockedUserId = "user_food1";
let analyzeShouldFail = false;

mock.module("@clerk/express", {
  exports: {
    getAuth: () => ({ userId: mockedUserId }),
    clerkMiddleware: () => (req, res, next) => next(),
    clerkClient: {},
  },
});

mock.module("../src/lib/anthropic.js", {
  exports: {
    analyzeFoodPhoto: async () => {
      if (analyzeShouldFail) throw new Error("model unavailable");
      return {
        foodName: "Grilled chicken with rice",
        calories: 520,
        proteinG: 40,
        carbsG: 55,
        fatG: 12,
        confidence: "high",
        notes: "",
      };
    },
  },
});

const { foodRouter } = await import("../src/routes/food.js");
const { db } = await import("../src/db/index.js");

const app = express();
app.use(express.json());
app.use("/food", foodRouter);

test("POST /food/logs requires foodName and calories", async () => {
  const res = await request(app).post("/food/logs").send({ foodName: "Apple" });
  assert.strictEqual(res.status, 400);
});

test("POST /food/logs creates an entry and bumps the streak", async () => {
  mockedUserId = "user_food_create";
  const res = await request(app).post("/food/logs").send({ foodName: "Apple", calories: 95, source: "manual" });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.food_name, "Apple");
  assert.strictEqual(res.body.calories, 95);
  assert.strictEqual(res.body.source, "manual");

  const companion = db.prepare("SELECT * FROM companion_state WHERE user_id = ?").get("user_food_create");
  assert.strictEqual(companion.streak_count, 1);
});

test("POST /food/logs defaults an unrecognized source to manual", async () => {
  mockedUserId = "user_food_source";
  const res = await request(app).post("/food/logs").send({ foodName: "Toast", calories: 150, source: "bogus" });
  assert.strictEqual(res.body.source, "manual");
});

test("logging twice in the same day does not double the streak", async () => {
  mockedUserId = "user_food_streak";
  await request(app).post("/food/logs").send({ foodName: "Eggs", calories: 200 });
  await request(app).post("/food/logs").send({ foodName: "Toast", calories: 150 });

  const companion = db.prepare("SELECT * FROM companion_state WHERE user_id = ?").get("user_food_streak");
  assert.strictEqual(companion.streak_count, 1);
});

test("GET /food/logs returns only the current user's entries, newest first", async () => {
  mockedUserId = "user_food_isolated_a";
  await request(app).post("/food/logs").send({ foodName: "A1", calories: 100 });
  await request(app).post("/food/logs").send({ foodName: "A2", calories: 200 });

  mockedUserId = "user_food_isolated_b";
  await request(app).post("/food/logs").send({ foodName: "B1", calories: 300 });

  mockedUserId = "user_food_isolated_a";
  const res = await request(app).get("/food/logs");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 2);
  assert.ok(res.body.every((l) => ["A1", "A2"].includes(l.food_name)));
  assert.strictEqual(res.body[0].food_name, "A2"); // newest first
});

test("DELETE /food/logs/:id removes the entry, 404s for someone else's entry", async () => {
  mockedUserId = "user_food_del_owner";
  const created = await request(app).post("/food/logs").send({ foodName: "Delete me", calories: 50 });
  const id = created.body.id;

  mockedUserId = "user_food_del_other";
  const wrongUserDelete = await request(app).delete(`/food/logs/${id}`);
  assert.strictEqual(wrongUserDelete.status, 404);

  mockedUserId = "user_food_del_owner";
  const ok = await request(app).delete(`/food/logs/${id}`);
  assert.strictEqual(ok.status, 204);

  const stillThere = db.prepare("SELECT * FROM food_logs WHERE id = ?").get(id);
  assert.strictEqual(stillThere, undefined);
});

test("GET /food/logs?date= filters to that day only", async () => {
  mockedUserId = "user_food_bydate";
  await request(app).post("/food/logs").send({ foodName: "Today's meal", calories: 100 });

  const today = new Date().toISOString().slice(0, 10);
  const res = await request(app).get(`/food/logs?date=${today}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 1);
  assert.strictEqual(res.body[0].food_name, "Today's meal");

  const past = await request(app).get("/food/logs?date=2000-01-01");
  assert.strictEqual(past.body.length, 0);
});

test("streak continues (does not reset) when the previous log was yesterday", async () => {
  mockedUserId = "user_food_streak_continue";
  await request(app).post("/food/logs").send({ foodName: "Day 1", calories: 100 });

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  db.prepare("UPDATE companion_state SET last_log_date = ? WHERE user_id = ?").run(yesterday, mockedUserId);

  await request(app).post("/food/logs").send({ foodName: "Day 2", calories: 100 });

  const companion = db.prepare("SELECT * FROM companion_state WHERE user_id = ?").get(mockedUserId);
  assert.strictEqual(companion.streak_count, 2);
});

test("streak resets to 1 when a day was missed", async () => {
  mockedUserId = "user_food_streak_reset";
  await request(app).post("/food/logs").send({ foodName: "Day 1", calories: 100 });
  db.prepare("UPDATE companion_state SET streak_count = 5, last_log_date = '2000-01-01' WHERE user_id = ?").run(
    mockedUserId
  );

  await request(app).post("/food/logs").send({ foodName: "Much later", calories: 100 });

  const companion = db.prepare("SELECT * FROM companion_state WHERE user_id = ?").get(mockedUserId);
  assert.strictEqual(companion.streak_count, 1);
});

test("GET /food/dashboard/summary aggregates today's totals against the user's goal", async () => {
  mockedUserId = "user_food_summary";
  await request(app).post("/food/logs").send({ foodName: "X", calories: 300, proteinG: 20, carbsG: 30, fatG: 10 });
  await request(app).post("/food/logs").send({ foodName: "Y", calories: 200, proteinG: 10, carbsG: 20, fatG: 5 });

  const res = await request(app).get("/food/dashboard/summary");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.calories, 500);
  assert.strictEqual(res.body.proteinG, 30);
  assert.strictEqual(res.body.entries, 2);
  assert.strictEqual(res.body.goal, 2000);
});

test("GET /food/frequent ranks repeated meals by count", async () => {
  mockedUserId = "user_food_frequent";
  for (let i = 0; i < 3; i++) await request(app).post("/food/logs").send({ foodName: "Oatmeal", calories: 250 });
  await request(app).post("/food/logs").send({ foodName: "Salad", calories: 180 });

  const res = await request(app).get("/food/frequent");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body[0].food_name, "Oatmeal");
  assert.strictEqual(res.body[0].logCount, 3);
});

test("POST /food/analyze rejects missing photo and bad mimetype", async () => {
  mockedUserId = "user_food_analyze_bad";
  const missing = await request(app).post("/food/analyze");
  assert.strictEqual(missing.status, 400);

  const badType = await request(app)
    .post("/food/analyze")
    .attach("photo", Buffer.from("not an image"), { filename: "note.txt", contentType: "text/plain" });
  assert.strictEqual(badType.status, 400);
});

test("POST /food/analyze returns AI results for a valid photo while trialing", async () => {
  mockedUserId = "user_food_analyze_ok";
  analyzeShouldFail = false;
  const res = await request(app)
    .post("/food/analyze")
    .attach("photo", Buffer.from([0xff, 0xd8, 0xff]), { filename: "meal.jpg", contentType: "image/jpeg" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.foodName, "Grilled chicken with rice");
});

test("POST /food/analyze returns 502 when the model call fails", async () => {
  mockedUserId = "user_food_analyze_fail";
  analyzeShouldFail = true;
  const res = await request(app)
    .post("/food/analyze")
    .attach("photo", Buffer.from([0xff, 0xd8, 0xff]), { filename: "meal.jpg", contentType: "image/jpeg" });
  assert.strictEqual(res.status, 502);
  analyzeShouldFail = false;
});

test("POST /food/analyze is blocked with 402 once the trial has expired", async () => {
  mockedUserId = "user_food_expired";
  db.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)").run(mockedUserId);
  db.prepare("UPDATE users SET created_at = datetime('now', '-40 days') WHERE id = ?").run(mockedUserId);

  const res = await request(app)
    .post("/food/analyze")
    .attach("photo", Buffer.from([0xff, 0xd8, 0xff]), { filename: "meal.jpg", contentType: "image/jpeg" });
  assert.strictEqual(res.status, 402);
  assert.strictEqual(res.body.billing.status, "expired");
});
