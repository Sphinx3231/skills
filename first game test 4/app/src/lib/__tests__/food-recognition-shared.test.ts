// Port of backend/test/local-food-analysis.test.js's cases (ticket 011,
// Step 5) against the ported, platform-agnostic
// analyzeFoodClassification() — same thresholds, same test scenarios,
// direct port. This exercises the exact scoring/decision logic ticket 010's
// backend already shipped and verified, now running client-side.
import { analyzeFoodClassification } from '../food-recognition-shared';

describe('analyzeFoodClassification', () => {
  test("anchor in top-1 -> empty, low-confidence 'couldn't identify' result", () => {
    const result = analyzeFoodClassification([
      { label: 'a photo that does not contain any food', score: 0.7 },
      { label: 'a photo of pizza', score: 0.2 },
    ]);
    expect(result.foodName).toBe('');
    expect(result.calories).toBe(0);
    expect(result.confidence).toBe('low');
    expect(result.caveat).toMatch(/Couldn't identify/);
  });

  test("REGRESSION: anchor in top-2 (not top-1) still forces low confidence + a caveat — the tech-lead's flagged dog-photo case", () => {
    // Mirrors the CLIP spike's actual dog-photo finding: top-1 "waffles" at
    // 0.564, top-2 the anchor at 0.394 — a margin (0.17) that top-1-only
    // logic would have called "medium" confidence and shown a wrong food
    // suggestion with no warning at all.
    const result = analyzeFoodClassification([
      { label: 'a photo of waffles', score: 0.564 },
      { label: 'a photo that does not contain any food', score: 0.394 },
      { label: 'a photo of pancakes', score: 0.02 },
    ]);
    expect(result.foodName).toBe('Waffles');
    expect(result.confidence).toBe('low');
    expect(result.caveat).toMatch(/may not show a clearly recognizable food/);
  });

  test('anchor in top-3 (still within TOP_K_ANCHOR_CHECK) forces low confidence', () => {
    const result = analyzeFoodClassification([
      { label: 'a photo of pizza', score: 0.6 },
      { label: 'a photo of sushi', score: 0.25 },
      { label: 'a photo of a random object or scene, not food', score: 0.1 },
    ]);
    expect(result.confidence).toBe('low');
    expect(result.caveat).toMatch(/double-check/);
  });

  test('an anchor outside the top-K window does not suppress a genuine high-confidence match', () => {
    const result = analyzeFoodClassification([
      { label: 'a photo of pizza', score: 0.9 },
      { label: 'a photo of sushi', score: 0.3 },
      { label: 'a photo of a hamburger', score: 0.05 },
      { label: 'a photo of ramen', score: 0.02 },
      { label: 'an unclear photo where no specific food can be identified', score: 0.01 },
    ]);
    expect(result.foodName).toBe('Pizza');
    expect(result.confidence).toBe('high');
  });

  test('matched label with nutrition data returns the reference row\'s values, never the raw prompt string', () => {
    const result = analyzeFoodClassification([
      { label: 'a photo of a banana', score: 0.95 },
      { label: 'a photo of an apple', score: 0.3 },
    ]);
    expect(result.foodName).toBe('Banana');
    expect(result.foodName).not.toBe('a photo of a banana');
    expect(result.calories).toBe(105);
    expect(result.caveat).toMatch(/one standard serving/);
    expect(result.notes).toMatch(/Suggested automatically/);
  });

  test('a matched top-1 label with no nutrition row (defensive path) returns the safe empty result, never a raw label', () => {
    const result = analyzeFoodClassification([
      { label: 'a prompt not in CANDIDATE_LABELS at all', score: 0.8 },
      { label: 'a photo of pizza', score: 0.1 },
    ]);
    expect(result.foodName).toBe('');
    expect(result.confidence).toBe('low');
    expect(result.caveat).toMatch(/don't have nutrition data/);
  });

  test('empty classifier output returns the safe empty result instead of throwing', () => {
    const result = analyzeFoodClassification([]);
    expect(result.foodName).toBe('');
    expect(result.confidence).toBe('low');
  });

  describe('confidence-from-margin thresholds', () => {
    test('margin >= 0.4 -> high', () => {
      const result = analyzeFoodClassification([
        { label: 'a photo of pizza', score: 0.9 },
        { label: 'a photo of sushi', score: 0.4 },
      ]);
      expect(result.confidence).toBe('high');
    });

    test('margin exactly at the 0.15 medium boundary -> medium', () => {
      const result = analyzeFoodClassification([
        { label: 'a photo of pizza', score: 0.5 },
        { label: 'a photo of sushi', score: 0.35 },
      ]);
      expect(result.confidence).toBe('medium');
    });

    test('margin below 0.15 -> low', () => {
      const result = analyzeFoodClassification([
        { label: 'a photo of pizza', score: 0.4 },
        { label: 'a photo of sushi', score: 0.36 },
      ]);
      expect(result.confidence).toBe('low');
    });

    test('a single result with no second place uses its own score as the margin', () => {
      const result = analyzeFoodClassification([{ label: 'a photo of pizza', score: 0.3 }]);
      expect(result.confidence).toBe('medium');
    });
  });
});
