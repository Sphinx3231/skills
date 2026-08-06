process.env.DB_PATH = ":memory:";

import { test, mock } from "node:test";
import assert from "node:assert/strict";

let mockedUserId = "user_mw1";
mock.module("@clerk/express", {
  exports: {
    getAuth: () => ({ userId: mockedUserId }),
    clerkMiddleware: () => (req, res, next) => next(),
    clerkClient: {},
  },
});

const { requireAuth } = await import("../src/middleware/auth.js");
const { db } = await import("../src/db/index.js");

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.body = null;
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

test("requireAuth attaches userId and provisions the user row when signed in", () => {
  mockedUserId = "user_mw1";
  const req = {};
  const res = mockRes();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.userId, "user_mw1");
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get("user_mw1");
  assert.ok(user);
});

test("requireAuth returns 401 and does not call next when signed out", () => {
  mockedUserId = null;
  const req = {};
  const res = mockRes();
  let nextCalled = false;

  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
  assert.deepStrictEqual(res.body, { error: "Not signed in" });
});
