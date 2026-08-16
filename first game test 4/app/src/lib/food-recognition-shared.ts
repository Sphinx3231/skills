// Port of backend/src/lib/local-food-analysis.js's scoring/decision logic
// (ticket 011, Step 1) as a pure function over a `{label, score}[]` input —
// deliberately platform-agnostic (no classifier call, no fetch, no `window`)
// so ticket 012 (mobile) can reuse this file unmodified once it has a
// comparable `{label, score}[]` array from whatever runtime it ends up
// using. See ticket 012's own notes on why its raw-cosine-similarity output
// is NOT on the same numeric scale as this — this module's thresholds are
// only valid for a softmax-over-all-candidates input, same as ticket 010's
// backend already established.
import { CANDIDATE_LABELS } from './food-candidate-labels';
import { lookupNutritionByLabel } from './food-nutrition-lookup';

const labelByPrompt = new Map(CANDIDATE_LABELS.map((l) => [l.prompt, l]));
const anchorPrompts = new Set(CANDIDATE_LABELS.filter((l) => l.isAnchor).map((l) => l.prompt));

// Confidence-from-margin thresholds — same values ticket 010's backend
// tuned and shipped. These are a deliberate design choice, not something
// the CLIP spike's raw scores dictate on their own — the spike already
// established that no threshold can structurally separate "confidently
// wrong" from "confidently right" for this model; these bands only decide
// what banner the confirm screen shows, never whether a result is returned
// at all (every classification produces a reviewable result — see below).
export const HIGH_CONFIDENCE_MARGIN = 0.4;
export const MEDIUM_CONFIDENCE_MARGIN = 0.15;
// How many top results we scan for an anchor, not just position 0 — this is
// ticket 010's fix for a non-food photo whose top-1 is a real food label
// (margin looking "medium") but whose top-2/3 is an anchor: it must still be
// flagged, not sail through unflagged.
const TOP_K_ANCHOR_CHECK = 3;

export type ClassificationResult = { label: string; score: number };

export type FoodAnalysisResult = {
  foodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: 'low' | 'medium' | 'high';
  notes: string;
  caveat?: string;
};

const NO_FOOD_RESULT: FoodAnalysisResult = Object.freeze({
  foodName: '',
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  confidence: 'low',
  notes: '',
  caveat: "Couldn't identify a food in this photo — enter the details yourself, or try a clearer photo.",
});

const NO_NUTRITION_RESULT: FoodAnalysisResult = Object.freeze({
  foodName: '',
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  confidence: 'low',
  notes: '',
  caveat: "Recognized something but don't have nutrition data for it yet — enter the details yourself.",
});

// No accept/reject threshold decides whether to return a result — every
// classification produces something for the existing review screen. The
// threshold only decides the *displayed* `confidence` value.
//
// `foodName` is only ever sourced from the ported nutrition-reference
// data's `foodName` field, or the empty string — NEVER from a raw model
// prompt string (e.g. "a photo of waffles") or a candidate label's `key`
// directly. This is ticket 010's single most safety-critical invariant and
// carries forward unchanged here.
export function analyzeFoodClassification(results: ClassificationResult[]): FoodAnalysisResult {
  const [top, second] = results;

  if (!top) return { ...NO_FOOD_RESULT };

  // An anchor ANYWHERE in the top-K, not just top-1, forces low confidence +
  // a caveat. Named regression case (ticket 010): a non-food photo scoring
  // top-1 a real food label at a "medium"-looking margin, with an anchor at
  // #2/#3, must not sail through unflagged.
  const anchorNearTop = results.slice(0, TOP_K_ANCHOR_CHECK).some((r) => anchorPrompts.has(r.label));

  if (anchorPrompts.has(top.label)) {
    return { ...NO_FOOD_RESULT };
  }

  const matched = labelByPrompt.get(top.label);
  const nutrition = matched ? lookupNutritionByLabel(matched.key) : null;

  if (!nutrition) {
    // Defensive path only — food-candidate-labels.test.ts's startup
    // invariant (every non-anchor CANDIDATE_LABELS entry has a nutrition
    // row) should make this unreachable for any real candidate label.
    return { ...NO_NUTRITION_RESULT };
  }

  const margin = second ? top.score - second.score : top.score;
  const baseConfidence: FoodAnalysisResult['confidence'] =
    margin >= HIGH_CONFIDENCE_MARGIN ? 'high' : margin >= MEDIUM_CONFIDENCE_MARGIN ? 'medium' : 'low';
  const confidence = anchorNearTop ? 'low' : baseConfidence;

  return {
    foodName: nutrition.foodName,
    calories: nutrition.calories,
    proteinG: nutrition.proteinG,
    carbsG: nutrition.carbsG,
    fatG: nutrition.fatG,
    confidence,
    notes: 'Suggested automatically from your photo — please review before saving.',
    caveat: anchorNearTop
      ? 'This photo may not show a clearly recognizable food — double-check before saving.'
      : `Values shown are for one standard serving (${nutrition.servingDescription}) — a database default, not measured from your photo. Check the fields below before saving.`,
  };
}
