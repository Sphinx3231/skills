process.env.DB_PATH = ":memory:";
// Shrinks GET /food/barcode/:code's outbound fetch timeout from its 8s
// production default so the "hung upstream" test below doesn't actually
// wait 8 real seconds; every other barcode test's mocked fetch resolves
// near-instantly, well under this window.
process.env.OFF_FETCH_TIMEOUT_MS = "50";

import { test, mock, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

let mockedUserId = "user_food1";
let analyzeShouldFail = false;
let analyzeTextShouldFail = false;
let analyzeTextCallCount = 0;

mock.module("@clerk/express", {
  exports: {
    getAuth: () => ({ userId: mockedUserId }),
    clerkMiddleware: () => (req, res, next) => next(),
    clerkClient: {},
  },
});

mock.module("../src/lib/anthropic.js", {
  exports: {
    analyzeFoodPhoto: async () => {
      if (analyzeShouldFail) throw new Error("model unavailable");
      return {
        foodName: "Grilled chicken with rice",
        calories: 520,
        proteinG: 40,
        carbsG: 55,
        fatG: 12,
        confidence: "high",
        notes: "",
      };
    },
    analyzeFoodText: async () => {
      analyzeTextCallCount += 1;
      if (analyzeTextShouldFail) throw new Error("model unavailable");
      return {
        foodName: "Bowl of oatmeal",
        calories: 250,
        proteinG: 8,
        carbsG: 40,
        fatG: 5,
        confidence: "medium",
        notes: "",
      };
    },
  },
});

const { foodRouter } = await import("../src/routes/food.js");
const { db } = await import("../src/db/index.js");

const app = express();
app.use(express.json());
app.use("/food", foodRouter);

test("POST /food/logs requires foodName and calories", async () => {
  const res = await request(app).post("/food/logs").send({ foodName: "Apple" });
  assert.strictEqual(res.status, 400);
});

test("POST /food/logs creates an entry and bumps the streak", async () => {
  mockedUserId = "user_food_create";
  const res = await request(app).post("/food/logs").send({ foodName: "Apple", calories: 95, source: "manual" });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.food_name, "Apple");
  assert.strictEqual(res.body.calories, 95);
  assert.strictEqual(res.body.source, "manual");

  const companion = db.prepare("SELECT * FROM companion_state WHERE user_id = ?").get("user_food_create");
  assert.strictEqual(companion.streak_count, 1);
});

test("POST /food/logs defaults an unrecognized source to manual", async () => {
  mockedUserId = "user_food_source";
  const res = await request(app).post("/food/logs").send({ foodName: "Toast", calories: 150, source: "bogus" });
  assert.strictEqual(res.body.source, "manual");
});

test("logging twice in the same day does not double the streak", async () => {
  mockedUserId = "user_food_streak";
  await request(app).post("/food/logs").send({ foodName: "Eggs", calories: 200 });
  await request(app).post("/food/logs").send({ foodName: "Toast", calories: 150 });

  const companion = db.prepare("SELECT * FROM companion_state WHERE user_id = ?").get("user_food_streak");
  assert.strictEqual(companion.streak_count, 1);
});

test("GET /food/logs returns only the current user's entries, newest first", async () => {
  mockedUserId = "user_food_isolated_a";
  await request(app).post("/food/logs").send({ foodName: "A1", calories: 100 });
  await request(app).post("/food/logs").send({ foodName: "A2", calories: 200 });

  mockedUserId = "user_food_isolated_b";
  await request(app).post("/food/logs").send({ foodName: "B1", calories: 300 });

  mockedUserId = "user_food_isolated_a";
  const res = await request(app).get("/food/logs");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 2);
  assert.ok(res.body.every((l) => ["A1", "A2"].includes(l.food_name)));
  assert.strictEqual(res.body[0].food_name, "A2"); // newest first
});

test("DELETE /food/logs/:id removes the entry, 404s for someone else's entry", async () => {
  mockedUserId = "user_food_del_owner";
  const created = await request(app).post("/food/logs").send({ foodName: "Delete me", calories: 50 });
  const id = created.body.id;

  mockedUserId = "user_food_del_other";
  const wrongUserDelete = await request(app).delete(`/food/logs/${id}`);
  assert.strictEqual(wrongUserDelete.status, 404);

  mockedUserId = "user_food_del_owner";
  const ok = await request(app).delete(`/food/logs/${id}`);
  assert.strictEqual(ok.status, 204);

  const stillThere = db.prepare("SELECT * FROM food_logs WHERE id = ?").get(id);
  assert.strictEqual(stillThere, undefined);
});

test("GET /food/logs?date= filters to that day only", async () => {
  mockedUserId = "user_food_bydate";
  await request(app).post("/food/logs").send({ foodName: "Today's meal", calories: 100 });

  const today = new Date().toISOString().slice(0, 10);
  const res = await request(app).get(`/food/logs?date=${today}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 1);
  assert.strictEqual(res.body[0].food_name, "Today's meal");

  const past = await request(app).get("/food/logs?date=2000-01-01");
  assert.strictEqual(past.body.length, 0);
});

test("streak continues (does not reset) when the previous log was yesterday", async () => {
  mockedUserId = "user_food_streak_continue";
  await request(app).post("/food/logs").send({ foodName: "Day 1", calories: 100 });

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  db.prepare("UPDATE companion_state SET last_log_date = ? WHERE user_id = ?").run(yesterday, mockedUserId);

  await request(app).post("/food/logs").send({ foodName: "Day 2", calories: 100 });

  const companion = db.prepare("SELECT * FROM companion_state WHERE user_id = ?").get(mockedUserId);
  assert.strictEqual(companion.streak_count, 2);
});

test("streak resets to 1 when a day was missed", async () => {
  mockedUserId = "user_food_streak_reset";
  await request(app).post("/food/logs").send({ foodName: "Day 1", calories: 100 });
  db.prepare("UPDATE companion_state SET streak_count = 5, last_log_date = '2000-01-01' WHERE user_id = ?").run(
    mockedUserId
  );

  await request(app).post("/food/logs").send({ foodName: "Much later", calories: 100 });

  const companion = db.prepare("SELECT * FROM companion_state WHERE user_id = ?").get(mockedUserId);
  assert.strictEqual(companion.streak_count, 1);
});

test("GET /food/dashboard/summary aggregates today's totals against the user's goal", async () => {
  mockedUserId = "user_food_summary";
  await request(app).post("/food/logs").send({ foodName: "X", calories: 300, proteinG: 20, carbsG: 30, fatG: 10 });
  await request(app).post("/food/logs").send({ foodName: "Y", calories: 200, proteinG: 10, carbsG: 20, fatG: 5 });

  const res = await request(app).get("/food/dashboard/summary");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.calories, 500);
  assert.strictEqual(res.body.proteinG, 30);
  assert.strictEqual(res.body.entries, 2);
  assert.strictEqual(res.body.goal, 2000);
});

test("GET /food/frequent ranks repeated meals by count", async () => {
  mockedUserId = "user_food_frequent";
  for (let i = 0; i < 3; i++) await request(app).post("/food/logs").send({ foodName: "Oatmeal", calories: 250 });
  await request(app).post("/food/logs").send({ foodName: "Salad", calories: 180 });

  const res = await request(app).get("/food/frequent");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body[0].food_name, "Oatmeal");
  assert.strictEqual(res.body[0].logCount, 3);
});

test("POST /food/analyze rejects missing photo and bad mimetype", async () => {
  mockedUserId = "user_food_analyze_bad";
  const missing = await request(app).post("/food/analyze");
  assert.strictEqual(missing.status, 400);

  const badType = await request(app)
    .post("/food/analyze")
    .attach("photo", Buffer.from("not an image"), { filename: "note.txt", contentType: "text/plain" });
  assert.strictEqual(badType.status, 400);
});

test("POST /food/analyze returns AI results for a valid photo while trialing", async () => {
  mockedUserId = "user_food_analyze_ok";
  analyzeShouldFail = false;
  const res = await request(app)
    .post("/food/analyze")
    .attach("photo", Buffer.from([0xff, 0xd8, 0xff]), { filename: "meal.jpg", contentType: "image/jpeg" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.foodName, "Grilled chicken with rice");
});

test("POST /food/analyze returns 502 when the model call fails", async () => {
  mockedUserId = "user_food_analyze_fail";
  analyzeShouldFail = true;
  const res = await request(app)
    .post("/food/analyze")
    .attach("photo", Buffer.from([0xff, 0xd8, 0xff]), { filename: "meal.jpg", contentType: "image/jpeg" });
  assert.strictEqual(res.status, 502);
  analyzeShouldFail = false;
});

test("POST /food/analyze is blocked with 402 once the trial has expired", async () => {
  mockedUserId = "user_food_expired";
  db.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)").run(mockedUserId);
  db.prepare("UPDATE users SET created_at = datetime('now', '-40 days') WHERE id = ?").run(mockedUserId);

  const res = await request(app)
    .post("/food/analyze")
    .attach("photo", Buffer.from([0xff, 0xd8, 0xff]), { filename: "meal.jpg", contentType: "image/jpeg" });
  assert.strictEqual(res.status, 402);
  assert.strictEqual(res.body.billing.status, "expired");
});

test("POST /food/analyze-text rejects a blank description", async () => {
  mockedUserId = "user_food_text_missing";
  const res = await request(app).post("/food/analyze-text").send({ description: "   " });
  assert.strictEqual(res.status, 400);
});

test("POST /food/analyze-text rejects a description over the 500-char cap before calling the model", async () => {
  mockedUserId = "user_food_text_toolong";
  const countBefore = analyzeTextCallCount;

  const res = await request(app)
    .post("/food/analyze-text")
    .send({ description: "a".repeat(501) });

  assert.strictEqual(res.status, 400);
  // Proves it's rejected before analyzeFoodText is ever reached, not just
  // that the response happens to be 400 for some other reason.
  assert.strictEqual(analyzeTextCallCount, countBefore);
});

test("POST /food/analyze-text accepts a description at exactly the 500-char cap", async () => {
  mockedUserId = "user_food_text_atcap";
  const res = await request(app)
    .post("/food/analyze-text")
    .send({ description: "a".repeat(500) });
  assert.strictEqual(res.status, 200);
});

test("POST /food/analyze-text's 500-char cap is measured after trimming surrounding whitespace", async () => {
  mockedUserId = "user_food_text_trimcap";
  const res = await request(app)
    .post("/food/analyze-text")
    .send({ description: `  ${"a".repeat(500)}  ` });
  assert.strictEqual(res.status, 200); // 500 real chars + padding whitespace that trim() strips
});

test("POST /food/analyze-text rejects a request with no description field at all", async () => {
  mockedUserId = "user_food_text_absent";
  const res = await request(app).post("/food/analyze-text").send({});
  assert.strictEqual(res.status, 400);
});

test("POST /food/analyze-text rejects a non-string description", async () => {
  mockedUserId = "user_food_text_nonstring";
  const res = await request(app).post("/food/analyze-text").send({ description: 12345 });
  assert.strictEqual(res.status, 400);
});

test("POST /food/analyze-text returns AI results for a spoken/typed description while trialing", async () => {
  mockedUserId = "user_food_text_ok";
  analyzeTextShouldFail = false;
  const res = await request(app).post("/food/analyze-text").send({ description: "a bowl of oatmeal" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.foodName, "Bowl of oatmeal");
});

test("POST /food/analyze-text returns 502 when the model call fails", async () => {
  mockedUserId = "user_food_text_fail";
  analyzeTextShouldFail = true;
  const res = await request(app).post("/food/analyze-text").send({ description: "a bowl of oatmeal" });
  assert.strictEqual(res.status, 502);
  analyzeTextShouldFail = false;
});

test("POST /food/analyze-text is blocked with 402 once the trial has expired", async () => {
  mockedUserId = "user_food_text_expired";
  db.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)").run(mockedUserId);
  db.prepare("UPDATE users SET created_at = datetime('now', '-40 days') WHERE id = ?").run(mockedUserId);

  const res = await request(app).post("/food/analyze-text").send({ description: "a bowl of oatmeal" });
  assert.strictEqual(res.status, 402);
  assert.strictEqual(res.body.billing.status, "expired");
});

describe("GET /food/barcode/:code", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("rejects a malformed barcode before making any outbound request", async () => {
    mockedUserId = "user_barcode_invalid";
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("should not be called");
    };

    const res = await request(app).get("/food/barcode/not-a-barcode");
    assert.strictEqual(res.status, 400);
    assert.strictEqual(fetchCalled, false);
  });

  test("boundary lengths: 7 digits rejected, 8 digits accepted", async () => {
    mockedUserId = "user_barcode_boundary_7_8";
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 0 }), { status: 404 });

    const sevenDigits = await request(app).get("/food/barcode/1234567");
    assert.strictEqual(sevenDigits.status, 400);

    const eightDigits = await request(app).get("/food/barcode/12345678");
    assert.strictEqual(eightDigits.status, 404); // valid length -> reaches the fetch, then "not found"
  });

  test("boundary lengths: 14 digits accepted, 15 digits rejected", async () => {
    mockedUserId = "user_barcode_boundary_14_15";
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 0 }), { status: 404 });

    const fourteenDigits = await request(app).get("/food/barcode/12345678901234");
    assert.strictEqual(fourteenDigits.status, 404); // valid length -> reaches the fetch, then "not found"

    const fifteenDigits = await request(app).get("/food/barcode/123456789012345");
    assert.strictEqual(fifteenDigits.status, 400);
  });

  test("a hung upstream times out and 502s rather than hanging the request", async () => {
    mockedUserId = "user_barcode_timeout";
    globalThis.fetch = (url, opts) =>
      new Promise((resolve, reject) => {
        // Never resolves on its own — only settles if the route's
        // AbortController fires, proving the timeout (not the mock) is
        // what ends the request.
        opts.signal.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 502);
  });

  test("is not gated by the trial (works after expiry)", async () => {
    mockedUserId = "user_barcode_expired";
    db.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)").run(mockedUserId);
    db.prepare("UPDATE users SET created_at = datetime('now', '-40 days') WHERE id = ?").run(mockedUserId);
    // Real Open Food Facts shape for an unknown barcode: HTTP 404 with a
    // {status:0,...} body (not HTTP 200) — see the dedicated regression
    // test below for why this distinction matters.
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ status: 0 }), { status: 404 });

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 404); // not gated -> reaches the "not found" branch, not 402
  });

  test("sends a real User-Agent on the outbound request", async () => {
    mockedUserId = "user_barcode_ua";
    let seenHeaders;
    globalThis.fetch = async (url, opts) => {
      seenHeaders = opts.headers;
      return new Response(JSON.stringify({ status: 0 }), { status: 404 });
    };

    await request(app).get("/food/barcode/3017620422003");
    assert.ok(seenHeaders["User-Agent"] && seenHeaders["User-Agent"] !== "");
  });

  test("status 0 -> 404 not found (synthetic HTTP 200 shape)", async () => {
    // Not the real OFF wire shape (see the regression test below), but kept
    // to pin the { status: 0 } body-parsing branch in isolation regardless
    // of what HTTP status carries it.
    mockedUserId = "user_barcode_notfound";
    globalThis.fetch = async () => new Response(JSON.stringify({ status: 0 }), { status: 200 });

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, "No product found for this barcode");
  });

  test("REGRESSION: a real unknown barcode (HTTP 404 + {status:0} body, not HTTP 200) returns the 'not found' 404, not a 502", async () => {
    // Open Food Facts' v2 API actually returns a transport-level HTTP 404
    // for an unknown barcode, still carrying a JSON body shaped like
    // {status:0, status_verbose:"product not found"}. The route used to
    // check `!offRes.ok` before ever looking at the body, so this exact
    // response landed on the generic 502 branch and the intended 404
    // "No product found for this barcode" message was dead code in
    // production even though every other test in this file passed (they
    // all synthesized {status:0} on an HTTP 200, which never happens for
    // real). This pins the real wire shape.
    mockedUserId = "user_barcode_real_404_shape";
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ status: 0, status_verbose: "product not found" }), { status: 404 });

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, "No product found for this barcode");
  });

  test("found but no usable nutrition data -> distinct 404", async () => {
    mockedUserId = "user_barcode_nonutrition";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ status: 1, product: { product_name: "Mystery Snack", nutriments: {} } }),
        { status: 200 }
      );

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, "Found a product, but it has no nutrition data on file");
  });

  test("found with serving-suffixed nutrition data -> uses serving values, no caveat", async () => {
    mockedUserId = "user_barcode_serving";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name: "Protein Bar",
            serving_size: "50g",
            nutriments: {
              "energy-kcal_serving": 200,
              proteins_serving: 20,
              carbohydrates_serving: 15,
              fat_serving: 6,
              "energy-kcal_100g": 400,
            },
          },
        }),
        { status: 200 }
      );

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.foodName, "Protein Bar");
    assert.strictEqual(res.body.calories, 200);
    assert.strictEqual(res.body.proteinG, 20);
    assert.strictEqual(res.body.caveat, null);
    assert.match(res.body.notes, /50g/);
  });

  test("serving basis with missing macro keys falls back to 0, and missing serving_size omits it from notes", async () => {
    mockedUserId = "user_barcode_serving_sparse";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: {
            // No product_name and no serving_size at all.
            nutriments: { "energy-kcal_serving": 150 },
          },
        }),
        { status: 200 }
      );

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.foodName, "Unknown product");
    assert.strictEqual(res.body.proteinG, 0);
    assert.strictEqual(res.body.carbsG, 0);
    assert.strictEqual(res.body.fatG, 0);
    assert.strictEqual(res.body.notes, "Based on the stated serving size.");
  });

  test("100g basis with missing macro keys falls back to 0", async () => {
    mockedUserId = "user_barcode_100g_sparse";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: { product_name: "Sparse Snack", nutriments: { "energy-kcal_100g": 300 } },
        }),
        { status: 200 }
      );

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.proteinG, 0);
    assert.strictEqual(res.body.carbsG, 0);
    assert.strictEqual(res.body.fatG, 0);
  });

  test("found with only per-100g nutrition data -> uses 100g values, shows caveat", async () => {
    mockedUserId = "user_barcode_100g";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name: "Nutella",
            nutriments: {
              "energy-kcal_100g": 539,
              proteins_100g: 6.3,
              carbohydrates_100g: 57.5,
              fat_100g: 30.9,
            },
          },
        }),
        { status: 200 }
      );

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.foodName, "Nutella");
    assert.strictEqual(res.body.calories, 539);
    assert.strictEqual(res.body.proteinG, 6.3);
    assert.ok(res.body.caveat && res.body.caveat.length > 0);
  });

  test("real calories with one genuinely-missing macro -> 200, caveat names it (not zeroed silently, not a false 404)", async () => {
    mockedUserId = "user_barcode_missing_protein";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name: "Mystery Bar",
            serving_size: "40g",
            nutriments: {
              "energy-kcal_serving": 180,
              // proteins_serving is genuinely absent (not present at all).
              carbohydrates_serving: 20,
              fat_serving: 8,
            },
          },
        }),
        { status: 200 }
      );

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.proteinG, 0);
    assert.match(res.body.caveat, /Protein/);
    assert.match(res.body.caveat, /isn't on file/);
  });

  test("real calories with multiple genuinely-missing macros -> caveat names all of them", async () => {
    mockedUserId = "user_barcode_missing_two";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name: "Sparse Bar",
            nutriments: { "energy-kcal_100g": 250, carbohydrates_100g: 30 },
            // proteins_100g and fat_100g are both genuinely absent.
          },
        }),
        { status: 200 }
      );

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 200);
    assert.match(res.body.caveat, /Protein/);
    assert.match(res.body.caveat, /Fat/);
    assert.match(res.body.caveat, /aren't on file/);
  });

  test("a genuinely-missing energy key still 404s even if other macros are present", async () => {
    mockedUserId = "user_barcode_missing_energy";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name: "No Calories Listed",
            nutriments: { proteins_100g: 5, carbohydrates_100g: 10, fat_100g: 2 },
            // energy-kcal_100g / energy-kcal_serving both absent.
          },
        }),
        { status: 200 }
      );

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, "Found a product, but it has no nutrition data on file");
  });

  test("caveat composes the per-100g basis statement AND a missing-macro notice when both apply, without one overwriting the other", async () => {
    mockedUserId = "user_barcode_composed_caveat";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name: "No Serving, Missing Fat",
            // No serving_size / no *_serving keys at all -> 100g basis.
            nutriments: { "energy-kcal_100g": 300, proteins_100g: 10, carbohydrates_100g: 40 },
            // fat_100g is genuinely absent.
          },
        }),
        { status: 200 }
      );

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 200);
    assert.match(res.body.caveat, /per 100g/);
    assert.match(res.body.caveat, /Fat/);
    assert.match(res.body.caveat, /isn't on file/);
  });

  test("a macro present as an explicit 0 is not treated as missing (no caveat mention)", async () => {
    mockedUserId = "user_barcode_zero_not_missing";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: {
            product_name: "Water",
            serving_size: "500ml",
            nutriments: {
              "energy-kcal_serving": 0,
              proteins_serving: 0,
              carbohydrates_serving: 0,
              fat_serving: 0,
            },
          },
        }),
        { status: 200 }
      );

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.proteinG, 0);
    assert.strictEqual(res.body.caveat, null);
  });

  test("non-ok HTTP response from Open Food Facts -> 502", async () => {
    mockedUserId = "user_barcode_httperror";
    globalThis.fetch = async () => new Response("Service Unavailable", { status: 503 });

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 502);
  });

  test("network failure -> 502", async () => {
    mockedUserId = "user_barcode_network";
    globalThis.fetch = async () => {
      throw new Error("network down");
    };

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 502);
  });

  test("a malformed (non-JSON) response body -> 502, even on an otherwise-ok status", async () => {
    mockedUserId = "user_barcode_badjson";
    globalThis.fetch = async () => new Response("<html>not json</html>", { status: 200 });

    const res = await request(app).get("/food/barcode/3017620422003");
    assert.strictEqual(res.status, 502);
  });
});

test("'barcode' source round-trips through a real insert+read on POST /food/logs", async () => {
  mockedUserId = "user_food_barcode_source";
  const created = await request(app)
    .post("/food/logs")
    .send({ foodName: "Nutella", calories: 539, proteinG: 6.3, carbsG: 57.5, fatG: 30.9, source: "barcode" });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.source, "barcode");

  const fetched = db.prepare("SELECT * FROM food_logs WHERE id = ?").get(created.body.id);
  assert.strictEqual(fetched.source, "barcode");
});
