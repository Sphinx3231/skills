import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const companionRouter = Router();
companionRouter.use(requireAuth);

// Streak length -> unlock id. Keep in sync with the app's companion item catalog.
const STREAK_UNLOCKS = [
  { streak: 3, item: "scarf" },
  { streak: 7, item: "hat" },
  { streak: 14, item: "backpack" },
  { streak: 30, item: "crown" },
];

companionRouter.get("/", (req, res) => {
  const state = db.prepare("SELECT * FROM companion_state WHERE user_id = ?").get(req.userId);
  if (!state) return res.status(404).json({ error: "Companion state not initialized" });

  const unlocked = new Set(JSON.parse(state.unlocked_items));
  const newlyUnlocked = STREAK_UNLOCKS.filter(
    (u) => state.streak_count >= u.streak && !unlocked.has(u.item)
  );

  if (newlyUnlocked.length > 0) {
    newlyUnlocked.forEach((u) => unlocked.add(u.item));
    db.prepare("UPDATE companion_state SET unlocked_items = ? WHERE user_id = ?").run(
      JSON.stringify([...unlocked]),
      req.userId
    );
  }

  res.json({
    streakCount: state.streak_count,
    lastLogDate: state.last_log_date,
    unlockedItems: [...unlocked],
    newlyUnlocked: newlyUnlocked.map((u) => u.item),
    nextUnlock: STREAK_UNLOCKS.find((u) => !unlocked.has(u.item)) ?? null,
  });
});
