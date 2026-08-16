process.env.DB_PATH = ":memory:";

import { test } from "node:test";
import assert from "node:assert/strict";
import { CANDIDATE_LABELS } from "../src/lib/food-candidate-labels.js";
import { nutritionExistsFor } from "../src/lib/food-nutrition-db.js";

test("every non-anchor candidate label has a corresponding food_nutrition_reference row (Step 0 item 2's invariant)", () => {
  const missing = CANDIDATE_LABELS.filter((l) => !l.isAnchor && !nutritionExistsFor(l.key));
  assert.deepStrictEqual(
    missing.map((l) => l.key),
    [],
    "every non-anchor CANDIDATE_LABELS entry must have a seeded nutrition row"
  );
});

test("anchor labels do NOT have a nutrition-reference row (never expected to be looked up)", () => {
  const anchors = CANDIDATE_LABELS.filter((l) => l.isAnchor);
  assert.ok(anchors.length > 0);
  for (const anchor of anchors) {
    assert.strictEqual(nutritionExistsFor(anchor.key), false);
  }
});

test("all keys are unique", () => {
  const keys = CANDIDATE_LABELS.map((l) => l.key);
  assert.strictEqual(new Set(keys).size, keys.length);
});

test("all prompts are unique (the model must be able to tell candidates apart)", () => {
  const prompts = CANDIDATE_LABELS.map((l) => l.prompt);
  assert.strictEqual(new Set(prompts).size, prompts.length);
});

test("at least one anchor/negative label exists", () => {
  assert.ok(CANDIDATE_LABELS.some((l) => l.isAnchor));
});
