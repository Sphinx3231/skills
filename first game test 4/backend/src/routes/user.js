import { Router } from "express";
import { db } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

export const userRouter = Router();
userRouter.use(requireAuth);

const MACRO_UNITS = ["grams", "percentage"];
const THEME_MODES = ["woodland_dusk", "dark", "system"];
const MOTION_SETTINGS = ["system_default", "force_reduced_motion", "full_animations"];

// Slot -> DB column, kept in one place so GET/PATCH and the unlock
// cross-check below can't drift from each other.
const EQUIP_FIELDS = [
  { field: "equippedScarf", column: "equipped_scarf", item: "scarf" },
  { field: "equippedHat", column: "equipped_hat", item: "hat" },
  { field: "equippedCrown", column: "equipped_crown", item: "crown" },
  { field: "equippedBackpack", column: "equipped_backpack", item: "backpack" },
];

function shapeSettings(user, row) {
  return {
    dailyCalorieGoal: user.daily_calorie_goal,
    proteinGoalG: row.protein_goal_g,
    carbsGoalG: row.carbs_goal_g,
    fatsGoalG: row.fats_goal_g,
    macroUnit: row.macro_unit,
    themeMode: row.theme_mode,
    motionSetting: row.motion_setting,
    equippedScarf: !!row.equipped_scarf,
    equippedHat: !!row.equipped_hat,
    equippedCrown: !!row.equipped_crown,
    equippedBackpack: !!row.equipped_backpack,
  };
}

// requireAuth (backend/src/middleware/auth.js) already calls getOrCreateUser
// on every authenticated request, which provisions both users and
// user_settings rows — so by the time any handler on this router runs, the
// row is guaranteed to exist. No defensive re-provisioning needed here,
// matching companion.js's GET /companion, which makes the same assumption.
function loadSettings(userId) {
  const row = db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(userId);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  return shapeSettings(user, row);
}

userRouter.get("/settings", (req, res) => {
  res.json(loadSettings(req.userId));
});

userRouter.patch("/settings", (req, res) => {
  const body = req.body ?? {};
  const errors = [];

  const numericFields = ["dailyCalorieGoal", "proteinGoalG", "carbsGoalG", "fatsGoalG"];
  for (const field of numericFields) {
    if (body[field] !== undefined && (!Number.isFinite(body[field]) || body[field] < 0)) {
      errors.push(`${field} must be a non-negative number`);
    }
  }

  if (body.macroUnit !== undefined && !MACRO_UNITS.includes(body.macroUnit)) {
    errors.push(`macroUnit must be one of ${MACRO_UNITS.join(", ")}`);
  }
  if (body.themeMode !== undefined && !THEME_MODES.includes(body.themeMode)) {
    errors.push(`themeMode must be one of ${THEME_MODES.join(", ")}`);
  }
  if (body.motionSetting !== undefined && !MOTION_SETTINGS.includes(body.motionSetting)) {
    errors.push(`motionSetting must be one of ${MOTION_SETTINGS.join(", ")}`);
  }

  // Both rows are guaranteed to exist here — requireAuth's getOrCreateUser
  // provisions companion_state and user_settings on every authenticated
  // request, same assumption loadSettings() above makes.
  const companionState = db.prepare("SELECT unlocked_items FROM companion_state WHERE user_id = ?").get(req.userId);
  const unlocked = new Set(JSON.parse(companionState.unlocked_items));
  const existingRow = db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(req.userId);

  for (const { field, column, item } of EQUIP_FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "boolean") {
      errors.push(`${field} must be a boolean`);
      continue;
    }
    // Reject only when the request would newly turn ON a slot the user
    // hasn't unlocked. A redundant echo of the existing (locked,
    // default-true) value is a no-op and must succeed — see the PATCH
    // validation refinement in docs/plans/user-settings-plan.md: GET
    // returns equippedCrown: true by default even for a locked crown, so a
    // client that optimistically echoes back the full object it was just
    // given must not get a false-positive 400.
    if (body[field] === true && !unlocked.has(item)) {
      const currentlyTrue = !!existingRow[column];
      if (!currentlyTrue) {
        errors.push(`${field} cannot be set to true — ${item} is not unlocked`);
      }
      // else: no-op re-send of the already-true locked default, allowed.
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join("; ") });
  }

  if (body.dailyCalorieGoal !== undefined) {
    db.prepare("UPDATE users SET daily_calorie_goal = ? WHERE id = ?").run(
      Math.round(body.dailyCalorieGoal),
      req.userId
    );
  }

  const columnUpdates = [];
  const values = [];
  const settingsFieldToColumn = {
    proteinGoalG: "protein_goal_g",
    carbsGoalG: "carbs_goal_g",
    fatsGoalG: "fats_goal_g",
    macroUnit: "macro_unit",
    themeMode: "theme_mode",
    motionSetting: "motion_setting",
  };
  for (const [field, column] of Object.entries(settingsFieldToColumn)) {
    if (body[field] !== undefined) {
      columnUpdates.push(`${column} = ?`);
      values.push(["proteinGoalG", "carbsGoalG", "fatsGoalG"].includes(field) ? Math.round(body[field]) : body[field]);
    }
  }
  for (const { field, column } of EQUIP_FIELDS) {
    if (body[field] !== undefined) {
      columnUpdates.push(`${column} = ?`);
      values.push(body[field] ? 1 : 0);
    }
  }

  if (columnUpdates.length > 0) {
    columnUpdates.push("updated_at = datetime('now')");
    db.prepare(`UPDATE user_settings SET ${columnUpdates.join(", ")} WHERE user_id = ?`).run(
      ...values,
      req.userId
    );
  }

  res.json(loadSettings(req.userId));
});
