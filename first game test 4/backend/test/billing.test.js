import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBillingStatus, hasAccess } from "../src/lib/billing.js";

function userCreatedDaysAgo(days, subscription_status = "trialing") {
  const d = new Date(Date.now() - days * 86_400_000);
  return { created_at: d.toISOString().slice(0, 19).replace("T", " "), subscription_status };
}

test("computeBillingStatus: active subscription always reports active, 0 days left", () => {
  const status = computeBillingStatus(userCreatedDaysAgo(400, "active"));
  assert.strictEqual(status.status, "active");
  assert.strictEqual(status.daysLeft, 0);
});

test("computeBillingStatus: fresh trial reports trialing with ~30 days left", () => {
  const status = computeBillingStatus(userCreatedDaysAgo(0));
  assert.strictEqual(status.status, "trialing");
  assert.ok(status.daysLeft >= 29 && status.daysLeft <= 30, `expected ~30, got ${status.daysLeft}`);
});

test("computeBillingStatus: trial nearing the end reports trialing with few days left", () => {
  const status = computeBillingStatus(userCreatedDaysAgo(29));
  assert.strictEqual(status.status, "trialing");
  assert.ok(status.daysLeft >= 1 && status.daysLeft <= 2);
});

test("computeBillingStatus: trial past 30 days reports expired", () => {
  const status = computeBillingStatus(userCreatedDaysAgo(31));
  assert.strictEqual(status.status, "expired");
  assert.strictEqual(status.daysLeft, 0);
});

test("computeBillingStatus: canceled subscription past trial window reports expired", () => {
  const status = computeBillingStatus(userCreatedDaysAgo(60, "canceled"));
  assert.strictEqual(status.status, "expired");
});

test("hasAccess: true while trialing or active, false once expired", () => {
  assert.strictEqual(hasAccess(userCreatedDaysAgo(0)), true);
  assert.strictEqual(hasAccess(userCreatedDaysAgo(400, "active")), true);
  assert.strictEqual(hasAccess(userCreatedDaysAgo(31)), false);
});
