# Outcome: Local CLIP food recognition behind the existing confirm-before-log screen (ticket 010, architecture attempt 3, revision 2)

Ticket: [docs/tickets/010-on-device-food-recognition.md](../tickets/010-on-device-food-recognition.md) ·
Plan: [docs/plans/on-device-food-recognition-plan.md](../plans/on-device-food-recognition-plan.md)

Related: [docs/outcomes/on-device-food-recognition-outcome.md](on-device-food-recognition-outcome.md)
(attempt 2's Food-101/Swin spike, NO-GO) ·
[docs/outcomes/clip-zero-shot-spike-findings.md](clip-zero-shot-spike-findings.md)
(attempt 3's own spike, "not a clean go")

## Verdict up front

**Built as planned.** `POST /food/analyze` now runs a local, free CLIP
zero-shot classifier (`Xenova/clip-vit-base-patch32`) instead of calling
Claude vision — zero per-call AI cost for photo scans. The existing
mandatory review/confirm screen (`log.tsx`'s `review` step) is unchanged in
structure and continues to gate every save; four small, targeted client
deltas were made to it per the plan's Step 4. All planned backend modules,
the nutrition-reference table, and both backend and frontend test additions
are in place and passing.

**This does NOT mean CLIP's core failure mode is solved.** Per the plan's
explicit honesty requirement: **CLIP's non-food-confidently-wrong failure
mode still exists at the model layer, exactly as the spike found it, and is
mitigated — not eliminated — by the confirm screen plus this ticket's
client deltas.** See "Named residual risks" below.

## Install-time note

`npm install` in `backend/` will prompt to approve build scripts for four
packages with native/postinstall steps: `better-sqlite3`, `onnxruntime-node`,
`protobufjs`, `sharp` (run `npm approve-builds` and select all four, or
`npm install --foreground-scripts` to see prompts inline). This isn't a new
npm config field — an earlier draft added an inert `allowScripts` block to
`package.json` (a `@lavamoat/allow-scripts` convention that plain npm
doesn't read, and this repo has no such tool installed), which has been
removed since it looked functional but did nothing. Noted here instead so a
fresh clone isn't confused by a silent install-time prompt.

## What was built

1. **`backend/src/lib/food-candidate-labels.js`** — the single source of
   truth for the 36 food + 3 anchor candidate labels, reusing the CLIP
   spike's exact label set and `"a photo of X"` template/anchor sentences
   (not a fresh list), so the spike's cited accuracy numbers describe what's
   actually shipping. Each entry is `{key, prompt, isAnchor}`; the model
   only ever sees `prompt`.
2. **`backend/scripts/build-food-nutrition-data.mjs`** → generates
   **`backend/src/data/food-nutrition-data.js`** (checked in) — one-
   standard-serving nutrition estimates for all 36 food labels. **Honesty
   note, stated plainly per the plan's Step 1 sourcing discipline**: these
   are NOT a live USDA FoodData Central API pull — no FDC API key is
   configured in this environment, and per-dish serving composition (e.g.
   "one taco" vs. FDC's raw branded/generic ingredient entries) still needs
   a human judgment call regardless. Each row is a manually-set estimate
   cross-checked against typical, publicly-known USDA-style values for the
   closest matching food, documented as such in the script's header. This
   is a real gap from "generate against a credible source via live lookup"
   as originally worded in the plan — recorded honestly rather than implying
   an automated fetch happened.
3. **`backend/src/db/index.js`** — new `food_nutrition_reference` table,
   seeded idempotently (`INSERT OR IGNORE`) from the generated data at
   every startup, including `DB_PATH=":memory:"` test runs, following the
   codebase's existing schema/seeding pattern exactly.
4. **`backend/src/lib/local-food-recognition.js`** — lazy singleton
   classifier with the required injection seam (`pipelineFactory` param,
   defaulting to a lazy `async function defaultPipeline` that does
   `await import('@huggingface/transformers')` — never a static top-level
   import). `classifyFoodPhoto` wraps the multer buffer in a `Blob` (the
   real accepted input shape, confirmed by reading
   `@huggingface/transformers@4.2.0`'s actual source, matching the CLIP
   spike's own Step 0 finding).
5. **`backend/src/lib/local-food-analysis.js`** — the orchestrator.
   Anchor-anywhere-in-top-3 forces low confidence (not just top-1), margin-
   based confidence bands, and `foodName` sourced **only** from the
   nutrition table's `food_name` column or the empty string — never from a
   raw model prompt string. Every classification returns HTTP 200 with a
   reviewable result; only a genuine thrown exception still 502s.
6. **`backend/src/routes/food.js`** — `POST /food/analyze` now calls
   `analyzeFoodPhotoLocally({ buffer: req.file.buffer, mimetype: ... })`
   directly, dropping the base64 conversion the Claude path needed.
   `requireActiveAccess` and the multer/mimetype validation are unchanged.
7. **Client deltas to the existing `log.tsx` review screen** (no new
   screen, no new `Step`):
   - Blank-`foodName` save guard in `confirmSave()` — a clear "Enter a food
     name before saving." message instead of a round-tripped 400.
   - `rawResultRef` captures the true original model response at all three
     `setResult` call sites (`pickAndAnalyze`, `submitDescription`,
     `lookupBarcode`) and is what `confirmSave()` sends as `aiRawResponse`
     — independent of the review card's edit handlers mutating `result`.
     Cleared in both `reset()` and `finishLogging()`.
   - `api.ts`'s `caveat` doc comment corrected — it's no longer barcode-
     only now that every photo scan carries one.
8. **`backend/src/lib/anthropic.js`** — `analyzeFoodPhoto` left in place,
   marked superseded in a comment, no longer called by the route (per the
   ticket's non-goals — not deleted).
9. **`backend/src/index.js`** — the stale `ANTHROPIC_API_KEY` startup
   warning corrected to say only `/food/analyze-text` needs it now; the
   local classifier is pre-warmed (`await`ed) **before** `app.listen()`,
   deliberately, since `app/src/lib/api.ts`'s `request()` wrapper has no
   timeout/`AbortController` — an unwarmed first live request would hang
   rather than fail fast.

## Corrections made to the plan's own code sketches during the build

The plan explicitly invited this ("confirm the real input/output shape...
don't assume version parity") — two real corrections were found by reading
`@huggingface/transformers@4.2.0`'s actual installed source, not by
assumption:

1. **No `HF_HOME` env var exists in this library.** The plan's Step 0 item
   5 assumed one; the installed library's `src/env.js` shows cache
   relocation is a **programmatic** `env.cacheDir` property (default
   `<package-dir>/.cache/`, confirmed matching the CLIP spike's own
   finding), read fresh on every cache access
   (`src/utils/cache.js: new FileCache(file_cache_dir ?? env.cacheDir)`).
   Fixed by importing the library's `env` singleton and setting
   `env.cacheDir` inside `defaultPipeline`, before the first `pipeline()`
   call — verified working end-to-end (see "What was actually verified
   live" below), not just coded and assumed.
2. **The zero-shot pipeline's real call signature substitutes candidate
   labels into a `hypothesis_template`** (default
   `'This is a photo of {}'`) — it does not send `candidate_labels` to the
   model verbatim, confirmed directly in
   `src/pipelines/zero-shot-image-classification.js`. The plan's Step 2
   sketch implicitly assumed `CANDIDATE_LABELS[].prompt` (already a
   complete sentence) would be sent as-is; passing it through the default
   template would have doubled the wording into nonsense like "This is a
   photo of a photo of pizza." Fixed by passing
   `{ hypothesis_template: '{}' }` so `PROMPTS` reach the model exactly as
   written. This is exactly the kind of input/output-shape bug Step 0 item
   4 asked to guard against, and it would have silently degraded every
   real classification (not thrown an error) had it shipped uncaught.

## What was actually verified live (not just unit-tested with a fake pipeline)

A one-off manual script (`backend/src/lib/local-food-analysis.js` imported
directly, no injected fake) ran the **real** `@huggingface/transformers`
pipeline end-to-end:

- `resolveModelCacheDir()` resolved to
  `C:\Users\<user>\AppData\Local\foxbite\hf-cache` — outside `node_modules`
  and outside the OneDrive-synced repo tree, as required.
- The real model (`Xenova/clip-vit-base-patch32`, `onnx/model.onnx`,
  **605,799,029 bytes** on disk) downloaded from Hugging Face Hub into
  exactly that relocated directory — confirmed by listing the directory
  before (didn't exist) and after (existed, contained
  `Xenova/clip-vit-base-patch32/onnx/model.onnx` + config/tokenizer files).
  This directly confirms the plan's Step 0 item 5 instruction to "confirm
  the pipeline actually respects [the cache relocation] before relying on
  it" — it does.
- A synthetic JPEG (Wikimedia Commons and httpbin.org both failed to serve
  a usable test photo during this verification — Wikimedia's robot policy
  403s a generic User-Agent, httpbin returned a transient 503 — a locally
  `sharp`-generated solid-color image was used instead, purely to exercise
  pipeline mechanics, not to re-test CLIP's food-recognition accuracy,
  which is already covered by the CLIP spike's own real-photo findings) ran
  through the full real pipeline in 3.48s (warm cache, no re-download) and
  returned a well-formed result (`{foodName: "Ice cream", confidence: "low",
  ...}` with the standard-serving caveat) — proving the Blob construction,
  the `hypothesis_template` fix, and the nutrition-table lookup all work
  together against the real model, not just the unit tests' fake
  `pipelineFactory`.
- The real backend server (`node src/index.js`, real `.env`, no
  `ANTHROPIC_API_KEY`) booted cleanly, printed the corrected startup
  warning, pre-warmed the classifier before `app.listen()`, and answered
  `GET /health` with `200 {"ok":true}`.
- `npx expo start --web --clear` (fresh Metro bundle, no cache) bundled all
  1,493 modules of the web entry point with no Metro/module-resolution
  error and served a real `200` response — confirms this ticket's frontend
  changes (`log.tsx`, `api.ts`) didn't break the web bundle. (This ticket
  added no new native-module dependency to `app/`, so the `run-foxbite-web`
  skill's "broken web support" gap class doesn't apply here the way it
  would for a frontend native dependency — the heavy new dependency
  (`@huggingface/transformers`, ONNX, sharp) is backend-only.)
- `npx tsc --noEmit` on `app/` showed the same 3 pre-existing errors
  (`animated-icon.tsx`, `app-tabs.web.tsx`, `components/ui/collapsible.tsx`)
  as before this ticket touched anything — no new TypeScript errors from
  `log.tsx`/`api.ts`'s edits.

## What could NOT be verified — stated explicitly, not glossed over

**No real Clerk-session Playwright run through the actual UI was
performed.** The `run-foxbite-web` skill's own instructions require either
a seeded test account or user-supplied Clerk credentials ("there's no
seeded test account in this repo... ask the user for test credentials
rather than guessing at any") — this build ran as a non-interactive Sonnet
implementer step with no channel to request or receive credentials
mid-task. Concretely, NOT verified by an actual browser session:
- That the review screen visually renders the CLIP model's suggestion with
  the caveat/low-confidence banner reading as genuinely meaningful (vs.
  ignorable chrome) to a real user, on the real rendered page — Step 4
  item 4 and Step 6(c)'s explicit ask.
- That editing a field before tapping Save persists the edited value (not
  the original guess) through a real save round-trip against the real
  running backend + real Clerk-authenticated request — the *mechanism* is
  covered by the new `log.test.tsx` mocked-component test and by reading
  the code, but not by an actual end-to-end browser-driven save.
- That an expired trial account hits the paywall in the live UI (this
  path's server-side logic is unit-tested and unchanged by this ticket).
- Mobile (iOS/Android native) is not verified at all in any form for this
  ticket — only web bundling was smoke-tested. The ticket's acceptance
  criterion "web and mobile both get the feature identically" is
  satisfied only in the sense that the route and client code have no
  platform-specific branches for this feature, not by running on an actual
  device/simulator.

This is a real, named gap — reported honestly rather than asserting a
Playwright run that didn't happen.

## Real test numbers (actual runs, not estimates)

**Backend** — `node --experimental-test-module-mocks --experimental-test-coverage --test` from `backend/`:
- **121 tests, 121 pass, 0 fail.**
- Coverage: **99.24% lines / 97.29% branches / 97.96% functions** (all
  files aggregate). `local-food-recognition.js` sits at 93.90%/100%/80% —
  the uncovered lines (38–42) are `defaultPipeline`'s body, i.e. the real
  `await import('@huggingface/transformers')` + real `pipeline()` call
  path. This is deliberately not exercised by the unit-test suite (every
  test injects a fake `pipelineFactory` per the plan's coverage-strategy
  requirement) — covering it directly would require the real ~600MB model
  load inside the test run, which the plan's injection-seam design exists
  specifically to avoid. The real path *was* exercised, once, by the
  manual live-verification script described above — just not inside the
  automated suite.

**Frontend** — `npx jest --coverage` from `app/`:
- **38 suites, 327 tests, 327 pass, 0 fail** (55 of those in
  `log.test.tsx`, including the 2 new targeted additions this ticket
  authorized: edited-value-reaches-`createLog`, and the empty-result
  render + blank-name save-guard case).
- Coverage: **98.65% statements / 92.1% branches / 98.17% functions / 99.6%
  lines** overall. `log.tsx` itself: 98.5%/88.14%/97.22%/98.95% (2
  uncovered lines: 650, 653).

## Named residual risks (do not let this read as "solved")

1. **CLIP's non-food-confidently-wrong failure mode is unchanged at the
   model layer.** Per the CLIP spike: 2 of 4 non-food test photos
   (dog, cat) scored a specific wrong food label ("a photo of waffles") at
   confidence levels indistinguishable from genuinely correct predictions
   elsewhere in the same run. This ticket's `anchorNearTop` logic (Step 3)
   catches the case where an anchor happens to land in the top 3 results —
   this covers the dog photo (its anchor landed at position 2, 0.394,
   caught and forced to low confidence with a caveat; verified by a named
   regression test using these exact numbers). It does **not** fix the case
   where an anchor scores too low to appear in the top 3 at all while a
   wrong food label wins outright (the cat case: its top-2 was another food
   label, "pancakes," not an anchor at all). The confirm screen is what
   actually protects the user against that remaining gap — the model
   itself was not made more accurate or better at self-certifying "none of
   these."
2. **The CLIP spike's own recommendation was deliberately overridden.**
   The spike explicitly recommended NOT proceeding straight to an
   implementation plan, naming three unexplored alternatives (better anchor
   prompt engineering, a larger CLIP variant, a two-stage binary food/
   non-food gate) as things to try first. This plan overrode that
   recommendation on product grounds — the pre-existing confirm-before-log
   screen changes the cost of a wrong guess from "silent data corruption"
   to "one edit before saving," a mitigation the spike's own analysis
   didn't have visibility into. This override is real and intentional, not
   an oversight, and none of the spike's three alternatives were
   implemented here.
3. **An unlisted food not in `CANDIDATE_LABELS` can still produce a
   plausible-looking WRONG name and WRONG macros, prefilled.** The 36-food
   candidate list is finite and developer-maintained; a real food the user
   photographs that isn't on the list will always score against the
   *closest* label on the list (the CLIP spike's own "roasted vegetables"
   vs. "grilled chicken breast" confusion, at 56.6%, is exactly this
   failure mode) — the model has no way to say "this looks like a food I
   simply don't have a label for." The confirm screen only helps if the
   user actually notices the suggested name/macros are wrong before tapping
   Save — this is a real, standing risk of the whole design, not a closed
   gap, and is unaffected by anything built in this ticket.
4. **The "91.7% vs 67%" comparison, if cited elsewhere, carries the same
   qualifications the spike itself stated**: different (re-sourced, not
   byte-identical) photos than the earlier Food-101 spike, and a small
   n=12 in-vocabulary sample. Repeating that comparison without these
   caveats would overstate what was actually measured.
5. **Nutrition-reference data is not a live USDA API pull** (see item 2 in
   "What was built" above) — it is manually-set, one-standard-serving
   estimates cross-checked against typical values, not fetched
   programmatically from FoodData Central. A future ticket wanting
   FDC-sourced precision would need an API key and per-dish serving-size
   judgment calls this build did not make in an automated way.
6. **No real device/browser session verification** — see "What could NOT
   be verified" above. The mechanism is code-reviewed and unit/component-
   tested, not watched working end-to-end by a human or a driven browser.

## Non-goals confirmed unchanged

- `POST /food/analyze-text` — still calls `analyzeFoodText` (Claude), no
  changes to that path or its tests.
- Backend hosting/deployment — untouched, pre-existing gap.
- Multi-item meal recognition — still a single-label classifier limitation,
  not addressed.
- `log.tsx`'s review screen structure/state machine — no new `Step` value,
  no new screen; only the four targeted deltas listed above.
- `anthropic.js`'s `analyzeFoodPhoto` — left in place, marked superseded,
  not deleted.
