#!/usr/bin/env node
// Dev-time script that generates backend/src/data/food-nutrition-data.js —
// the checked-in nutrition-reference constant seeded into
// `food_nutrition_reference` at startup (see backend/src/db/index.js).
//
// Honesty note (do not remove): this run does NOT call the USDA
// FoodData Central API live — that would need an API key
// (https://fdc.nal.usda.gov/api-key-signup) this environment doesn't have
// configured, and per-food lookups would still need manual judgment calls
// about which FDC entry best represents "one standard serving" of a
// CLIP-recognized dish (FDC's raw entries are branded/generic items, not
// pre-composed dish servings). Instead, each row below is a one-standard-
// serving estimate manually cross-checked against typical USDA FoodData
// Central values for the closest matching foods (e.g. "banana, raw",
// "chicken breast, roasted" for grilled_chicken_breast). These are
// reasonable, credibly-sourced estimates, not values pulled from a live API
// response — record this distinction in the outcome doc, don't imply an
// automated FDC fetch happened.
//
// Run with: node backend/scripts/build-food-nutrition-data.mjs
// Re-run whenever CANDIDATE_LABELS' food entries change, so this file's
// `nutritionExistsFor` invariant (every non-anchor label has a row) stays
// true — enforced by backend/test/food-candidate-labels.test.js.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "src", "data", "food-nutrition-data.js");

// label matches a CANDIDATE_LABELS[].key (food-candidate-labels.js), never a
// raw model prompt string.
const FOOD_NUTRITION_DATA = [
  { label: "pizza", foodName: "Pizza", calories: 285, proteinG: 12, carbsG: 36, fatG: 10, servingDescription: "1 large slice, cheese" },
  { label: "sushi", foodName: "Sushi roll", calories: 255, proteinG: 9, carbsG: 48, fatG: 3.5, servingDescription: "1 roll, 6 pieces" },
  { label: "hamburger", foodName: "Hamburger", calories: 354, proteinG: 20, carbsG: 32, fatG: 17, servingDescription: "1 burger, single patty with bun" },
  { label: "tiramisu", foodName: "Tiramisu", calories: 402, proteinG: 6, carbsG: 34, fatG: 27, servingDescription: "1 slice" },
  { label: "tacos", foodName: "Tacos", calories: 340, proteinG: 18, carbsG: 30, fatG: 16, servingDescription: "2 tacos, ground beef, hard shell" },
  { label: "taco", foodName: "Taco", calories: 170, proteinG: 9, carbsG: 15, fatG: 8, servingDescription: "1 taco, ground beef, hard shell" },
  { label: "ramen", foodName: "Ramen", calories: 436, proteinG: 18, carbsG: 60, fatG: 14, servingDescription: "1 bowl, pork ramen" },
  { label: "glazed_donuts", foodName: "Glazed donut", calories: 269, proteinG: 4, carbsG: 31, fatG: 15, servingDescription: "1 medium glazed donut" },
  { label: "banana", foodName: "Banana", calories: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4, servingDescription: "1 medium banana" },
  { label: "oatmeal_porridge", foodName: "Oatmeal", calories: 166, proteinG: 6, carbsG: 28, fatG: 3.6, servingDescription: "1 cup, cooked" },
  { label: "grilled_chicken_breast", foodName: "Grilled chicken breast", calories: 284, proteinG: 53, carbsG: 0, fatG: 6, servingDescription: "1 boneless, skinless breast" },
  { label: "mixed_green_salad", foodName: "Mixed green salad", calories: 20, proteinG: 1.5, carbsG: 4, fatG: 0.2, servingDescription: "2 cups, no dressing" },
  { label: "pasta_salad", foodName: "Pasta salad", calories: 260, proteinG: 6, carbsG: 30, fatG: 13, servingDescription: "1 cup" },
  { label: "protein_shake", foodName: "Protein shake", calories: 200, proteinG: 25, carbsG: 12, fatG: 4, servingDescription: "1 shake, whey + milk" },
  { label: "apple", foodName: "Apple", calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3, servingDescription: "1 medium apple" },
  { label: "white_rice", foodName: "White rice", calories: 205, proteinG: 4.3, carbsG: 45, fatG: 0.4, servingDescription: "1 cup, cooked" },
  { label: "scrambled_eggs", foodName: "Scrambled eggs", calories: 182, proteinG: 12, carbsG: 2, fatG: 14, servingDescription: "2 large eggs" },
  { label: "steak", foodName: "Steak", calories: 330, proteinG: 48, carbsG: 0, fatG: 14, servingDescription: "6 oz sirloin" },
  { label: "french_fries", foodName: "French fries", calories: 365, proteinG: 4, carbsG: 48, fatG: 17, servingDescription: "1 medium fast-food serving" },
  { label: "fried_rice", foodName: "Fried rice", calories: 333, proteinG: 8, carbsG: 41, fatG: 15, servingDescription: "1 cup" },
  { label: "waffles", foodName: "Waffles", calories: 218, proteinG: 6, carbsG: 25, fatG: 11, servingDescription: "1 round waffle, 7 inch" },
  { label: "ice_cream", foodName: "Ice cream", calories: 137, proteinG: 2.3, carbsG: 16, fatG: 7, servingDescription: "1/2 cup, vanilla" },
  { label: "grilled_salmon", foodName: "Grilled salmon", calories: 354, proteinG: 39, carbsG: 0, fatG: 21, servingDescription: "6 oz fillet" },
  { label: "roasted_vegetables", foodName: "Roasted vegetables", calories: 120, proteinG: 3, carbsG: 18, fatG: 5, servingDescription: "1 cup, mixed" },
  { label: "sandwich", foodName: "Sandwich", calories: 320, proteinG: 20, carbsG: 35, fatG: 10, servingDescription: "1 sandwich, turkey and cheese" },
  { label: "bowl_of_soup", foodName: "Soup", calories: 170, proteinG: 8, carbsG: 18, fatG: 7, servingDescription: "1 cup, chicken noodle style" },
  { label: "yogurt_with_granola", foodName: "Yogurt with granola", calories: 290, proteinG: 15, carbsG: 42, fatG: 8, servingDescription: "1 cup yogurt with 1/4 cup granola" },
  { label: "smoothie", foodName: "Smoothie", calories: 250, proteinG: 6, carbsG: 50, fatG: 3, servingDescription: "16 oz fruit smoothie" },
  { label: "avocado_toast", foodName: "Avocado toast", calories: 190, proteinG: 5, carbsG: 18, fatG: 12, servingDescription: "1 slice sourdough, 1/2 avocado" },
  { label: "burrito", foodName: "Burrito", calories: 480, proteinG: 22, carbsG: 58, fatG: 18, servingDescription: "1 large burrito" },
  { label: "chicken_curry", foodName: "Chicken curry", calories: 340, proteinG: 25, carbsG: 12, fatG: 21, servingDescription: "1 cup" },
  { label: "plate_of_pasta", foodName: "Pasta", calories: 400, proteinG: 14, carbsG: 60, fatG: 12, servingDescription: "1.5 cups with marinara" },
  { label: "grilled_shrimp", foodName: "Grilled shrimp", calories: 120, proteinG: 24, carbsG: 1, fatG: 1.5, servingDescription: "4 oz, about 12 large shrimp" },
  { label: "fruit_bowl", foodName: "Fruit bowl", calories: 80, proteinG: 1, carbsG: 20, fatG: 0.3, servingDescription: "1 cup, mixed fresh fruit" },
  { label: "bagel", foodName: "Bagel", calories: 289, proteinG: 11, carbsG: 56, fatG: 1.7, servingDescription: "1 medium plain bagel" },
  { label: "pancakes", foodName: "Pancakes", calories: 350, proteinG: 8, carbsG: 60, fatG: 9, servingDescription: "2 pancakes, 6 inch, with syrup" },
];

const header = `// GENERATED by backend/scripts/build-food-nutrition-data.mjs — do not hand-edit
// without also updating that script, or the two will drift.
//
// Each row's "label" matches a food-candidate-labels.js CANDIDATE_LABELS[].key
// (never a raw model prompt string). See the script's header comment for
// sourcing honesty notes: these are manually cross-checked one-standard-
// serving estimates against typical USDA FoodData Central values, not a
// live API pull.
`;

const body = `export const FOOD_NUTRITION_DATA = ${JSON.stringify(FOOD_NUTRITION_DATA, null, 2)};\n`;

writeFileSync(outPath, header + "\n" + body);
console.log(`Wrote ${FOOD_NUTRITION_DATA.length} nutrition rows to ${outPath}`);
