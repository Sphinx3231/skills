// Pure, platform-agnostic mapping from the bundled `food_classifier.tflite`
// model's raw output (a softmax-style score per class, indexed identically
// to FOOD_CLASSIFIER_LABELS) to the review screen's existing
// FoodAnalysisResult shape (ticket 016). This module only reuses that TYPE
// from food-recognition-shared.ts (the web CLIP pipeline) — its actual
// classification logic below is fresh, not a port of CLIP's margin/anchor
// scoring, because the two models produce genuinely different output
// shapes: CLIP's is a handful of hand-picked candidate PROMPTS scored by
// cosine similarity, this is a real ~2,024-way softmax over a fixed AIY
// food/dish taxonomy. Their confidence-threshold constants are NOT on the
// same numeric scale and must never be unified or compared directly.
import { BACKGROUND_CLASS_INDEX, FOOD_CLASSIFIER_LABELS } from './food-classifier-labelmap';
import type { FoodAnalysisResult } from './food-recognition-shared';

// Real accuracy figures from ticket 016's spike/manual-verification step
// (docs/tickets/016-...md, "Model selection"): 67-98% top-1 softmax
// probability on correctly-identified real food photos. These bucket that
// continuous probability into the same 3-band confidence UI
// food-recognition-shared.ts already uses for the web CLIP path.
export const HIGH_CONFIDENCE_THRESHOLD = 0.6;
export const MEDIUM_CONFIDENCE_THRESHOLD = 0.3;

// This on-device model has no macro/calorie estimation of its own — it is a
// closed-set label classifier only, unlike Claude vision (ticket 014) or
// even the CLIP pipeline's database-default lookup (ticket 011). Every
// identified result routes the user to the same manual-entry flow this app
// already has for a from-scratch manual log — see the outcome doc's
// "macro-data approach" section for why this was chosen over a USDA/
// FoodData-Central lookup or reusing the CLIP candidate set's tiny
// 36-item nutrition table (which doesn't cover this model's ~2,023-item
// taxonomy at all).
export const NO_MACROS_CAVEAT =
  "Identified on-device — this model doesn't estimate calories or macros. Enter those details yourself before saving.";

const LOW_CONFIDENCE_PREFIX =
  'This may not be a correct match — double-check the food name before saving. ';

// Mirrors food-recognition-shared.ts's NO_FOOD_RESULT shape and intent
// exactly: `foodName: ''` is the one and only signal food-recognition.ts's
// wrapper uses to produce a zero-item PhotoAnalysis instead of a fabricated
// low-confidence item. NEVER source `foodName` from anywhere except a
// FOOD_CLASSIFIER_LABELS[] lookup below — never from a raw index/number
// formatted as a string.
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

// How many top-scoring classes we scan for the model's own background/
// no-food class, not just the raw argmax — same rationale
// food-recognition-shared.ts's TOP_K_ANCHOR_CHECK documents: a real food
// label can still win top-1 at a borderline score while `__background__`
// sits at #2/#3, and that must still be flagged. Kept as this module's own
// constant (not shared with food-recognition-shared.ts) since the two
// modules' score scales are unrelated.
const TOP_K_BACKGROUND_CHECK = 3;

export type ClassIndexScore = { index: number; score: number };

// `scores` is the model's raw per-class output, indexed identically to
// FOOD_CLASSIFIER_LABELS (2,024 entries, index 0 = `__background__`).
// Pure and platform-agnostic — no model/interpreter/image-decoding code
// here, so this is fully testable without react-native-fast-tflite or any
// native module at all.
export function classifyFoodClassifierOutput(scores: readonly number[]): FoodAnalysisResult {
  if (scores.length === 0) return { ...NO_FOOD_RESULT };

  const ranked: ClassIndexScore[] = scores
    .map((score, index) => ({ index, score }))
    .sort((a, b) => b.score - a.score);

  // Never undefined here — the `scores.length === 0` check above already
  // guarantees `ranked` has at least one element.
  const top = ranked[0] as ClassIndexScore;

  // Reproduced non-food hallucination from the ticket's own manual
  // verification (a dog photo labeled "Kutia" at 51.56% confidence): a
  // closed-set softmax always sums to 100% regardless of whether the input
  // is food at all, so top.index === BACKGROUND_CLASS_INDEX is the only
  // structural signal this model gives us that it thinks nothing food-like
  // is present — it does NOT catch every non-food photo (see the ticket's
  // disclosure), only the ones where the model's own background class wins.
  if (top.index === BACKGROUND_CLASS_INDEX) {
    return { ...NO_FOOD_RESULT };
  }

  const backgroundNearTop = ranked
    .slice(0, TOP_K_BACKGROUND_CHECK)
    .some((r) => r.index === BACKGROUND_CLASS_INDEX);

  const foodName = FOOD_CLASSIFIER_LABELS[top.index];
  if (!foodName) {
    // Defensive only — food-classifier-labelmap.test.ts's startup invariant
    // (array length matches the model's known class count, every entry
    // non-empty) should make this unreachable for a real deploy.
    return { ...NO_FOOD_RESULT };
  }

  const baseConfidence: FoodAnalysisResult['confidence'] =
    top.score >= HIGH_CONFIDENCE_THRESHOLD
      ? 'high'
      : top.score >= MEDIUM_CONFIDENCE_THRESHOLD
        ? 'medium'
        : 'low';
  const confidence = backgroundNearTop ? 'low' : baseConfidence;

  return {
    foodName,
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    confidence,
    notes: 'Suggested automatically from your photo — please review before saving.',
    caveat: backgroundNearTop ? LOW_CONFIDENCE_PREFIX + NO_MACROS_CAVEAT : NO_MACROS_CAVEAT,
  };
}
