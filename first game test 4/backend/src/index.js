import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { foodRouter } from "./routes/food.js";
import { companionRouter } from "./routes/companion.js";
import { billingRouter, stripeWebhookHandler } from "./routes/billing.js";
import { userRouter } from "./routes/user.js";

if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
  console.error(
    "Missing CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY (see backend/.env.example) — sign-in won't work without them."
  );
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "ANTHROPIC_API_KEY not set — auth, dashboard, and companion all work, but /food/analyze (photo scan, Claude vision) and /food/analyze-text will both fail until it's configured. There is no local-model fallback."
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

// Ticket 010/011's local CLIP classifier (backend/src/lib/local-food-recognition.js)
// used to be pre-warmed here before accepting requests, since /food/analyze
// called it directly and an unwarmed first request would otherwise hang the
// client for the ~35s model-load spike. Ticket 014 reverted /food/analyze to
// call Claude vision (analyzeFoodPhotoMultiItem) unconditionally instead, so
// no route exercises the local CLIP path anymore — the warm-up call was
// removed (ticket 017) to avoid paying that ~35s boot cost for a model
// nothing serves. local-food-recognition.js/local-food-analysis.js are left
// in place, uncalled, with their own tests intact, in case a future route
// resurrects them (same precedent as tickets 010/014's superseded functions).
app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`));
