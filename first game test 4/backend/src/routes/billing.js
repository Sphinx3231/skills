import { Router } from "express";
import Stripe from "stripe";
import { clerkClient } from "@clerk/express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { computeBillingStatus } from "../lib/billing.js";

export const billingRouter = Router();
billingRouter.use(requireAuth);

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

billingRouter.get("/status", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId);
  res.json(computeBillingStatus(user));
});

// Card is only collected here, once the trial has actually ended — this route
// is what the app calls when the user taps "Subscribe" on the paywall.
billingRouter.post("/create-checkout-session", async (req, res) => {
  if (!stripe || !process.env.STRIPE_PRICE_ID) {
    return res.status(501).json({
      error:
        "Billing isn't configured yet. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID in backend/.env to enable checkout.",
    });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId);
  const { successUrl, cancelUrl } = req.body;
  if (!successUrl || !cancelUrl) {
    return res.status(400).json({ error: "successUrl and cancelUrl are required" });
  }

  try {
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const clerkUser = await clerkClient.users.getUser(user.id);
      const email = clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
      const customer = await stripe.customers.create({ email });
      customerId = customer.id;
      db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(customerId, user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session failed:", err);
    res.status(502).json({ error: "Could not start checkout, try again" });
  }
});

// Mounted separately in index.js with express.raw() — Stripe needs the raw
// body to verify the webhook signature, so it can't go through express.json().
export async function stripeWebhookHandler(req, res) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(501).end();
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    db.prepare(
      "UPDATE users SET subscription_status = 'active', stripe_subscription_id = ? WHERE id = ?"
    ).run(session.subscription, session.client_reference_id);
  }

  if (event.type === "customer.subscription.deleted") {
    // Any value other than 'active' falls through to the date-based check in
    // computeBillingStatus, which will correctly read as 'expired' since the
    // trial window has already passed for a user who was paying.
    db.prepare(
      "UPDATE users SET subscription_status = 'canceled', stripe_subscription_id = NULL WHERE stripe_subscription_id = ?"
    ).run(event.data.object.id);
  }

  res.json({ received: true });
}
