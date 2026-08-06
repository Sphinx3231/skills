process.env.DB_PATH = ":memory:";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_PRICE_ID = "price_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

let mockedUserId = "user_b1";
mock.module("@clerk/express", {
  exports: {
    getAuth: () => ({ userId: mockedUserId }),
    clerkMiddleware: () => (req, res, next) => next(),
    clerkClient: {
      users: {
        getUser: async () => ({
          primaryEmailAddress: { emailAddress: "fox@example.com" },
          emailAddresses: [{ emailAddress: "fox@example.com" }],
        }),
      },
    },
  },
});

let webhookEventToReturn = null;
let checkoutShouldFail = false;
class FakeStripe {
  constructor() {
    this.customers = { create: async () => ({ id: "cus_fake1" }) };
    this.checkout = {
      sessions: {
        create: async () => {
          if (checkoutShouldFail) throw new Error("stripe is down");
          return { url: "https://checkout.stripe.test/session" };
        },
      },
    };
    this.webhooks = {
      constructEvent: (_body, _sig, _secret) => {
        if (!webhookEventToReturn) throw new Error("invalid signature");
        return webhookEventToReturn;
      },
    };
  }
}
mock.module("stripe", { exports: { default: FakeStripe } });

const { billingRouter, stripeWebhookHandler } = await import("../src/routes/billing.js");
const { db, getOrCreateUser } = await import("../src/db/index.js");

const app = express();
app.use(express.json());
app.use("/billing", billingRouter);
app.post("/billing/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

test("GET /billing/status reflects computeBillingStatus for the current user", async () => {
  mockedUserId = "user_b_status";
  getOrCreateUser(mockedUserId);
  const res = await request(app).get("/billing/status");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, "trialing");
});

test("POST /billing/create-checkout-session requires successUrl and cancelUrl", async () => {
  mockedUserId = "user_b_missing_urls";
  getOrCreateUser(mockedUserId);
  const res = await request(app).post("/billing/create-checkout-session").send({});
  assert.strictEqual(res.status, 400);
});

test("POST /billing/create-checkout-session creates a Stripe customer on first checkout", async () => {
  mockedUserId = "user_b_checkout";
  getOrCreateUser(mockedUserId);
  const res = await request(app)
    .post("/billing/create-checkout-session")
    .send({ successUrl: "https://app/success", cancelUrl: "https://app/cancel" });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.url, "https://checkout.stripe.test/session");

  const user = db.prepare("SELECT stripe_customer_id FROM users WHERE id = ?").get(mockedUserId);
  assert.strictEqual(user.stripe_customer_id, "cus_fake1");
});

test("POST /billing/create-checkout-session reuses an existing Stripe customer id", async () => {
  mockedUserId = "user_b_reuse";
  getOrCreateUser(mockedUserId);
  db.prepare("UPDATE users SET stripe_customer_id = 'cus_existing' WHERE id = ?").run(mockedUserId);

  await request(app)
    .post("/billing/create-checkout-session")
    .send({ successUrl: "https://app/success", cancelUrl: "https://app/cancel" });

  const user = db.prepare("SELECT stripe_customer_id FROM users WHERE id = ?").get(mockedUserId);
  assert.strictEqual(user.stripe_customer_id, "cus_existing");
});

test("webhook: checkout.session.completed activates the subscription", async () => {
  mockedUserId = "user_b_webhook_activate";
  getOrCreateUser(mockedUserId);

  webhookEventToReturn = {
    type: "checkout.session.completed",
    data: { object: { subscription: "sub_123", client_reference_id: mockedUserId } },
  };

  const res = await request(app)
    .post("/billing/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", "t=1,v1=fake")
    .send(JSON.stringify({ any: "payload" }));

  assert.strictEqual(res.status, 200);
  const user = db.prepare("SELECT subscription_status, stripe_subscription_id FROM users WHERE id = ?").get(mockedUserId);
  assert.strictEqual(user.subscription_status, "active");
  assert.strictEqual(user.stripe_subscription_id, "sub_123");
});

test("webhook: customer.subscription.deleted cancels the subscription", async () => {
  mockedUserId = "user_b_webhook_cancel";
  getOrCreateUser(mockedUserId);
  db.prepare("UPDATE users SET subscription_status = 'active', stripe_subscription_id = 'sub_456' WHERE id = ?").run(
    mockedUserId
  );

  webhookEventToReturn = {
    type: "customer.subscription.deleted",
    data: { object: { id: "sub_456" } },
  };

  const res = await request(app)
    .post("/billing/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", "t=1,v1=fake")
    .send(JSON.stringify({ any: "payload" }));

  assert.strictEqual(res.status, 200);
  const user = db.prepare("SELECT subscription_status, stripe_subscription_id FROM users WHERE id = ?").get(mockedUserId);
  assert.strictEqual(user.subscription_status, "canceled");
  assert.strictEqual(user.stripe_subscription_id, null);
});

test("POST /billing/create-checkout-session returns 502 when Stripe errors", async () => {
  mockedUserId = "user_b_checkout_fail";
  getOrCreateUser(mockedUserId);
  checkoutShouldFail = true;
  const res = await request(app)
    .post("/billing/create-checkout-session")
    .send({ successUrl: "https://app/success", cancelUrl: "https://app/cancel" });
  assert.strictEqual(res.status, 502);
  checkoutShouldFail = false;
});

test("webhook: bad signature returns 400", async () => {
  webhookEventToReturn = null;
  const res = await request(app)
    .post("/billing/webhook")
    .set("Content-Type", "application/json")
    .set("stripe-signature", "bad")
    .send(JSON.stringify({ any: "payload" }));
  assert.strictEqual(res.status, 400);
});
