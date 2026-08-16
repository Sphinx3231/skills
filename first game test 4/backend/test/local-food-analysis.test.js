process.env.DB_PATH = ":memory:";

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { analyzeFoodPhotoLocally } from "../src/lib/local-food-analysis.js";

// The injection seam (local-food-recognition.js's `pipelineFactory` param)
// means passing a fake factory is sufficient on its own to keep the real
// ONNX/sharp stack out of this test process — `defaultPipeline`'s
// `await import('@huggingface/transformers')` only runs when nothing else
// is injected, which none of these tests do.
//
// `getClassifier()` caches its promise at module scope after the first
// call, so all tests in this file share one fake classifier function; each
// test sets `mockResults` right before calling analyzeFoodPhotoLocally to
// control what that shared fake returns.
let mockResults = [];
const fakeClassifier = async () => mockResults;
const fakePipelineFactory = async () => fakeClassifier;

const buffer = Buffer.from([0xff, 0xd8, 0xff]);
const mimetype = "image/jpeg";

async function analyze() {
  return analyzeFoodPhotoLocally({ buffer, mimetype }, fakePipelineFactory);
}

describe("analyzeFoodPhotoLocally", () => {
  test("anchor in top-1 -> empty, low-confidence 'couldn't identify' result", async () => {
    mockResults = [
      { label: "a photo that does not contain any food", score: 0.7 },
      { label: "a photo of pizza", score: 0.2 },
    ];
    const result = await analyze();
    assert.strictEqual(result.foodName, "");
    assert.strictEqual(result.calories, 0);
    assert.strictEqual(result.confidence, "low");
    assert.match(result.caveat, /Couldn't identify/);
  });

  test("REGRESSION: anchor in top-2 (not top-1) still forces low confidence + a caveat — the tech-lead's flagged dog-photo case", async () => {
    // Mirrors the CLIP spike's actual dog-photo finding: top-1 "waffles" at
    // 0.564, top-2 the anchor at 0.394 — a margin (0.17) that top-1-only
    // logic would have called "medium" confidence and shown a wrong food
    // suggestion with no warning at all.
    mockResults = [
      { label: "a photo of waffles", score: 0.564 },
      { label: "a photo that does not contain any food", score: 0.394 },
      { label: "a photo of pancakes", score: 0.02 },
    ];
    const result = await analyze();
    assert.strictEqual(result.foodName, "Waffles");
    assert.strictEqual(result.confidence, "low");
    assert.match(result.caveat, /may not show a clearly recognizable food/);
  });

  test("anchor in top-3 (still within TOP_K_ANCHOR_CHECK) forces low confidence", async () => {
    mockResults = [
      { label: "a photo of pizza", score: 0.6 },
      { label: "a photo of sushi", score: 0.25 },
      { label: "a photo of a random object or scene, not food", score: 0.1 },
    ];
    const result = await analyze();
    assert.strictEqual(result.confidence, "low");
    assert.match(result.caveat, /double-check/);
  });

  test("an anchor outside the top-K window does not suppress a genuine high-confidence match", async () => {
    mockResults = [
      { label: "a photo of pizza", score: 0.9 },
      { label: "a photo of sushi", score: 0.3 },
      { label: "a photo of a hamburger", score: 0.05 },
      { label: "a photo of ramen", score: 0.02 },
      { label: "an unclear photo where no specific food can be identified", score: 0.01 },
    ];
    const result = await analyze();
    assert.strictEqual(result.foodName, "Pizza");
    assert.strictEqual(result.confidence, "high");
  });

  test("matched label with nutrition data returns the reference row's values, never the raw prompt string", async () => {
    mockResults = [
      { label: "a photo of a banana", score: 0.95 },
      { label: "a photo of an apple", score: 0.3 },
    ];
    const result = await analyze();
    assert.strictEqual(result.foodName, "Banana");
    assert.notStrictEqual(result.foodName, "a photo of a banana");
    assert.strictEqual(result.calories, 105);
    assert.match(result.caveat, /one standard serving/);
    assert.match(result.notes, /Suggested automatically/);
  });

  test("a matched top-1 label with no nutrition row (defensive path) returns the safe empty result, never a raw label", async () => {
    mockResults = [
      { label: "a prompt not in CANDIDATE_LABELS at all", score: 0.8 },
      { label: "a photo of pizza", score: 0.1 },
    ];
    const result = await analyze();
    assert.strictEqual(result.foodName, "");
    assert.strictEqual(result.confidence, "low");
    assert.match(result.caveat, /don't have nutrition data/);
  });

  test("empty classifier output returns the safe empty result instead of throwing", async () => {
    mockResults = [];
    const result = await analyze();
    assert.strictEqual(result.foodName, "");
    assert.strictEqual(result.confidence, "low");
  });

  describe("confidence-from-margin thresholds", () => {
    test("margin >= 0.4 -> high", async () => {
      mockResults = [
        { label: "a photo of pizza", score: 0.9 },
        { label: "a photo of sushi", score: 0.4 },
      ];
      assert.strictEqual((await analyze()).confidence, "high");
    });

    test("margin exactly at the 0.15 medium boundary -> medium", async () => {
      mockResults = [
        { label: "a photo of pizza", score: 0.5 },
        { label: "a photo of sushi", score: 0.35 },
      ];
      assert.strictEqual((await analyze()).confidence, "medium");
    });

    test("margin below 0.15 -> low", async () => {
      mockResults = [
        { label: "a photo of pizza", score: 0.4 },
        { label: "a photo of sushi", score: 0.36 },
      ];
      assert.strictEqual((await analyze()).confidence, "low");
    });

    test("a single result with no second place uses its own score as the margin", async () => {
      mockResults = [{ label: "a photo of pizza", score: 0.3 }];
      assert.strictEqual((await analyze()).confidence, "medium");
    });
  });
});
