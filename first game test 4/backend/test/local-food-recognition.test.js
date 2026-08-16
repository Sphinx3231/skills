import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  resolveModelCacheDir,
  getClassifier,
  classifyFoodPhoto,
} from "../src/lib/local-food-recognition.js";

describe("resolveModelCacheDir", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.FOXBITE_HF_CACHE_DIR;
    delete process.env.LOCALAPPDATA;
    delete process.env.XDG_CACHE_HOME;
  });

  test("prefers an explicit FOXBITE_HF_CACHE_DIR override", () => {
    process.env.FOXBITE_HF_CACHE_DIR = "C:\\custom\\cache";
    assert.strictEqual(resolveModelCacheDir(), "C:\\custom\\cache");
    process.env = { ...originalEnv };
  });

  test("falls back to LOCALAPPDATA/foxbite/hf-cache — outside node_modules (survives npm ci) and outside the OneDrive-synced repo tree", () => {
    process.env.LOCALAPPDATA = "C:\\Users\\test\\AppData\\Local";
    assert.strictEqual(
      resolveModelCacheDir(),
      path.join("C:\\Users\\test\\AppData\\Local", "foxbite", "hf-cache")
    );
    process.env = { ...originalEnv };
  });

  test("falls back to os.tmpdir() when neither override nor LOCALAPPDATA/XDG_CACHE_HOME is set", () => {
    const result = resolveModelCacheDir();
    assert.ok(result.endsWith(path.join("foxbite", "hf-cache")));
    process.env = { ...originalEnv };
  });
});

// getClassifier/classifyFoodPhoto share one module-scope `classifierPromise`
// singleton for this test file's process — node --test runs each test file
// in its own process, so this doesn't collide with other test files'
// classifier state. That singleton behavior is exactly what's under test
// here, so these two tests are ordered deliberately: the first call
// establishes the cache via its injected factory, the second proves a
// later call reuses it instead of invoking a new one.
describe("getClassifier / classifyFoodPhoto injection seam", () => {
  let firstFactoryCallArgs = null;
  let firstFactoryCallCount = 0;
  const firstFakeClassifier = async (blob, prompts, options) => [
    { label: prompts[0], score: 0.9, _sawOptions: options, _sawBlobType: blob.type },
  ];
  async function firstFakeFactory(...args) {
    firstFactoryCallArgs = args;
    firstFactoryCallCount += 1;
    return firstFakeClassifier;
  }

  test("classifyFoodPhoto obtains a classifier via the injected pipelineFactory, wraps the buffer in a Blob with the given mimetype, and passes a flat hypothesis_template", async () => {
    const buffer = Buffer.from([1, 2, 3]);
    const results = await classifyFoodPhoto(buffer, "image/png", firstFakeFactory);

    assert.deepStrictEqual(firstFactoryCallArgs, [
      "zero-shot-image-classification",
      "Xenova/clip-vit-base-patch32",
    ]);
    assert.strictEqual(firstFactoryCallCount, 1);
    assert.ok(Array.isArray(results) && results.length === 1);
    assert.strictEqual(results[0]._sawBlobType, "image/png");
    assert.deepStrictEqual(results[0]._sawOptions, { hypothesis_template: "{}" });
    assert.ok(typeof results[0].label === "string" && results[0].label.length > 0);
  });

  test("a later call with a different pipelineFactory does not re-invoke it — the classifier promise is cached", async () => {
    let secondFactoryCallCount = 0;
    const secondFakeFactory = async () => {
      secondFactoryCallCount += 1;
      return async () => [];
    };

    const classifier = await getClassifier(secondFakeFactory);
    assert.strictEqual(secondFactoryCallCount, 0, "cached singleton must not call a newly-passed factory");
    assert.strictEqual(firstFactoryCallCount, 1, "the original factory must still only have been called once");
    assert.strictEqual(classifier, firstFakeClassifier);
  });
});
