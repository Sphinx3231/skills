// Startup invariants for the auto-generated labelmap (ticket 016). This is
// what keeps food-classifier-shared.ts's "defensive only" unreachable-label
// branch genuinely unreachable for the real bundled model, mirroring
// food-candidate-labels.test.ts's role for the CLIP pipeline.
import { BACKGROUND_CLASS_INDEX, FOOD_CLASSIFIER_LABELS } from '../food-classifier-labelmap';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseLabelField } = require('../../../scripts/generate-food-classifier-labelmap.js');

test('has exactly 2,024 classes (2,023 food/dish labels + 1 background class)', () => {
  expect(FOOD_CLASSIFIER_LABELS.length).toBe(2024);
});

test('index 0 is the model\'s own background/non-food class', () => {
  expect(FOOD_CLASSIFIER_LABELS[BACKGROUND_CLASS_INDEX]).toBe('__background__');
});

test('every entry is a non-empty string', () => {
  const empties = FOOD_CLASSIFIER_LABELS.filter((label) => typeof label !== 'string' || label.length === 0);
  expect(empties).toEqual([]);
});

test('labels are almost entirely unique — the source dataset has exactly one real duplicate ("Sundae", indices 677 and 776), not an indication the labelmap failed to load correctly', () => {
  const nonBackground = FOOD_CLASSIFIER_LABELS.filter((_, i) => i !== BACKGROUND_CLASS_INDEX);
  expect(nonBackground.length - new Set(nonBackground).size).toBe(1);
});

// Regression test: the source CSV has two rows whose label field is
// RFC4180-quoted because the label itself contains a literal `"` character
// (`1126,"""Peanut butter"` and `1127,"""Bacon"`). A naive
// `line.slice(line.indexOf(',') + 1)` comma split leaves the CSV quoting
// syntax in the string instead of unescaping it, producing corrupted labels
// like `'"""Peanut butter"'` that would be shown to the user verbatim on
// the review screen. Confirms the generator now unescapes these correctly
// and that the generated labelmap reflects it.
test('CSV-quoted labels (ids 1126/1127) are RFC4180-unescaped, not left with stray quote syntax', () => {
  expect(FOOD_CLASSIFIER_LABELS[1126]).toBe('"Peanut butter');
  expect(FOOD_CLASSIFIER_LABELS[1127]).toBe('"Bacon');
});

test('no label contains leftover CSV quote-escaping artifacts (a run of 2+ quote characters)', () => {
  const offenders = FOOD_CLASSIFIER_LABELS.filter((label) => /""/.test(label));
  expect(offenders).toEqual([]);
});

describe('generate-food-classifier-labelmap.js parseLabelField', () => {
  test('leaves a plain, unquoted label field untouched', () => {
    expect(parseLabelField('1125,Ham and cheese sandwich')).toBe('Ham and cheese sandwich');
  });

  test('unescapes the real "Peanut butter" row (id 1126) from the source CSV', () => {
    expect(parseLabelField('1126,"""Peanut butter"')).toBe('"Peanut butter');
  });

  test('unescapes the real "Bacon" row (id 1127) from the source CSV', () => {
    expect(parseLabelField('1127,"""Bacon"')).toBe('"Bacon');
  });

  test('unescapes a doubled internal quote in the middle of a quoted field', () => {
    expect(parseLabelField('9999,"Mom\'s ""famous"" chili"')).toBe('Mom\'s "famous" chili');
  });
});
