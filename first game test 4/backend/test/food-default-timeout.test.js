process.env.DB_PATH = ":memory:";
// Deliberately does NOT set OFF_FETCH_TIMEOUT_MS. food.test.js overrides it
// to run the "hung upstream" timeout test in milliseconds instead of 8 real
// seconds, which otherwise leaves the `Number(process.env...) || 8_000`
// fallback's default side permanently uncovered (node --test runs each test
// file in its own process, so this file's unset env var doesn't collide
// with food.test.js's override). This file just needs to load the real
// route module under that default so the branch executes at least once.

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

mock.module("@clerk/express", {
  exports: {
    getAuth: () => ({ userId: "user_default_timeout" }),
    clerkMiddleware: () => (req, res, next) => next(),
    clerkClient: {},
  },
});

mock.module("../src/lib/anthropic.js", {
  exports: {
    analyzeFoodPhotoMultiItem: async () => ({ items: [] }),
    analyzeFoodText: async () => ({}),
  },
});

const { foodRouter } = await import("../src/routes/food.js");

const app = express();
app.use(express.json());
app.use("/food", foodRouter);

test("GET /food/barcode/:code still validates format correctly with OFF_FETCH_TIMEOUT_MS unset (production's 8s default)", async () => {
  const res = await request(app).get("/food/barcode/not-a-barcode");
  assert.strictEqual(res.status, 400);
});
