import { Router } from "express";
import multer from "multer";
import { db } from "../db/index.js";
import { analyzeFoodPhotoMultiItem, analyzeFoodText } from "../lib/anthropic.js";
import { requireAuth } from "../middleware/auth.js";
import { computeBillingStatus } from "../lib/billing.js";

export const foodRouter = Router();
const upload = multer({ limits: { fileSize: 8 * 1024 * 1024 } });

// Open Food Facts' usage policy throttles requests with a generic/missing
// User-Agent, so this identifies us properly on every outbound request.
const OFF_USER_AGENT = "FoxBite - https://github.com/Sphinx3231/skills";
const BARCODE_PATTERN = /^\d{8,14}$/;
const DESCRIPTION_MAX_LENGTH = 500;
// Overridable via env so tests can exercise the timeout path in
// milliseconds instead of actually waiting 8 real seconds; production has
// no OFF_FETCH_TIMEOUT_MS set, so it always uses the 8s default.
const OFF_FETCH_TIMEOUT_MS = Number(process.env.OFF_FETCH_TIMEOUT_MS) || 8_000;

// Human-readable macro name for a caveat message; keys are the FoodAnalysis
// field names, not the OFF nutriment keys, so this stays independent of
// which basis (serving vs 100g) was actually used.
const MACRO_LABELS = { proteinG: "Protein", carbsG: "Carbs", fatG: "Fat" };

// Prefer per-serving nutriment keys (real portion data) over the per-100g
// defaults Open Food Facts always ships; fall back to per-100g only when a
// product has no stated serving size. Returns null when neither energy key
// is present (a real, common case for sparse OFF entries) so the caller can
// 404 instead of passing NaN/undefined through as a fake FoodAnalysis. The
// 404 is gated on the energy key alone — calories are this app's primary
// metric — so an individual macro that's genuinely absent (not just 0) from
// the nutriments object is reported via `missingMacros` instead of causing
// a false 404 or a silent, confident-looking zero.
function pickBasis(n, basis, energyKey, macroOffKeys) {
  if (!Number.isFinite(n[energyKey])) return null;

  const missingMacros = [];
  const macros = {};
  for (const [field, offKey] of Object.entries(macroOffKeys)) {
    if (n[offKey] === undefined || n[offKey] === null) {
      missingMacros.push(field);
      macros[field] = 0;
    } else {
      macros[field] = n[offKey];
    }
  }

  return { basis, calories: n[energyKey], missingMacros, ...macros };
}

function extractNutrition(product) {
  const n = product?.nutriments ?? {};

  return (
    pickBasis(n, "serving", "energy-kcal_serving", {
      proteinG: "proteins_serving",
      carbsG: "carbohydrates_serving",
      fatG: "fat_serving",
    }) ??
    pickBasis(n, "100g", "energy-kcal_100g", {
      proteinG: "proteins_100g",
      carbsG: "carbohydrates_100g",
      fatG: "fat_100g",
    })
  );
}

// Composes a human-readable caveat from whichever of the two independent
// reasons apply — the per-100g basis statement and/or named missing
// macro(s) — so one never silently overwrites the other on a product where
// both are true (e.g. a 100g-only product that's also missing protein).
function buildCaveat(nutrition) {
  const parts = [];

  if (nutrition.basis === "100g") {
    parts.push(
      "No serving size listed for this product — values shown are per 100g. Scale to your actual portion before saving."
    );
  }

  if (nutrition.missingMacros.length > 0) {
    const names = nutrition.missingMacros.map((field) => MACRO_LABELS[field]);
    const list =
      names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    const verb = names.length === 1 ? "isn't" : "aren't";
    parts.push(`${list} ${verb} on file for this product — shown as 0, edit before saving.`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

foodRouter.use(requireAuth);

// AI photo analysis is the one route that costs us money per call, so it's
// the only thing gated by the trial/subscription — manual logging, the
// dashboard, and the companion stay free forever.
function requireActiveAccess(req, res, next) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.userId);
  const billing = computeBillingStatus(user);
  if (billing.status === "expired") {
    return res.status(402).json({ error: "Your free trial has ended", billing });
  }
  next();
}

foodRouter.post("/analyze", requireActiveAccess, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing photo" });
  if (!["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)) {
    return res.status(400).json({ error: "Photo must be jpeg, png, or webp" });
  }

  try {
    // Claude vision (ticket 014) — revived from ticket 010's "superseded"
    // state, now returning multiple separately-identified items instead of
    // one merged entry. Needs the raw bytes as base64 (unlike the local CLIP
    // pipeline this replaced, which took the multer buffer directly).
    const result = await analyzeFoodPhotoMultiItem({
      base64Image: req.file.buffer.toString("base64"),
      mediaType: req.file.mimetype,
    });
    res.json(result);
  } catch (err) {
    console.error("analyzeFoodPhotoMultiItem failed:", err);
    res.status(502).json({ error: "Could not analyze photo, try again" });
  }
});

foodRouter.post("/analyze-text", requireActiveAccess, async (req, res) => {
  const { description } = req.body;
  if (!description || typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ error: "Missing description" });
  }
  if (description.trim().length > DESCRIPTION_MAX_LENGTH) {
    return res.status(400).json({ error: `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer` });
  }

  try {
    const result = await analyzeFoodText({ description });
    res.json(result);
  } catch (err) {
    console.error("analyzeFoodText failed:", err);
    res.status(502).json({ error: "Could not analyze description, try again" });
  }
});

// Not gated by requireActiveAccess: Open Food Facts is free, so this route
// stays available even after the AI trial expires. Since it's ungated, this
// is the one place in this route file an unauthenticated-cost value reaches
// an outbound HTTP call, so the barcode is validated before any fetch.
foodRouter.get("/barcode/:code", async (req, res) => {
  const { code } = req.params;
  if (!BARCODE_PATTERN.test(code)) {
    return res.status(400).json({ error: "Barcode must be 8-14 digits" });
  }

  // A hung upstream would otherwise hold this request open indefinitely —
  // Open Food Facts is a third-party dependency with no SLA to us.
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), OFF_FETCH_TIMEOUT_MS);

  let offRes;
  try {
    offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
      headers: { "User-Agent": OFF_USER_AGENT },
      signal: timeoutController.signal,
    });
  } catch (err) {
    console.error("Open Food Facts lookup failed:", err);
    return res.status(502).json({ error: "Could not reach the barcode lookup service, try again" });
  } finally {
    clearTimeout(timeout);
  }

  // Open Food Facts' v2 API returns a real HTTP 404 (not a 200 with
  // {status:0} in the body) for an unknown barcode — treat 404 as a
  // not-found candidate and still parse its body, rather than letting it
  // fall into the generic transport-failure branch below. Any other
  // non-2xx (network hiccups, 5xx, etc.) is a genuine lookup failure.
  if (!offRes.ok && offRes.status !== 404) {
    console.error("Open Food Facts responded with status", offRes.status);
    return res.status(502).json({ error: "Could not reach the barcode lookup service, try again" });
  }

  let data;
  try {
    data = await offRes.json();
  } catch (err) {
    console.error("Open Food Facts response body was not valid JSON:", err);
    return res.status(502).json({ error: "Could not reach the barcode lookup service, try again" });
  }

  if (data.status === 0) {
    return res.status(404).json({ error: "No product found for this barcode" });
  }

  const nutrition = extractNutrition(data.product);
  if (!nutrition) {
    return res.status(404).json({ error: "Found a product, but it has no nutrition data on file" });
  }

  const servingSize = data.product?.serving_size;
  res.json({
    foodName: data.product?.product_name || "Unknown product",
    calories: Math.round(nutrition.calories),
    proteinG: nutrition.proteinG,
    carbsG: nutrition.carbsG,
    fatG: nutrition.fatG,
    confidence: "medium",
    notes:
      nutrition.basis === "serving"
        ? `Based on the stated serving size${servingSize ? ` (${servingSize})` : ""}.`
        : "",
    caveat: buildCaveat(nutrition),
  });
});

foodRouter.post("/logs", (req, res) => {
  const { foodName, calories, proteinG, carbsG, fatG, source, aiRawResponse } = req.body;
  if (!foodName || !Number.isFinite(calories)) {
    return res.status(400).json({ error: "foodName and calories are required" });
  }

  const { lastInsertRowid: id } = db
    .prepare(
      `INSERT INTO food_logs (user_id, food_name, calories, protein_g, carbs_g, fat_g, source, ai_raw_response)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.userId,
      foodName,
      Math.round(calories),
      proteinG ?? null,
      carbsG ?? null,
      fatG ?? null,
      ["ai", "barcode"].includes(source) ? source : "manual",
      aiRawResponse ? JSON.stringify(aiRawResponse) : null
    );

  bumpStreak(req.userId);

  const entry = db.prepare("SELECT * FROM food_logs WHERE id = ?").get(id);
  res.status(201).json(entry);
});

foodRouter.get("/logs", (req, res) => {
  const { date } = req.query;
  const rows = date
    ? db
        .prepare(
          `SELECT * FROM food_logs WHERE user_id = ? AND date(logged_at) = date(?) ORDER BY logged_at DESC, id DESC`
        )
        .all(req.userId, date)
    : db.prepare(`SELECT * FROM food_logs WHERE user_id = ? ORDER BY logged_at DESC, id DESC LIMIT 50`).all(req.userId);

  res.json(rows);
});

foodRouter.delete("/logs/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM food_logs WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: "Log not found" });
  res.status(204).end();
});

foodRouter.get("/frequent", (req, res) => {
  const rows = db
    .prepare(
      `SELECT
         food_name,
         COUNT(*) AS logCount,
         ROUND(AVG(calories)) AS calories,
         AVG(protein_g) AS proteinG,
         AVG(carbs_g) AS carbsG,
         AVG(fat_g) AS fatG
       FROM food_logs
       WHERE user_id = ? AND logged_at >= datetime('now', '-30 days')
       GROUP BY food_name
       ORDER BY logCount DESC, MAX(logged_at) DESC
       LIMIT 8`
    )
    .all(req.userId);

  res.json(rows);
});

foodRouter.get("/dashboard/summary", (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(calories), 0) AS calories,
         COALESCE(SUM(protein_g), 0) AS proteinG,
         COALESCE(SUM(carbs_g), 0) AS carbsG,
         COALESCE(SUM(fat_g), 0) AS fatG,
         COUNT(*) AS entries
       FROM food_logs WHERE user_id = ? AND date(logged_at) = date(?)`
    )
    .get(req.userId, date);

  const user = db.prepare("SELECT daily_calorie_goal FROM users WHERE id = ?").get(req.userId);

  res.json({ date, goal: user.daily_calorie_goal, ...totals });
});

function bumpStreak(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const state = db.prepare("SELECT * FROM companion_state WHERE user_id = ?").get(userId);
  if (!state) {
    db.prepare("INSERT INTO companion_state (user_id, streak_count, last_log_date) VALUES (?, 1, ?)").run(
      userId,
      today
    );
    return;
  }
  if (state.last_log_date === today) return; // already logged today

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const nextStreak = state.last_log_date === yesterday ? state.streak_count + 1 : 1;

  db.prepare("UPDATE companion_state SET streak_count = ?, last_log_date = ? WHERE user_id = ?").run(
    nextStreak,
    today,
    userId
  );
}
