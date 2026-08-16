import { db } from "../db/index.js";

// Looks up a matched candidate label's reference nutrition row. Returns null
// for an anchor label, an unmatched label, or (defensively) any label
// missing a row — food-candidate-labels.test.js asserts the last case never
// actually happens for a real deploy.
export function lookupNutritionByLabel(label) {
  const row = db.prepare("SELECT * FROM food_nutrition_reference WHERE label = ?").get(label);
  if (!row) return null;
  return {
    foodName: row.food_name,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    servingDescription: row.serving_description,
  };
}

export function nutritionExistsFor(label) {
  const row = db.prepare("SELECT 1 FROM food_nutrition_reference WHERE label = ?").get(label);
  return !!row;
}
