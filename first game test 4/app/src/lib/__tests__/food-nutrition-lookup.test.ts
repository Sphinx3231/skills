import { lookupNutritionByLabel, nutritionExistsFor } from '../food-nutrition-lookup';

describe('lookupNutritionByLabel', () => {
  test('returns the full reference row for a known label', () => {
    expect(lookupNutritionByLabel('banana')).toEqual({
      foodName: 'Banana',
      calories: 105,
      proteinG: 1.3,
      carbsG: 27,
      fatG: 0.4,
      servingDescription: '1 medium banana',
    });
  });

  test('returns null for a label with no matching row (defensive path)', () => {
    expect(lookupNutritionByLabel('not_a_real_label')).toBeNull();
  });
});

describe('nutritionExistsFor', () => {
  test('true for a known label, false for an unknown one', () => {
    expect(nutritionExistsFor('pizza')).toBe(true);
    expect(nutritionExistsFor('not_a_real_label')).toBe(false);
  });
});
