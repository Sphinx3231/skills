import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { foodRouter } from "./routes/food.js";
import { companionRouter } from "./routes/companion.js";
import { billingRouter, stripeWebhookHandler } from "./routes/billing.js";
import { userRouter } from "./routes/user.js";
import { getClassifier } from "./lib/local-food-recognition.js";

if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
  console.error(
    "Missing CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY (see backend/.env.example) — sign-in won't work without them."
  );
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "ANTHROPIC_API_KEY not set — auth, dashboard, and companion all work, and /food/analyze (photo scan) now runs a local CLIP model with no API key needed, but /food/analyze-text will fail until it's configured."
  );
}
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn(
    "STRIPE_SECRET_KEY not set — trial tracking works, but /billing/create-checkout-session will 501 until it's configured."
  );
}

const app = express();
app.use(cors());

// Stripe needs the raw request body to verify webhook signatures, so this
// must be mounted before express.json() with its own parser.
app.post("/billing/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

app.use(express.json());
app.use(clerkMiddleware());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/food", foodRouter);
app.use("/companion", companionRouter);
app.use("/billing", billingRouter);
app.use("/user", userRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT || 4000;

// Pre-warm the local CLIP classifier BEFORE accepting requests, not
// concurrently with app.listen(). Deliberate choice (plan Step 2): this
// project's client `request()` wrapper (app/src/lib/api.ts) has no
// timeout/AbortController, so an unwarmed first request would hang the
// user's UI for the ~35s model-load spike measured in the CLIP spike,
// rather than failing fast — better to pay that cost once at boot, out of
// band from any real user request.
getClassifier()
  .catch((err) => {
    console.error(
      "Local CLIP model failed to pre-warm — /food/analyze will 502 on every request until this is fixed:",
      err
    );
  })
  .finally(() => {
    app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`));
  });
