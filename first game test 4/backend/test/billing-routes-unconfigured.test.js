process.env.DB_PATH = ":memory:";
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_PRICE_ID;
delete process.env.STRIPE_WEBHOOK_SECRET;

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

mock.module("@clerk/express", {
  exports: {
    getAuth: () => ({ userId: "user_unconfigured" }),
    clerkMiddleware: () => (req, res, next) => next(),
    clerkClient: {},
  },
});

// billing.js reads STRIPE_SECRET_KEY at import time to decide whether Stripe
// is configured — this file intentionally leaves it unset to exercise the
// "billing not configured yet" paths, which the fully-mocked billing-routes
// test file can't reach once it has stripe wired up.
const { billingRouter, stripeWebhookHandler } = await import("../src/routes/billing.js");
const { getOrCreateUser } = await import("../src/db/index.js");

const app = express();
app.use(express.json());
app.use("/billing", billingRouter);
app.post("/billing/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

test("POST /billing/create-checkout-session 501s when Stripe isn't configured", async () => {
  getOrCreateUser("user_unconfigured");
  const res = await request(app)
    .post("/billing/create-checkout-session")
    .send({ successUrl: "https://app/success", cancelUrl: "https://app/cancel" });
  assert.strictEqual(res.status, 501);
});

test("webhook 501s when Stripe isn't configured", async () => {
  const res = await request(app).post("/billing/webhook").set("Content-Type", "application/json").send("{}");
  assert.strictEqual(res.status, 501);
});
