# CTO verdict — Ticket 011: True on-device food recognition (web)

Reviewer: CTO gate (Opus), independent re-verification
Branch: `foxbite-food-recognition-web-on-device` (based on `main` @ `0ff6f71`)
Date: 2026-08-16

Inputs reviewed: [ticket 011](../tickets/011-true-on-device-food-recognition.md) ·
[plan](../plans/true-on-device-food-recognition-plan.md) ·
[outcome](../outcomes/food-recognition-web-on-device-outcome.md) ·
the actual working-tree diff against `main`

## Verdict

# ✅ MERGE

Ticket 011 delivers what it scoped, the safety-critical invariants hold in the
shipped code (verified by mutation, not by reading), and every number the
outcome doc claims reproduced within rounding. The prior gates' one real bug
(N2) was fixed correctly and the fix is mutation-proven. I found **six new
non-blocking findings** that prior reviewers missed — one of which (C1) I
recommend fixing before or immediately after merge because it is a three-line
test guarding the most common user state in the product. None of the six is
blocking.

**Merge recommendation with one condition I'd call cheap-and-strongly-advised
rather than blocking**: add the `status: 'trialing'` test described in C1. It
closes the only mutation gap in this ticket's *new* code.

---

## 1. Scope vs. plan and ticket acceptance criteria

All 5 scope items shipped. Plan Steps 0–6 all landed. Assessment per
acceptance criterion:

| Acceptance criterion | Status | My verification |
|---|---|---|
| Web `pickAndAnalyze()` runs CLIP in-browser, zero `/food/analyze` call | ✅ met, partially by proxy | Code path verified directly: `log.tsx:108` calls `classifyFoodPhoto(prepared)`; the web twin never touches `api.analyzePhoto`. Live verification proved the CDN script executes inside the real Metro bundle and that the backend logged zero requests. Not driven through the real Log-tab UI (see §5, carryover). |
| Expired-trial web user still blocked | ⚠️ met in code + unit tests, **not** against a live account | `assertActiveAccess()` verified fail-closed and per-scan (§4). Disclosed honestly in the outcome doc. Carryover risk, accepted — same class of gap ticket 010 shipped with. |
| `foodName` only from nutrition data or empty | ✅ met, mutation-proven | §3 below. 4/4 provenance mutants killed. |
| Every non-anchor label has a nutrition row | ✅ met | Invariant ported as a real test (`food-candidate-labels.test.ts`) plus two more the backend didn't have (anchors must *not* have rows; prompt uniqueness). Independently re-derived outside Jest: 36 non-anchor labels, 36 rows, zero missing, zero orphans, zero anchors-with-rows. |
| Mobile photo-scan behavior completely unchanged | ✅ met, by construction | `food-recognition.ts` is a 2-line unconditional passthrough. Zero `Platform.OS` added to `log.tsx` (only pre-existing lines 658/660, inside `TrialEndedPaywall.subscribe()`'s checkout redirect). No backend file touched. |
| Cold-start + download size measured on the real bundled app, with a visible loading state | ✅ met | Real numbers recorded (~17.2s / ~18.2s total cold, 153,701,182 bytes). Progress UI is wired and unit-tested; see C6 for a quality caveat on the percentage itself. |
| New frontend tests pass, `.web.ts` genuinely exercised | ✅ met | `food-recognition.web.test.ts` imports `../food-recognition.web` by explicit path with `@jest-environment jsdom`. Confirmed the platform-resolution trap was correctly handled, not stumbled into. |
| Outcome doc restates ticket 010's residual risks unchanged | ✅ met | All three restated verbatim in substance, with the correct framing that this ticket only changes *where* the model executes. |

**Scope discipline**: excellent. The `log.tsx` diff is 6 hunks, all additive
except the single `api.analyzePhoto` → `classifyFoodPhoto` substitution and the
loading-text ternary. `image-prep.ts`'s diff is comments, one log string, and
one variable rename (`isGuaranteedBackendFailure` →
`isGuaranteedDownstreamFailure`) — zero logic change, correctly matching scope
item 5. Nothing crept in.

## 2. Numbers I independently reproduced

| Metric | Outcome doc claims | I measured | Match |
|---|---|---|---|
| Jest suites | 43 | **43 passed** | ✅ |
| Jest tests | 363 (→364 after the N2 regression test) | **364 passed, 0 failed** (21.7s) | ✅ |
| `tsc --noEmit` errors | 3 pre-existing | **exactly 3**: `animated-icon.tsx(150,5)`, `app-tabs.web.tsx(72,15)`, `ui/collapsible.tsx(22,13)` | ✅ all unrelated to this ticket |
| Candidate labels ported | 36 food + 3 anchors | **39 total, 3 anchors, semantically identical to `backend/src/lib/food-candidate-labels.js`** | ✅ |
| Nutrition rows ported | 36 | **36, semantically identical to `backend/src/data/food-nutrition-data.js`** | ✅ |

On the data ports I did not eyeball them — I parsed both the TS and the JS
array literals, key-sorted every object, and compared serialized forms. They
are identical field-for-field and order-for-order. I also confirmed the backend
seeds its SQLite `food_nutrition_reference` table from that same generated
constant (`backend/src/db/index.js:101`), so the app's ported `Map` and the
backend's SQL table are provably the same data, not two drifting copies of an
idea.

**Dependency-leakage check (criterion 5 of my brief): clean.**
`@huggingface/transformers` appears in `app/` only as (a) prose in comments and
(b) one `import` statement *inside a JS template string* in `+html.tsx` that is
injected as raw HTML. There is no `import`/`require` of it anywhere in the
TS/JS module graph, and it is absent from `app/package.json` — so
`onnxruntime-node` and `sharp` never enter the app's install graph, including a
future EAS build. This is the single most consequential architectural decision
in the ticket and it was implemented correctly.

## 3. Safety-invariant verification: `foodName` provenance

The invariant holds. `food-recognition-shared.ts:106` sources `foodName` from
`nutrition.foodName` only, where `nutrition` comes from
`lookupNutritionByLabel(matched.key)` — keyed on the candidate label's `key`,
never on `top.label` (the raw model prompt). Both the no-food and
no-nutrition-data escape hatches return frozen constants with `foodName: ''`.
Structurally identical to `backend/src/lib/local-food-analysis.js:88–99`.

I did not take that on inspection. I confirmed there is no reachable path to a
non-table `foodName` by mutating four of them and watching the suite go red
(M1–M4, §7). I also confirmed independently that no `foodName` value in the
ported table collides with any raw prompt string, so even a hypothetical
provenance confusion could not produce a prompt-shaped name by coincidence.

## 4. Client-side billing pre-check

Verified against all four properties in my brief:

- **Fail-closed** — ✅. `assertActiveAccess()` wraps `getBillingStatus()` in
  `try`/`catch`; the `catch` **throws** rather than returning, so a network
  failure cannot reach the classifier. Proven by mutation M15: replacing the
  throw with `return` (fail-open) turns the suite red.
- **Per-scan, not cached** — ✅. The call sits inside `classifyFoodPhoto()`
  with no memoization. Proven by M21: introducing a module-level `__cachedOk`
  short-circuit fails 3 tests.
- **Matches `status === 'expired'` exactly** — ✅ literal match, and it agrees
  with `requireActiveAccess` at `backend/src/routes/food.js:102`, which I read
  directly rather than trusting the plan's citation.
- **Reuses the existing 402 path** — ✅ and this is genuinely elegant. The
  pre-check throws `ApiError(402, ..., { error, billing })` — byte-compatible
  with the backend's real 402 body — so `log.tsx:114–119`'s existing paywall
  branch handles it with **zero modification**. I verified that branch is
  untouched in the diff. M19 (402→403) and M20 (drop the `billing` payload)
  both fail, so the shape compatibility is actually tested, not incidental.

The gate is client-side and bypassable by a modified client. That is disclosed
plainly in the ticket, the plan, the code comment, and the outcome doc. I
consider that adequate and correctly reasoned: the alternative (no gate) makes
a paid feature free, and the honest framing is present at every layer.

## 5. Test adequacy — my own mutation results

Baseline for the mutation run: the 6 relevant suites, **92 tests, all green**.
I applied 24 hand-written mutations to `food-recognition-shared.ts` and
`food-recognition.web.ts`, running the suites after each and restoring the file
(md5-verified restored afterwards).

**Result: 21/24 killed.** The three survivors:

### C1 — NEW, non-blocking, **recommended fix**: no test covers `status: 'trialing'`
Mutating `billing.status === 'expired'` to `billing.status !== 'active'`
**leaves the suite fully green**. That mutation would block *every user in
their 30-day free trial* from scanning a photo — `trialing` is the default
state of every newly signed-up user, i.e. the single most common state in the
product. `food-recognition.web.test.ts` only ever mocks `'active'` and
`'expired'`; nothing in the repo covers `'trialing'` against this new gate
(`companion.test.tsx` uses it, but for the unrelated trial banner).

This is the only mutation gap in code that ticket 011 *newly wrote*. The fix is
one test asserting a `trialing` user reaches the classifier. I'd take it now;
it is minutes of work guarding a total-feature-outage class of regression.

### C2 — NEW, non-blocking, **inherited from ticket 010, not a regression here**
Two confidence-threshold mutants survive:
- `HIGH_CONFIDENCE_MARGIN = 0.4` → `0.5` survives. The test named
  `'margin >= 0.4 -> high'` uses scores `0.9`/`0.4`, i.e. a margin of exactly
  **0.5** — it never exercises the 0.4 boundary it is named for.
- `margin >= MEDIUM_CONFIDENCE_MARGIN` → `margin > ...` survives. The test
  named `'margin exactly at the 0.15 medium boundary -> medium'` uses
  `0.5`/`0.35`, and in IEEE-754 `0.5 - 0.35 === 0.15000000000000002` — strictly
  greater than 0.15. **The test that exists specifically to pin the boundary
  does not touch the boundary.**

Critically, I checked `backend/test/local-food-analysis.test.js` and it uses
**the identical score values** (`0.9`/`0.4`, `0.5`/`0.35`). So this is a
faithful port of a pre-existing test weakness, not something ticket 011
introduced — and it affects the shipped backend equally. Ticket 011 was asked
to port these tests directly and it did exactly that. Correct call for this
ticket; worth a small follow-up ticket to fix both copies (use integer-safe
score pairs, e.g. `0.55`/`0.15` for high and `0.5`/`0.34`+`0.5`/`0.35` pairs
chosen to land exactly on the constant).

### Everything else was killed
Including all four `foodName`-provenance mutants (M1–M4), all five
anchor-in-top-K mutants (M5–M9 — the top-K window, the off-by-one to K=2, the
top-1 short-circuit, and the confidence downgrade are all genuinely tested),
the `lookupNutritionByLabel(top.label)` provenance-confusion mutant (M14, 8
failures), the `hypothesis_template` double-wrapping regression (M24), and
**both N2 regressions** (M22: moving `getClassifier()` back outside the `try`;
M23: removing the `ApiError` re-throw guard). The anchor-in-top-K logic and the
billing gate are, with the C1 exception, genuinely well covered — a green test
here is now evidence of something.

## 6. Assessment of the orchestrator's three pre-CTO fixes

- **N2 code fix** (`getClassifier()` moved inside `try` + `if (err instanceof
  api.ApiError) throw err;` guard) — **correct and sufficient.** The guard is
  the right shape: it preserves the more specific "model failed to load"
  message for the never-initialized case while letting a rejected
  `__foxbiteClipPipelineReady` promise fall through to the generic
  "Could not classify this photo" wrap. Both behaviors are now pinned by
  tests, and I verified by mutation that removing either half of the fix turns
  the suite red. This was a real bug (a user whose model download failed would
  have been told the server was unreachable, for a call that never touched a
  server) and it is properly fixed.
- **N3 doc fix** — **accurate.** I confirmed `log.test.tsx` now does
  `jest.mock('@/lib/food-recognition', ...)`, so that file no longer proves
  mobile-unchanged on its own; and I confirmed `food-recognition.test.ts` is a
  real, unmocked test of the native twin that does. The corrected outcome-doc
  wording matches the code.
- **N4a doc fix** — **accurate and the right instinct.** "No credentials
  reachable without an interactive OTP-relay session" is the true statement;
  "no credentials exist" was false and would have misled a future reader into
  thinking live paywall verification is impossible rather than merely
  unavailable to a non-interactive step. This distinction matters because it
  keeps the §5 carryover gap *closeable*.

**Leaving N1 / N4b / N4c / N4d unfixed is reasonable.** See §7 on N1 — it is
genuinely not a small fix and deferring it to a scoped ticket is the right
call, not procrastination. N4b/c/d are cosmetic (a MiB-vs-MB label, a dangling
cross-reference, a dead global). I'd fold the N4 remainder into the same
follow-up as C2/C5/C6 rather than churn the branch now.

## 7. Risk assessment

### CDN supply chain (N1, deferred) — accepted, but re-scope the fix
`+html.tsx` loads `@huggingface/transformers@4.2.0` from `cdn.jsdelivr.net`
with an exact version pin and **no SRI**. A jsDelivr compromise would execute
attacker JS in every web user's authenticated session. The version pin is a
meaningful mitigation (it removes the "silent upgrade" vector), and the
residual risk is disclosed in the code comment and the plan.

**New observation the prior gates didn't record**: "add SRI" is *not* a
one-line fix here, and a future ticket scoped that way will fail. `integrity`
on a `<script type="module">` covers only the entry module; transformers.js
then lazily fetches its own chunks **and the ONNX Runtime WASM binaries** from
the CDN at runtime, and those sub-resources are unreachable by that attribute.
The realistic mitigations are (a) self-host the library and its WASM assets
from FoxBite's own origin, or (b) a `Content-Security-Policy` pinning
`script-src`/`wasm-src` to an explicit allowlist — ideally both. Whoever picks
up N1 should scope it that way. Recording this now so the follow-up isn't
mis-estimated as trivial.

Note also that the model weights already stream from `huggingface.co` at
runtime under any loading strategy, so the CDN decision adds a *second*
third-party runtime origin rather than a first one. That framing in the plan is
accurate.

### npm-audit-style risk — not applicable, and that's the point
This ticket adds **zero** npm dependencies to `app/package.json`. The
supply-chain surface moved from the install graph to the runtime origin. That's
a real trade, not an elimination — but for the specific goal of keeping
`onnxruntime-node`/`sharp` out of a mobile EAS build, it is the only approach
that actually works, and the plan reasoned about the two axes (bundle scoping
vs. install scoping) correctly.

### No live-account paywall UI test (carryover) — accepted
Two acceptance criteria are verified at the unit/integration level but not
through a signed-in browser session: the expired-trial block and the
progress-UI render. Honestly disclosed. Mitigating factors: the 402 path reuses
`log.tsx`'s **existing, already-live** paywall branch that mobile exercises in
production today, the ApiError shape compatibility is mutation-tested, and the
gate is client-side (so its worst failure mode is a revenue leak on a
bypassable gate, not user data harm). Since N4a establishes that an OTP-relay
session *is* available when a human is present, I'd recommend closing this in
one interactive session covering tickets 010 + 011 + 012 together rather than
blocking this merge on it.

### Residual model risks — unchanged and correctly framed
CLIP's confidently-wrong-on-non-food failure mode and the finite 36-food
candidate list are unchanged by this ticket, restated accurately, and still
mitigated only by the mandatory confirm-before-log screen. That screen is
untouched here — I verified nothing from `setResult(...)` onward changed. The
outcome doc's claim that this ticket changes only *where* the model executes is
true.

### Further new findings (all non-blocking)

- **C3 — undocumented sortedness precondition, and it's a trap for ticket 012.**
  `analyzeFoodClassification()` reads `results[0]`/`results[1]` and slices the
  top 3, assuming descending score order. It never sorts defensively. Safe
  today (transformers.js returns sorted output on both web and the backend, and
  the backend has the same assumption, documented at
  `local-food-recognition.js:61`). But `food-recognition-shared.ts`'s own
  header explicitly invites ticket 012 to reuse this file "unmodified" with
  "a comparable `{label, score}[]` array" — and a raw cosine-similarity
  mobile runtime may well produce candidate order, not score order. That would
  silently corrupt every result with no test failing. **Recommend: add a
  defensive sort (or an explicit precondition comment) and note it in ticket
  012.** Cheap insurance against a nasty silent bug.
- **C4 — unhandled promise rejection at page load on model-load failure.**
  `+html.tsx`'s `.catch()` re-throws, so `window.__foxbiteClipPipelineReady` is
  a rejected promise with no attached handler until the user's first scan. On
  any model-load failure the browser fires `unhandledrejection` — console noise
  now, and it would become spurious error-reporter volume if FoxBite ever adds
  one. Overlaps N4d. Fix is a no-op `.catch(() => {})` on a separate branch of
  the chain.
- **C5 — `window.__foxbiteClipPipeline` is dead code.** Set by `+html.tsx`,
  declared in the `Window` interface, cleared in test setup, and **never read**
  by any module. Confirmed by grep. Overlaps N4c. Delete it or document it as a
  deliberate debugging affordance.
- **C6 — the progress percentage is per-file, not aggregate.**
  transformers.js's `progress_callback` reports progress per downloaded file,
  and this model pulls several (config, tokenizer, ONNX weights). The UI
  renders whatever the latest tick says, so during a real cold load the
  "(NN%)" will climb and **reset repeatedly**, non-monotonically. Strictly
  better than a bare unlabeled spinner (which is what the criterion asked
  for, and it is met), but a resetting percentage reads as broken to some
  users. Also: `translateProgressDetail` can emit `{status: 'error'}`, and
  `log.tsx`'s ternary only special-cases `'downloading'`, so a model-load
  error silently falls back to "Foxxy is sniffing out the details…" while the
  scan is doomed. Neither is a correctness bug in the scan path (the thrown
  `ApiError` still surfaces the right message), so: follow-up, not blocker.

## 8. Code quality

High, and notably above average for this pipeline on two counts.

**Strengths.** The platform split follows the existing
`settings-db.ts`/`settings-db.web.ts` precedent instead of inventing a
`Platform.OS` branch, which makes "mobile is unchanged" a property of the file
system rather than a claim needing audit — and it makes ticket 012 a
single-file change. Reusing the backend's exact `ApiError(402, ...)` shape to
drive the existing paywall branch is the kind of change that removes work
instead of adding it. The comment density is unusually high but earns its
place: nearly every non-obvious line explains *why* (the CDN-vs-npm reasoning,
the Jest dynamic-import limitation, the `hypothesis_template` gotcha, the
`blob:` URL provenance traced to `expo-image-manipulator`'s actual source).
That is institutional memory, not noise, and it is what let me verify claims
quickly.

**Nits.** `getClassifier()` throws `ApiError` with `status: 0`, overloading an
HTTP-status field for a non-HTTP condition — pre-existing convention in this
codebase, so consistent rather than wrong. The `FoodAnalysisResult` type in
`food-recognition-shared.ts` duplicates `api.FoodAnalysis`'s shape structurally
rather than referencing it; deliberate (keeps the shared module dependency-free
for ticket 012) but it means a future field addition must be made twice, and
nothing would catch the omission. Worth a comment at minimum.

## 9. Summary of findings

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| C1 | Non-blocking, **recommended now** | No test covers `status: 'trialing'`; a `!== 'active'` mutation survives green and would block all trial users | Fix (3 lines) |
| C2 | Non-blocking, inherited | Both confidence-threshold "boundary" tests don't touch their boundaries (float + wrong score pair); identical defect in the backend | Follow-up ticket, both copies |
| C3 | Non-blocking | Sortedness precondition undocumented and unsorted; a live trap for ticket 012's reuse | Follow-up + note in ticket 012 |
| C4 | Non-blocking | Unhandled rejection at page load on model-load failure | Follow-up (overlaps N4d) |
| C5 | Non-blocking | `__foxbiteClipPipeline` global is dead code | Follow-up (overlaps N4c) |
| C6 | Non-blocking | Progress % is per-file/non-monotonic; `'error'` progress state not surfaced in UI | Follow-up |
| N1 | Non-blocking, deferred | CDN supply chain, no SRI — **and SRI alone cannot fix it** (see §7) | Deferred ticket, re-scoped to self-hosting or CSP |
| N2 | **Fixed** | `getClassifier()` outside `try` | Verified fixed + mutation-proven |
| N3, N4a | **Fixed** | Doc accuracy | Verified accurate |
| N4b/c/d | Non-blocking | Doc/code nits | Fold into the C-series follow-up |

## 10. Rationale for MERGE

The ticket does what it said, on the scope it said, and nothing else. Its two
load-bearing architectural decisions — CDN loading to keep native binaries out
of the install graph, and filename-based platform resolution to keep mobile
provably untouched — are both correct and both better than the obvious
alternatives. The safety invariant that matters most (`foodName` provenance)
holds under adversarial mutation, not merely under reading. The paywall gap
that the plan review surfaced was real, was fixed, and the fix is fail-closed,
per-scan, and exactly aligned with the server's own check. Test coverage is
genuine: 21 of 24 mutations die, including every provenance and anchor mutant
and both N2 regressions.

The three residual risks I'd want a reader to remember are all disclosed rather
than discovered: the CDN origin, the client-side bypassability of the billing
gate, and the absence of a live signed-in paywall test. None of them is made
worse by merging, and the third is closeable in one interactive OTP-relay
session that should cover tickets 010–012 together.

C1 is the one finding I'd rather see fixed than filed — not because it is
dangerous today, but because it is three lines and it guards the state every
new user is in. Everything else belongs in a single tidy-up follow-up ticket
alongside the N4 remainder.

**Merge.** Commit and merge remain the user's call, per this project's
standing practice; nothing in this review was committed or merged.
