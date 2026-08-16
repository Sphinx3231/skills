// Port of backend/src/lib/food-nutrition-db.js's lookupNutritionByLabel /
// nutritionExistsFor (ticket 011, Step 1). Client-side there's no SQLite
// table to query — the spike (docs/outcomes/on-device-clip-feasibility-spike-findings.md,
// Q4) confirmed a plain in-memory Map over the ~36-row ported data constant
// is the right call for a dataset this small, so this is a Map built once
// at module load, not a database.
import { FOOD_NUTRITION_DATA, type FoodNutritionRow } from './food-nutrition-data';

const NUTRITION_BY_LABEL = new Map<string, FoodNutritionRow>(
  FOOD_NUTRITION_DATA.map((row) => [row.label, row])
);

export type NutritionLookupResult = {
  foodName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingDescription: string;
};

// Looks up a matched candidate label's reference nutrition row. Returns null
// for an anchor label, an unmatched label, or (defensively) any label
// missing a row — food-candidate-labels.test.ts asserts the last case never
// actually happens for a real deploy.
export function lookupNutritionByLabel(label: string): NutritionLookupResult | null {
  const row = NUTRITION_BY_LABEL.get(label);
  if (!row) return null;
  return {
    foodName: row.foodName,
    calories: row.calories,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    servingDescription: row.servingDescription,
  };
}

export function nutritionExistsFor(label: string): boolean {
  return NUTRITION_BY_LABEL.has(label);
}
