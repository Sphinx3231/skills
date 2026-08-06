import { Router } from "express";
import multer from "multer";
import { db } from "../db/index.js";
import { analyzeFoodPhoto } from "../lib/anthropic.js";
import { requireAuth } from "../middleware/auth.js";
import { computeBillingStatus } from "../lib/billing.js";

export const foodRouter = Router();
const upload = multer({ limits: { fileSize: 8 * 1024 * 1024 } });

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
    const result = await analyzeFoodPhoto({
      base64Image: req.file.buffer.toString("base64"),
      mediaType: req.file.mimetype,
    });
    res.json(result);
  } catch (err) {
    console.error("analyzeFoodPhoto failed:", err);
    res.status(502).json({ error: "Could not analyze photo, try again" });
  }
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
      source === "ai" ? "ai" : "manual",
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
