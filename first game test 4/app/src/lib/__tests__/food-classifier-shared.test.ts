import {
  classifyFoodClassifierOutput,
  HIGH_CONFIDENCE_THRESHOLD,
  MEDIUM_CONFIDENCE_THRESHOLD,
  NO_MACROS_CAVEAT,
} from '../food-classifier-shared';
import { BACKGROUND_CLASS_INDEX, FOOD_CLASSIFIER_LABELS } from '../food-classifier-labelmap';

// Builds a full 2,024-length score array with a tiny, strictly-increasing
// baseline (never a flat/tied fill) except at the given index/score
// overrides. The strictly-increasing baseline matters: an all-zero fill
// would leave `__background__` (index 0) tied for last place with every
// other un-overridden class, and JS's stable sort keeps ties in original
// index order — meaning index 0 would deterministically land in the
// TOP_K_BACKGROUND_CHECK window of every single test by sort-order
// accident, not because the test actually put it there. A monotonic
// baseline guarantees index 0 always sorts dead last unless a test
// explicitly overrides it.
function scoresWith(overrides: Record<number, number>): number[] {
  const scores = FOOD_CLASSIFIER_LABELS.map((_, i) => i * 1e-7);
  for (const [index, score] of Object.entries(overrides)) {
    scores[Number(index)] = score;
  }
  return scores;
}

// An arbitrary real, non-background label to drive test scores against —
// this labelmap's food names are region-specific ("Chicago-style pizza"
// etc.), so there's no bare "Pizza" entry to look up by name; index 500
// ("Majboos") is just a stable, known-non-background index to build fixture
// score arrays around.
const TEST_FOOD_INDEX = 500;
const TEST_FOOD_NAME = FOOD_CLASSIFIER_LABELS[TEST_FOOD_INDEX];

describe('classifyFoodClassifierOutput', () => {
  it('returns a zero-item-worthy empty foodName for an empty scores array', () => {
    const result = classifyFoodClassifierOutput([]);
    expect(result.foodName).toBe('');
  });

  it('classifies a clear top-1 winner as high confidence when it clears HIGH_CONFIDENCE_THRESHOLD', () => {
    const scores = scoresWith({ [TEST_FOOD_INDEX]: HIGH_CONFIDENCE_THRESHOLD + 0.1 });
    const result = classifyFoodClassifierOutput(scores);

    expect(result.foodName).toBe(TEST_FOOD_NAME);
    expect(result.confidence).toBe('high');
    expect(result.caveat).toBe(NO_MACROS_CAVEAT);
  });

  it('classifies a mid-range top score as medium confidence', () => {
    const scores = scoresWith({ [TEST_FOOD_INDEX]: MEDIUM_CONFIDENCE_THRESHOLD + 0.05 });
    const result = classifyFoodClassifierOutput(scores);

    expect(result.confidence).toBe('medium');
  });

  it('classifies a low top score as low confidence', () => {
    const scores = scoresWith({ [TEST_FOOD_INDEX]: MEDIUM_CONFIDENCE_THRESHOLD - 0.05 });
    const result = classifyFoodClassifierOutput(scores);

    expect(result.confidence).toBe('low');
  });

  it('never fabricates calories/macros — always zero, regardless of confidence', () => {
    const scores = scoresWith({ [TEST_FOOD_INDEX]: HIGH_CONFIDENCE_THRESHOLD + 0.1 });
    const result = classifyFoodClassifierOutput(scores);

    expect(result.calories).toBe(0);
    expect(result.proteinG).toBe(0);
    expect(result.carbsG).toBe(0);
    expect(result.fatG).toBe(0);
  });

  it('treats a background-class top-1 as "no food identified", not a named result', () => {
    const scores = scoresWith({ [BACKGROUND_CLASS_INDEX]: 0.9, [TEST_FOOD_INDEX]: 0.05 });
    const result = classifyFoodClassifierOutput(scores);

    expect(result.foodName).toBe('');
    expect(result.caveat).toMatch(/couldn't identify/i);
  });

  it('REGRESSION: a real food label winning top-1 with the background class close behind (#2/#3) is still forced to low confidence, not sailed through unflagged', () => {
    const scores = scoresWith({
      [TEST_FOOD_INDEX]: HIGH_CONFIDENCE_THRESHOLD + 0.1,
      [BACKGROUND_CLASS_INDEX]: HIGH_CONFIDENCE_THRESHOLD + 0.05,
    });
    const result = classifyFoodClassifierOutput(scores);

    expect(result.foodName).toBe(TEST_FOOD_NAME);
    expect(result.confidence).toBe('low');
    expect(result.caveat).toMatch(/may not be a correct match/i);
    expect(result.caveat).toContain(NO_MACROS_CAVEAT);
  });

  it('does not flag a low top-1 result just because SOME food label (not background) is in the top 3', () => {
    const scores = scoresWith({
      [TEST_FOOD_INDEX]: HIGH_CONFIDENCE_THRESHOLD + 0.1,
      [TEST_FOOD_INDEX + 1]: HIGH_CONFIDENCE_THRESHOLD + 0.05,
    });
    const result = classifyFoodClassifierOutput(scores);

    expect(result.confidence).toBe('high');
  });

  it('foodName always comes from a FOOD_CLASSIFIER_LABELS lookup, never a raw index rendered as a string', () => {
    const scores = scoresWith({ [TEST_FOOD_INDEX]: 0.99 });
    const result = classifyFoodClassifierOutput(scores);

    expect(result.foodName).not.toMatch(/^\d+$/);
    expect(FOOD_CLASSIFIER_LABELS).toContain(result.foodName);
  });

  it('a caveat is always present for a real result, reminding the user this model has no macro data', () => {
    const scores = scoresWith({ [TEST_FOOD_INDEX]: 0.5 });
    const result = classifyFoodClassifierOutput(scores);

    expect(result.caveat).toContain(NO_MACROS_CAVEAT);
  });

  it('defensive path: a top-1 index beyond FOOD_CLASSIFIER_LABELS\' length (a caller/tensor-shape mismatch, not a real deploy) returns the safe empty result instead of an undefined foodName', () => {
    const scores = new Array(FOOD_CLASSIFIER_LABELS.length + 5).fill(0.0001);
    scores[FOOD_CLASSIFIER_LABELS.length + 2] = 0.9;

    const result = classifyFoodClassifierOutput(scores);

    expect(result.foodName).toBe('');
    expect(result.caveat).toMatch(/couldn't identify/i);
  });
});
