// Port of backend/test/food-candidate-labels.test.js's startup invariant
// (ticket 011, Step 1) — this is what keeps food-recognition-shared.ts's
// no-nutrition-data branch genuinely unreachable for a real deploy; dropping
// it silently weakens ticket 010's safety guarantee, same as it would on
// the backend.
import { CANDIDATE_LABELS } from '../food-candidate-labels';
import { nutritionExistsFor } from '../food-nutrition-lookup';

test('every non-anchor candidate label has a corresponding food-nutrition-data row', () => {
  const missing = CANDIDATE_LABELS.filter((l) => !l.isAnchor && !nutritionExistsFor(l.key));
  expect(missing.map((l) => l.key)).toEqual([]);
});

test('anchor labels do NOT have a nutrition-reference row (never expected to be looked up)', () => {
  const anchors = CANDIDATE_LABELS.filter((l) => l.isAnchor);
  expect(anchors.length).toBeGreaterThan(0);
  for (const anchor of anchors) {
    expect(nutritionExistsFor(anchor.key)).toBe(false);
  }
});

test('all keys are unique', () => {
  const keys = CANDIDATE_LABELS.map((l) => l.key);
  expect(new Set(keys).size).toBe(keys.length);
});

test('all prompts are unique (the model must be able to tell candidates apart)', () => {
  const prompts = CANDIDATE_LABELS.map((l) => l.prompt);
  expect(new Set(prompts).size).toBe(prompts.length);
});

test('at least one anchor/negative label exists', () => {
  expect(CANDIDATE_LABELS.some((l) => l.isAnchor)).toBe(true);
});
