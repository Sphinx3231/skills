process.env.DB_PATH = ":memory:";

import { test } from "node:test";
import assert from "node:assert/strict";
import { lookupNutritionByLabel, nutritionExistsFor } from "../src/lib/food-nutrition-db.js";
import { db } from "../src/db/index.js";

test("lookupNutritionByLabel hits a real seeded row and shapes it correctly", () => {
  const result = lookupNutritionByLabel("pizza");
  assert.ok(result);
  assert.strictEqual(result.foodName, "Pizza");
  assert.strictEqual(typeof result.calories, "number");
  assert.strictEqual(typeof result.proteinG, "number");
  assert.strictEqual(typeof result.carbsG, "number");
  assert.strictEqual(typeof result.fatG, "number");
  assert.strictEqual(typeof result.servingDescription, "string");
  assert.ok(result.servingDescription.length > 0);
});

test("lookupNutritionByLabel misses for an unknown label", () => {
  assert.strictEqual(lookupNutritionByLabel("not_a_real_label"), null);
});

test("lookupNutritionByLabel misses for an anchor label (anchors are never seeded)", () => {
  assert.strictEqual(lookupNutritionByLabel("not_food"), null);
});

test("nutritionExistsFor mirrors lookupNutritionByLabel's hit/miss behavior", () => {
  assert.strictEqual(nutritionExistsFor("pizza"), true);
  assert.strictEqual(nutritionExistsFor("not_a_real_label"), false);
});

test("seeding is idempotent — re-running the seed insert does not error or duplicate", () => {
  // db/index.js's module-scope seeding already ran once at import time for
  // this process; re-running the exact same INSERT OR IGNORE statement
  // (simulating a second boot against the same DB) must not throw or
  // change the row.
  const before = db.prepare("SELECT * FROM food_nutrition_reference WHERE label = 'pizza'").get();
  db.prepare(
    `INSERT OR IGNORE INTO food_nutrition_reference
       (label, food_name, calories, protein_g, carbs_g, fat_g, serving_description)
     VALUES ('pizza', 'Pizza', 285, 12, 36, 10, '1 large slice, cheese')`
  ).run();
  const after = db.prepare("SELECT * FROM food_nutrition_reference WHERE label = 'pizza'").get();
  assert.deepStrictEqual(after, before);
  const count = db
    .prepare("SELECT COUNT(*) AS n FROM food_nutrition_reference WHERE label = 'pizza'")
    .get().n;
  assert.strictEqual(count, 1);
});
