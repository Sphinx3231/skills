# CTO Verdict: User Settings & Wardrobe Customization

Ticket: `docs/tickets/003-user-settings-wardrobe.md`
Plan: [docs/plans/user-settings-plan.md](../plans/user-settings-plan.md)
Outcome: [docs/outcomes/user-settings-outcome.md](./user-settings-outcome.md)
Branch: `foxbite-user-settings` (fully uncommitted, `main` untouched)
Reviewed: 2026-08-08

## Decision: **MERGE**

Approved to merge, with three doc-accuracy corrections and two follow-up
tickets recommended (details in the Conditions section). None of the
findings are behavioral; no code change is required to merge.

## Independence caveat (read this first)

This account is on the Pro plan with no Fable access, so **Opus stands in as
CTO — and the tech-lead review immediately before this gate was also Opus.**
The gated-build pipeline's intent is that the CTO gate is a *different* model
from the tech lead, and that property does not hold here. Correlated blind
spots between the two gates are therefore possible, and this verdict is
weaker evidence than a true cross-model review would be.

To compensate, everything below was **re-derived from the plan, the code and
my own test runs**, not accepted from the outcome doc or the tech-lead
conclusions. Where a prior conclusion was checked, it is marked
"independently confirmed." Two findings below were *missed* by the tech-lead
pass and found here, which is at least weak evidence the re-derivation was
genuine rather than a rubber stamp.

No `.specify/memory/constitution.md` (or any `.specify/` directory) exists in
this repo, consistent with prior tickets this session. The diff was therefore
evaluated against the project's own established conventions: `CLAUDE.md`,
`app/AGENTS.md` (Expo SDK 54), and the existing route / schema / hook
patterns in `backend/src/routes/*.js`, `backend/src/db/index.js` and
`app/src/hooks/*`.

## 1. Scope vs plan

Every acceptance criterion in the plan was checked against the actual code
and tests. Result: **13 of 14 fully met, 1 partially met.**

| Acceptance criterion | Status | Evidence |
|---|---|---|
| GET returns defaults for a fresh user / prior values otherwise | Met | `user.test.js:25,46` — full `deepStrictEqual` on all 11 fields, not a spot check |
| PATCH updates only fields present in body | Met | `user.test.js:59` — two sequential single-field PATCHes, each asserting the *other* field survives |
| PATCH rejects negative / non-finite numerics before any write | Met | `user.test.js:74,85`; validation is genuinely pre-write (`user.js:56-104` collects errors and returns 400 at line 102, before the first `UPDATE` at line 107) |
| PATCH rejects invalid `themeMode`/`motionSetting`/`macroUnit` | Met | `user.test.js:93,100,107` |
| Reject-on-change vs accept-on-no-op for locked equip slots, **two separate tests** | Met | Verified by mutation testing — see §3 |
| `dailyCalorieGoal` writes through to `users.daily_calorie_goal`, proven by direct DB read | Met | `user.test.js:164` asserts response body *and* then `SELECT daily_calorie_goal FROM users` directly. Real read-back, not response-body trust |
| Calorie-goal change moves Dashboard mood on the next render, no round-trip | Met | `index.tsx:69` now reads `settings.dailyCalorieGoal`; `index.test.tsx` adds "a settings-context goal change updates Foxxy's idle mood on the next render with no refetch" and "reads the calorie goal from settings context, not from the summary API response" |
| Theme change reaches all 6 files, **proven by tests on each** | **Partially met** | 5 of 6 have real tests; `_layout.tsx` has none — see below |
| `force_reduced_motion` / `full_animations` / `system_default` behavior | Met | `use-reduce-motion.test.ts` — 6 tests including `force_reduced_motion wins even if the reduceMotionChanged event later reports false`, which is the case a naive implementation gets wrong |
| Unequip hides overlay on Companion + Dashboard without touching unlocked status; re-equip restores | Met | `companion.test.tsx` adds 5 targeted tests incl. "unequipping an unlocked item hides its wardrobe overlay everywhere it renders, without affecting unlocked status" |
| Settings persist across restart via local cache, no default-then-correct flash | Met as far as this environment allows | `settings-context.test.tsx:74` asserts the cached `themeMode` is present on **first render** with the GET deliberately never resolving. Real-device paint timing is honestly disclosed as unverifiable in the outcome doc |
| Failed PATCH does not silently lose the change | Met, and exceeded | See §4 |
| Coverage at/above 90% everywhere and no regression vs baseline | Met | See §2 |
| `tsc --noEmit`: no new errors | Met | See §2 |

### The one partial: `_layout.tsx` has no test

The plan required the theme fix be "proven by tests on each" of the 6 files.
Reality:

- `use-color-scheme.ts` — 4 tests, genuinely rewritten (the old version only
  asserted "returns a scheme value" and would have passed with the override
  entirely absent; the new version pins all three `themeMode` branches).
- `use-color-scheme.web.ts` — 4 tests, imports `../use-color-scheme.web`
  **explicitly**, which is the only way to exercise the web twin since
  jest-expo resolves the bare specifier to the native file. Correct and
  non-obvious.
- `use-theme.ts` — independently confirmed it needs no change: it imports
  `useColorScheme` from `@/hooks/use-color-scheme` (not React Native), so it
  inherits the fix. 100% covered.
- `app-tabs.tsx` / `app-tabs.web.tsx` — new dedicated test files asserting
  the tab-bar background resolves to `#ffffff` vs `#000000` per `themeMode`.
- `_layout.tsx` — **no test exists.** It is excluded from
  `collectCoverageFrom` in `app/package.json`, and there is no
  `src/app/__tests__/_layout.test.tsx`.

I verified the exclusion is **pre-existing, not added to hide this work**:
`git diff -- app/package.json` shows only the `expo-sqlite` dependency line.
The same exclusion covers `app-tabs.*` and `use-color-scheme.ts` too — all
three still received real tests here even though their coverage isn't
reported, which is the opposite of gaming the metric.

**The `ThemedApp` split is nonetheless correct**, verified by reading rather
than by test. The tech lead called this out as "a real catch" and that
assessment is independently confirmed: `TabLayout` (the default export) now
mounts `<SettingsProvider>` and renders `<ThemedApp>` as its child;
`ThemedApp` is where `useColorScheme()` is called. Because `ThemedApp` is
rendered *beneath* the provider, its `useContext(SettingsContext)` resolves
to the real value. Had `useColorScheme()` stayed in the component that mounts
the provider, `useContext` would have returned `null` and — because
`useUserSettings()` deliberately falls back to `defaultContextValue` instead
of throwing — it would have silently read `themeMode: 'woodland_dusk'`
forever with no error anywhere. That failure mode is real, silent, and this
split genuinely prevents it. The fallback-instead-of-throw design is what
makes the bug silent, so the split is load-bearing precisely because of it.

I am accepting this as non-blocking: the root layout is untestable under this
project's existing config by pre-existing convention, the split's correctness
is structurally evident from 15 lines of code, and the *consequence* of the
split (theme resolving from the override) is covered by 8 tests on the hooks
it feeds. The residual risk is regression, not current breakage — someone
later inlining `ThemedApp` back into `TabLayout` would break theming with no
test going red. That is worth a follow-up, not a block.

### Deviations from the spec

All four spec deviations are pre-declared in the plan, and I agree with each:
`expo-sqlite` over `better-sqlite3` (the spec's literal ask is impossible in
React Native — `better-sqlite3` is a Node native addon); 4 independent
wardrobe slots rather than merging hat+crown (matches `STREAK_UNLOCKS`);
`woodland_dusk` as a rename of the light palette; and flat `/user/settings`
rather than `/api/v1/...` (every sibling route is unversioned — introducing a
version prefix for one route would be worse than the deviation). The first
three were confirmed with the user before planning, which is the right gate
for decisions of that size. No new undeclared deviations were introduced
during the build, with one arguable exception noted in §5.

### Small scope gap: `macroUnit` is stored but inert

The grams/percentage toggle persists correctly and round-trips, but nothing
reads `macroUnit` to actually change any displayed unit — not `goals.tsx`
(inputs are always labeled `g`) and not `index.tsx`. The plan's wording
("grams by default per `macroUnit`, plus the grams/percentage toggle") is
ambiguous enough that this is defensible, and **no acceptance criterion
covers it**, so it does not block. But a user who taps "Percentage" today
sees nothing change, which will read as a bug. Recommend the follow-up ticket
either wire it up or hide the toggle.

## 2. Independent test re-runs

All three commands re-run by me from scratch. Backend was run via the plain
`npm run test:coverage` script with **no manually exported `DB_PATH`**, per
the outcome doc's documented trap (each test file sets
`process.env.DB_PATH = ":memory:"` itself; forcing it via the shell
suppresses `db/index.js`'s real-file-path branch in every file at once and
produces falsely low aggregate numbers — an ESM import-hoisting artifact).

| Metric | Claimed | My run | Verdict |
|---|---|---|---|
| Backend tests | 94/94 | **94 pass, 0 fail** | Confirmed |
| Backend coverage | 99.25 / 96.63 / 100 | **99.25 lines / 96.63 branch / 100 funcs** | Exact match |
| Backend baseline | 99.05 / 96.40 / 100 | above on lines + branch, equal on funcs | No regression |
| `user.js` alone | 100 / 97.44 / 100 | **100 / 97.44 / 100** | Confirmed |
| Frontend tests | 292/292, 33 suites | **292 passed, 33 suites** | Confirmed |
| Frontend coverage | ~98.5 / 91.7 / 98 / 99.6 | **98.53 stmts / 91.71 branch / 98.05 funcs / 99.56 lines** | Exact match |
| Frontend baseline | 98.16 / 90.30 / 98 / 99.45 | above on all four | No regression, all metrics >90% |
| New settings screens | 100 across the board | `app/settings` **100/100/100/100** (all 4) | Confirmed |
| `companion.tsx` | 100/100/100/100 | **100/100/100/100** | Confirmed |
| `tsc --noEmit` | exactly 3 pre-existing | **exactly 3**, byte-identical to the outcome doc's list (`animated-icon.tsx(150,5)`, `app-tabs.web.tsx(72,15)`, `collapsible.tsx(22,13)`) | Confirmed |

Remaining uncovered lines are all pre-existing and in files this ticket
didn't touch (`food.js:307-312`, `log.tsx`, `sign-in.tsx`, `theme.ts:115`,
`external-link.tsx:14`) plus `index.tsx:183-185,255`, which predate this
work. Independently confirmed against the file list.

## 3. My own mutation tests (independence proof)

The single most important thing to verify here was the reject-vs-no-op equip
distinction, because two similarly-named tests asserting the *same* thing
would be indistinguishable from two tests asserting different things by
reading alone. So I broke it in both directions.

**Reading first.** The two tests do set up genuinely different DB
preconditions, not just different names:

- `user.test.js:114` (reject-on-change) explicitly runs
  `UPDATE user_settings SET equipped_scarf = 0` before the PATCH, so the
  request is a real `false -> true` transition on a locked slot.
- `user.test.js:126` (accept-no-op) uses a **fresh** row where
  `equipped_scarf` is still the schema default `1`, so the PATCH is a
  redundant re-send.

**Mutation 1** — neutered the no-op allowance in `backend/src/routes/user.js`
by replacing `const currentlyTrue = !!existingRow[column];` with
`const currentlyTrue = false;` (i.e. always reject a locked `true`):

```
✖ PATCH /user/settings accepts a no-op resend of the default-true value for a locked slot
ℹ pass 15  ℹ fail 1
```

**Mutation 2** — the inverse, `const currentlyTrue = true;` (i.e. never
reject):

```
✖ PATCH /user/settings rejects equippedScarf: true for an unlocked-but-not-yet-earned slot (reject-on-change)
ℹ pass 15  ℹ fail 1
```

Each mutation killed **exactly one, different** test. That is conclusive: the
two tests genuinely discriminate the two states, and neither is a
differently-named duplicate. Restored; `diff` against my pre-mutation backup
reports identical, and 16/16 pass again.

**Mutation 3** — frontend, on the theme resolution in the file that was
missed in the first plan draft. Deleted the `if (settings.themeMode ===
'dark') return 'dark';` line from `app/src/hooks/use-color-scheme.web.ts`:
`1 failed, 3 passed`. Restored; 4/4 pass. So the rewritten web test really
does pin the override rather than passing incidentally — which was the
specific failure mode ("still passing by accident") the plan warned about.

**Extra verification I added beyond the brief.** The `expo-sqlite` manual
mock (`app/__mocks__/expo-sqlite.js`) is a hand-rolled fake that
pattern-matches on SQL substrings — it is explicitly "not a general SQL
engine." That means `settings-db.ts`'s actual SQL (the `CHECK (id = 1)`
constraint and the 12-column `ON CONFLICT(id) DO UPDATE SET ... excluded.*`
upsert) is **never executed by any test**, so `settings-db.ts`'s reported
100% coverage proves the JS wrapper, not the SQL. A syntax error or a wrong
`excluded.` reference would have shipped silently and only surfaced on
device. I closed that gap myself by extracting the exact DDL and upsert and
running them against a real SQLite engine via the backend's `better-sqlite3`:
insert path, upsert-over-existing-row path, and the `markCacheSynced` update
all behave correctly and return the expected row. **The client cache SQL is
valid.** Recommending this be turned into a permanent test (§5).

## 4. Code quality

Genuinely good, and consistent with this repo's conventions.

**Backend.** `user.js` follows the existing flat-router shape
(`Router()` + `router.use(requireAuth)`), matching `companion.js`/`food.js`.
Validation is `Number.isFinite`-based, mirroring `food.js`'s existing style,
and accumulates *all* errors before returning a single 400 — better than
fail-first, and correctly ordered before any write. The `EQUIP_FIELDS`
table centralizing slot → column → item id in one place is the right call:
it makes GET, PATCH and the unlock cross-check structurally unable to drift,
which is exactly the failure class this project's tickets have repeatedly had
to catch. `user_settings` follows `companion_state`'s 1-row-per-user pattern
exactly, and `getOrCreateUser` provisions it the same way — so no backfill
migration is needed, correctly reasoned in the plan.

**Security/authorization** — checked deliberately: every query is keyed on
`req.userId` from `requireAuth`; there is no client-supplied user id anywhere
and therefore no cross-tenant read/write path. All values are parameterized;
the only interpolated SQL is `columnUpdates.join(", ")`, whose contents come
exclusively from the hardcoded `settingsFieldToColumn` map and
`EQUIP_FIELDS`, never from request keys — no injection surface. The
server-side unlock cross-check correctly refuses to trust the client on
whether an item is earned, matching the barcode/billing-gate precedent.

**Frontend.** The override is layered *inside* `useReduceMotion()` rather
than at each call site, so `foxxy.tsx` and `companion.tsx` get it with zero
changes — correct application of this codebase's "hook owns the logic, dumb
components take a prop" split. `useUserSettings()` falling back to defaults
instead of throwing is a deliberate, documented trade-off (keeps
component-level tests working without wrapping every render in a provider);
it is also what makes the `_layout.tsx` mistake silent, and the code comment
says so honestly. `goals.tsx`'s local text-draft buffer is a real
thoughtfulness signal — it prevents mid-edit coercion fighting the user's
cursor, which a naive `value={String(settings.x)}` would do. Division-by-zero
on a `0` calorie goal is guarded (`index.tsx`: `goal > 0 ? ... : 0`) *and*
tested. `expo-sqlite@~16.0.10` was installed via `npx expo install`, i.e.
resolved for SDK 54 rather than guessed — which is what `app/AGENTS.md`
demands.

**Comments are unusually high-value** throughout: they explain *why*
(`equipped_* DEFAULT 1` rationale, the web-twin trap, the `ThemedApp` split
rationale, the `requireMock` vs `require` test-pollution note) rather than
restating the code.

Minor nits, none blocking: `goals.tsx`'s `drafts` are never cleared when the
background GET reconciles, so a stale draft string can persist over a
server-updated value while the screen stays mounted; `Math.round()` is
applied to numeric fields, which is correct for `INTEGER` columns but isn't
mentioned in the plan or the outcome doc.

## 5. Findings the tech-lead pass missed

The tech lead's final blocking issue was doc/comment/test-naming accuracy
around the retry policy, and the fix is **verified correct**: the code
retries on *every* foreground event; `settings-context.tsx`'s comments at
lines 33-38, 85-87 and 136-140 all say so; the outcome doc (lines 47-52,
160-169) says so; and `settings-context.test.tsx:246` — "a second, later
foreground event retries again after the first retry failed, and can
succeed" — genuinely proves it by making the first retry fail and the second
succeed. `retriedRef` is correctly an overlap guard, cleared in `.finally()`,
not a once-ever latch. Independently confirmed; the corrected wording matches
real behavior.

However, **the same class of issue survives in three more places**, which the
tech-lead pass did not catch:

1. **`app/src/lib/settings-db.ts:10`** — the header comment still reads
   "read by settings-context.tsx's **retry-once policy**." This is the exact
   stale wording the tech lead blocked on and believed it had eliminated. Not
   a behavior bug, but the fix pass was incomplete.
2. **Outcome doc test counts are stale.** It claims "291 tests, 291 passed";
   the real number is **292** (the retry test added during review was never
   folded into the count). It also cites `settings-context.tsx` line 137 for
   the uncovered branch; the real line is **143**. And it claims "17 new
   tests in `backend/test/user.test.js`" — the file contains **16** (I
   counted, and ran that file alone: `pass 16`), making the split 78
   pre-existing + 16, not the stated 77 + 17.
3. **The theme-verification section overstates itself.** It says all 6 files
   "each ha[ve] a dedicated, rewritten (not incidentally-passing) test," then
   lists `_layout.tsx` and `use-theme.ts` among them — neither of which has a
   test. The parentheticals are individually honest, but the topic sentence
   is not.

These are all documentation accuracy, zero behavioral impact. But the pattern
is worth naming: **doc/code drift is this ticket's consistent weak spot** —
it is now the third round in a row where the substantive finding was a doc
claim outrunning the code rather than a code defect. The code quality here is
high enough that the docs are the binding constraint on trustworthiness. I am
requiring the fixes as merge conditions rather than as a block because none
of them can mislead the code.

## 6. Disposition of the two deferred items

### (a) Two-table PATCH not wrapped in `db.transaction()` — **defer, ticket it**

The plan said `dailyCalorieGoal` writes to `users.daily_calorie_goal` "in the
same request/transaction as the `user_settings` update." The code satisfies
"same request" but not "same transaction": `user.js:107` and `user.js:138`
are two independent `.run()` calls, each its own implicit transaction under
better-sqlite3.

Reasoning about actual exposure:

- Both statements are **synchronous with no `await` between them** — there is
  no interleaving point where another request can observe the half-written
  state, and better-sqlite3 is single-threaded. So the classic
  read-uncommitted concurrency hazard does not exist here.
- Validation completes entirely before the first write, so a 400 can never
  produce a partial write. The only partial-write path is a hard process
  crash or `SIGKILL` in the microseconds between two statements.
- Worst realistic outcome: a PATCH carrying both a calorie change and a theme
  change lands the calorie change and loses the theme change. The client's
  `pending_sync` flag survives this and the next foreground retry re-sends
  the whole object, which self-heals it.
- Single-user local-first app; no multi-writer scenario.

**Reasonable to defer.** The exposure is a crash window of microseconds with
a self-healing client. But two caveats: the fix is genuinely ~3 lines
(`db.transaction(() => {...})()`, a helper this project already has available
via better-sqlite3), and the plan *said* transaction, so this is arguably a
small undisclosed deviation rather than a pure follow-up — the outcome doc's
"Deviations: None beyond what the plan itself already called out" does not
mention it. File it, and note it as a deviation.

### (b) `retrySync` PATCHes the whole settings object — **defer, accept as designed**

`retrySync` sends `settingsRef.current` (all 11 fields) rather than only
dirty ones. Last-write-wins.

This is not just acceptable, it is *coupled to* the reject-vs-no-op
refinement and explains why that refinement exists: because the retry echoes
back the full object it was served — including `equippedCrown: true` for a
locked crown — a strict server-side unlock check would 400 on a value the
server itself just sent. The two design choices are consistent, and the plan
anticipated exactly this ("a client that optimistically echoes back the full
settings object... would otherwise get rejected"). Good coherence between
plan and implementation.

I did find the precise boundary where it misbehaves, which is worth recording
rather than discovering later: **if the client's cached value for a locked
slot is `true` while the server row is `false`** (reachable only if a second
device or a direct DB write set it to `false`), then every retry sends `true`
for a locked slot, hits the `!currentlyTrue` reject branch, and **fails
permanently** — `syncFailed` sticks on forever with no path out but a
successful GET reconcile overwriting the cache. That requires multi-device
usage, which is explicitly out of scope for a single-user local-first app,
and the boot GET does overwrite the cache and thus self-heals on the next
cold start.

**Reasonable to defer**, and I'd go further: dirty-field tracking should not
be adopted casually, because the full-object resend is what makes the
optimistic cache converge on the server. If it is ever changed, the no-op
allowance in `user.js:93-99` must be revisited in the same change. Note that
coupling in the follow-up ticket so a future implementer doesn't unpick one
half.

**Neither item blocks.** Both are correctly-scoped deferrals, not oversights.

## 7. Risk assessment

| Risk | Severity | Likelihood | Assessment |
|---|---|---|---|
| Theme override silently inert on one platform | High if it happened | Very low | The exact trap (the `.web.ts` twin) was found in plan review and both twins are independently tested; my mutation test confirms the web test would catch a regression |
| `_layout.tsx` `ThemedApp` split regresses later | Medium | Low | Correct today (verified by reading); untested and unwatched by coverage. Regression-only risk → follow-up |
| Client cache SQL invalid on device (mock is a fake) | High if it happened | Very low | I executed the real DDL + upsert against a real SQLite engine myself — valid. Recommend making that a permanent test |
| Partial write from the non-transactional two-table PATCH | Low | Very low | Microsecond crash window, self-healing client — see §6(a) |
| Permanent `syncFailed` from whole-object retry vs a locked slot | Low | Very low | Multi-device only; heals on next boot GET — see §6(b) |
| Cross-tenant data access | High if it happened | None found | All queries keyed on `req.userId`; no client-supplied id; parameterized throughout |
| `macroUnit` toggle does nothing visible | Low | Certain | Real but cosmetic; user-visible dead control → follow-up |
| Real-device "zero flash" / foreground-retry behavior unverified | Low | N/A | Honestly disclosed in the outcome doc rather than claimed; correct handling |
| Coverage regression | Low | None | Above baseline on all 7 metrics across both suites, independently re-run |

**Blast radius.** Meaningfully wider than the new files alone: this diff
changes the Dashboard's calorie-goal source (`summary?.goal` →
`settings.dailyCalorieGoal`), the root layout's component structure, both
tab-bar components, and both color-scheme hooks. A mistake in the theme hooks
or `_layout.tsx` would affect every screen. That said, `companion.tsx` and
all 4 new screens are at 100% on every metric, `index.tsx` regressions are
covered by 4 new targeted tests, and 292 tests pass — the touched surface is
better covered after this change than before it.

## 8. Conditions

Non-blocking; none require re-review. Fix (1) before or at commit, and file
(2)-(4) as tickets.

1. **Correct the doc inaccuracies in §5**: the stale "retry-once policy"
   comment in `settings-db.ts:10`; the outcome doc's `291` → `292`, line
   `137` → `143`, and `17 new backend tests` → `16` (split 78 + 16); and
   soften the theme-verification topic sentence so it doesn't claim tests for
   `_layout.tsx` and `use-theme.ts`. Also add the missing transaction to the
   outcome doc's Deviations section per §6(a).
2. **Follow-up ticket: wrap the two-table PATCH in `db.transaction()`.**
3. **Follow-up ticket: `macroUnit` is inert** — either wire the
   grams/percentage toggle to actually change displayed units, or hide it.
4. **Follow-up ticket: test the client cache SQL against a real engine.**
   Export `settings-db.ts`'s DDL/upsert strings and assert them against
   `better-sqlite3` (already a backend dependency), so the SQL the
   hand-rolled `expo-sqlite` mock cannot validate is covered permanently. I
   did this manually for this review; it should not depend on a reviewer
   doing it again. Consider adding a smoke test for `_layout.tsx`'s
   provider/consumer ordering in the same ticket.

## 9. Rationale

Merge. The feature does what the plan said, the plan's three
architecture deviations were confirmed with the user before any code was
written, and the two hardest details in the diff — the reject-vs-no-op equip
distinction and the `ThemedApp` provider split — are both genuinely correct
rather than superficially present. I proved the first by mutation testing in
both directions (each mutation killed exactly one, different test) and the
second by tracing the context ordering and the silent-failure mode the
fallback-instead-of-throw design would otherwise create. Every claimed
number reproduced exactly on my own runs: 94/94 backend, 292/292 frontend
across 33 suites, coverage above baseline on all 7 metrics, `tsc` at exactly
the 3 pre-existing errors. `dailyCalorieGoal` write-through is proven by a
real DB read-back, not response-body trust. I also closed the one gap no test
covered — the client cache SQL, which the hand-rolled mock cannot
validate — by running it against a real SQLite engine.

Nothing found is a behavior defect. Everything found is documentation drift
or a correctly-scoped deferral, and both deferred items are not only
defensible but *coherent* with the design — the whole-object retry is
precisely why the no-op allowance exists. What holds this back from an
unqualified approval is not the code but the review structure: with Opus at
both the tech-lead and CTO gates, the independence the pipeline is supposed
to provide is absent, and the fact that I found three doc-accuracy items the
tech-lead pass missed — in the very category it had just blocked on — is
evidence that a same-model gate does leak. Treat this verdict as one strong
review rather than two independent ones, and weigh the human commit decision
accordingly.

Branch remains uncommitted; no git operations were performed during this
review. My mutation tests were reverted and both suites re-verified green
(backend 16/16 on the touched file, frontend 292/292), with `git status`
showing the same 33 changed files as before the review began.
