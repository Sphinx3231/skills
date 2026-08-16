import { classifyFoodPhoto } from "./local-food-recognition.js";
import { lookupNutritionByLabel } from "./food-nutrition-db.js";
import { CANDIDATE_LABELS } from "./food-candidate-labels.js";

const labelByPrompt = new Map(CANDIDATE_LABELS.map((l) => [l.prompt, l]));
const anchorPrompts = new Set(CANDIDATE_LABELS.filter((l) => l.isAnchor).map((l) => l.prompt));

// Confidence-from-margin thresholds. These are a deliberate design choice,
// not something the CLIP spike's raw scores dictate on their own — the
// spike (docs/outcomes/clip-zero-shot-spike-findings.md) already
// established that NO threshold can structurally separate "confidently
// wrong" from "confidently right" for this model; these bands only decide
// what banner the confirm screen shows, never whether a result is returned
// at all (every classification produces a reviewable result — see below).
const HIGH_CONFIDENCE_MARGIN = 0.4;
const MEDIUM_CONFIDENCE_MARGIN = 0.15;
// How many top results we scan for an anchor, not just position 0 — this is
// the fix for the tech-lead's flagged case: a non-food photo whose top-1 is
// a real food label (margin looking "medium") but whose top-2/3 is an
// anchor must still be flagged, not sail through unflagged.
const TOP_K_ANCHOR_CHECK = 3;

const NO_FOOD_RESULT = Object.freeze({
  foodName: "",
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  confidence: "low",
  notes: "",
  caveat: "Couldn't identify a food in this photo — enter the details yourself, or try a clearer photo.",
});

const NO_NUTRITION_RESULT = Object.freeze({
  foodName: "",
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  confidence: "low",
  notes: "",
  caveat: "Recognized something but don't have nutrition data for it yet — enter the details yourself.",
});

// No accept/reject threshold decides whether to return a result — every
// classification produces something for the existing review screen. The
// threshold only decides the *displayed* `confidence` value. Every path
// resolves (never throws) so the route can always return HTTP 200 with a
// reviewable result; a genuine model-call exception is the route's actual
// error case and still surfaces as a 502, unchanged.
export async function analyzeFoodPhotoLocally({ buffer, mimetype }, pipelineFactory) {
  const results = await classifyFoodPhoto(buffer, mimetype, pipelineFactory);
  const [top, second] = results;

  if (!top) return { ...NO_FOOD_RESULT };

  // B3 fix (tech-lead review): an anchor ANYWHERE in the top-K, not just
  // top-1, forces low confidence + a caveat. Named regression case: a
  // non-food photo scoring top-1 a real food label at a "medium"-looking
  // margin, with an anchor at #2/#3, must not sail through unflagged.
  const anchorNearTop = results
    .slice(0, TOP_K_ANCHOR_CHECK)
    .some((r) => anchorPrompts.has(r.label));

  if (anchorPrompts.has(top.label)) {
    return { ...NO_FOOD_RESULT };
  }

  const matched = labelByPrompt.get(top.label);
  // `foodName` is only ever sourced from the checked-in nutrition-reference
  // table's `food_name` column, or the empty string — NEVER from
  // `top.label` (a raw model prompt like "a photo of waffles") or
  // `matched.key` directly. This is the fix for the tech-lead's B2 finding.
  const nutrition = matched ? lookupNutritionByLabel(matched.key) : null;

  if (!nutrition) {
    // Defensive path only — food-candidate-labels.test.js's startup
    // invariant (every non-anchor CANDIDATE_LABELS entry has a nutrition
    // row) should make this unreachable for any real candidate label.
    return { ...NO_NUTRITION_RESULT };
  }

  const margin = second ? top.score - second.score : top.score;
  const baseConfidence =
    margin >= HIGH_CONFIDENCE_MARGIN ? "high" : margin >= MEDIUM_CONFIDENCE_MARGIN ? "medium" : "low";
  const confidence = anchorNearTop ? "low" : baseConfidence;

  return {
    foodName: nutrition.foodName,
    calories: nutrition.calories,
    proteinG: nutrition.proteinG,
    carbsG: nutrition.carbsG,
    fatG: nutrition.fatG,
    confidence,
    notes: "Suggested automatically from your photo — please review before saving.",
    caveat: anchorNearTop
      ? "This photo may not show a clearly recognizable food — double-check before saving."
      : `Values shown are for one standard serving (${nutrition.servingDescription}) — a database default, not measured from your photo. Check the fields below before saving.`,
  };
}
