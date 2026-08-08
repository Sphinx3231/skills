# Outcome: User Settings & Wardrobe Customization

Ticket: `docs/tickets/003-user-settings-wardrobe.md`
Plan: [docs/plans/user-settings-plan.md](../plans/user-settings-plan.md)
Branch: `foxbite-user-settings`

## What changed and why

### Backend (`backend/`)

- `src/db/index.js` — new `user_settings` table (1-row-per-user, matching
  `companion_state`'s existing pattern): `protein_goal_g`/`carbs_goal_g`/
  `fats_goal_g` (defaults 125/225/67 — the same numbers `index.tsx`'s old
  hardcoded 25/45/30 split of a 2000kcal goal already produced, so existing
  users see no numeric change until they edit something), `macro_unit`
  (default `'grams'`), `theme_mode` (default `'woodland_dusk'`),
  `motion_setting` (default `'system_default'`), 4 `equipped_*` columns
  (default `1` — locked items are gated out by `unlocked && equipped` at
  render time regardless, so defaulting to "on" exactly preserves today's
  behavior for already-unlocked items). `getOrCreateUser` provisions this
  row the same way it already provisions `companion_state`.
- `src/routes/user.js` (new) — `GET/PATCH /user/settings`, flat-mounted
  (`app.use("/user", userRouter)` in `src/index.js`), matching this
  backend's unversioned route convention rather than the spec's literal
  `/api/v1/...`. `dailyCalorieGoal` writes through to the existing
  `users.daily_calorie_goal` column (no duplicate calorie-goal storage).
  Validation before any write: numeric fields must be finite/non-negative;
  `macroUnit`/`themeMode`/`motionSetting` are allowlist-checked; `equipped*`
  fields must be booleans and are cross-checked against
  `companion_state.unlocked_items` — rejected only when a PATCH would
  **newly** turn on a slot that isn't actually unlocked, while a no-op
  resend of the existing (locked, default-true) value is accepted, per the
  plan's explicit refinement.

### Frontend (`app/`)

- Installed `expo-sqlite@~16.0.10` via `npx expo install expo-sqlite` (SDK
  54-correct version, not guessed).
- `src/lib/settings-db.ts` (new) — `expo-sqlite` synchronous local cache,
  single-row `settings_cache` table with a `pending_sync` flag.
- `src/lib/api.ts` — `UserSettings` type, `getUserSettings()`,
  `updateUserSettings(patch)`.
- `src/lib/settings-context.tsx` (new) — `SettingsProvider`/
  `useUserSettings()`. Hydrates instantly from the local cache on mount,
  reconciles with `GET /user/settings` in the background, applies
  `updateSettings(patch)` optimistically + writes the cache immediately +
  debounces the `PATCH` by 500ms (collapsing rapid successive updates into
  one network call). On a failed PATCH, `syncFailed` is set (surfaced via a
  banner on the Settings list screen) and the local cache stays marked
  pending; every subsequent app-foreground event retries the pending write
  again (not just a single one-shot retry) until one succeeds, at which
  point `syncFailed` clears and the cache is marked synced.
  `useUserSettings()` outside a `SettingsProvider` falls back to a
  default/no-op context rather than throwing, so it's backward-compatible
  with existing tests that don't wrap every render in the provider.
- `src/app/_layout.tsx` — mounts `SettingsProvider` above the rest of the
  tree; the theme resolution described below now runs inside it.
- **Theme override — all 6 files identified in the plan, all touched:**
  1. `src/hooks/use-color-scheme.ts` — now reads `settings.themeMode`
     (`woodland_dusk`→`'light'`, `dark`→`'dark'`, `system`→OS value via
     `useRNColorScheme()`), replacing the old bare passthrough.
  2. `src/hooks/use-color-scheme.web.ts` — same override logic layered on
     top of its existing web hydration guard (the guard still applies only
     to the OS-driven `'system'` branch; override branches resolve
     immediately).
  3. `src/hooks/use-theme.ts` — no code change needed; it already calls
     `useColorScheme` from `@/hooks/use-color-scheme` rather than React
     Native's directly, so it inherits the fix for free. Confirmed by
     reading it, not assumed.
  4. `src/app/_layout.tsx` — `TabLayout` split into an outer component
     (mounts `SettingsProvider`) and an inner `ThemedApp` that calls the
     wrapped `useColorScheme()` for `@react-navigation`'s theme, instead of
     React Native's raw hook.
  5/6. `src/components/app-tabs.tsx` and `app-tabs.web.tsx` — both switched
     from React Native's `useColorScheme` to `@/hooks/use-color-scheme`.
  - `use-color-scheme.test.ts` and `use-color-scheme.web.test.tsx` were
    **rewritten** (not left passing by accident) to assert override
    behavior against a mocked `useUserSettings`, for all three `themeMode`
    values.
- `src/hooks/use-reduce-motion.ts` — layered the override *inside* the
  existing hook (no new rendering logic, per the plan): `motionSetting ===
  'force_reduced_motion'` forces `true`; `'full_animations'` forces `false`;
  `'system_default'` preserves the original `AccessibilityInfo`-driven
  value unchanged. Every existing consumer (`foxxy.tsx`, `companion.tsx`)
  gets this for free.
- `src/app/companion.tsx` — gear icon (testID `settings-gear-button`) in
  the header routing to `/settings/index`; hero Foxxy and the wardrobe grid
  now derive `wearingX` from `unlockedItems.includes(x) && settings.equippedX`
  (both conditions required); each unlocked wardrobe card gets an
  equip/unequip tap target (testID `wardrobe-equip-toggle-${item}`); status
  text is now `Locked` / `Unlocked` / `Equipped`.
- `src/app/index.tsx` — `goal`/macro targets now read from
  `useUserSettings().settings` instead of `summary?.goal` and the old
  hardcoded 25/45/30 split, so a settings change is reflected on the very
  next render with no network round-trip.
- `src/app/settings/index.tsx`, `goals.tsx`, `appearance.tsx`,
  `wardrobe.tsx` (all new) — the 3-screen settings stack: a list screen
  (with a sync-failed banner) linking to Goals & Targets (numeric inputs +
  grams/percentage toggle), Appearance (theme + motion pickers), and
  Wardrobe (per-slot equip toggle, same logic as the Companion grid).

## Deviations from the plan's literal wording (matching the plan's own
pre-declared deviations, not new ones)

None beyond what the plan itself already called out (flat `/user/settings`
path, no duplicate calorie column, macro defaults preserving today's
25/45/30-derived numbers). No new deviations were introduced during
implementation.

## Test results

All numbers below are from real runs in this environment on 2026-08-08, not
estimated.

**Backend** (`npm run test:coverage`, i.e. `node --experimental-test-module-mocks
--experimental-test-coverage --test`, run **without** manually exporting
`DB_PATH` — each test file sets its own `process.env.DB_PATH = ":memory:"`
at the top, which is what the "at/above baseline" numbers below assume):

- **94 tests, 94 passed, 0 failed** (16 new tests in `backend/test/user.test.js`;
  78 pre-existing, unmodified).
- Coverage (all files): **99.25% lines / 96.63% branch / 100% functions.**
- Plan's stated baseline: 99.05% / 96.40% / 100%. Current run is **above
  baseline on lines and branch, equal on functions** — no regression.
- `user.js` itself: 100% lines / 97.44% branch / 100% functions.
- Remaining uncovered lines are pre-existing and untouched by this ticket:
  `food.js:307-312` (`bumpStreak`'s "no companion_state row exists" insert
  path — unreachable since `getOrCreateUser` always inserts that row first;
  already flagged as pre-existing in the prior ticket's outcome doc),
  `companion.js`/`billing.js` branch gaps (pre-existing, files not touched
  by this ticket).
  - Diagnostic note: running the coverage command with `DB_PATH=":memory:"`
    forced via the shell environment (rather than letting each test file's
    own top-of-file assignment take effect) suppresses `db/index.js`'s
    real-file-path branch in every test file, not just the ones that
    intend it, and drags the aggregate down to 98.87%/95.00%/97.30%
    (funcs). This is an artifact of ES module import hoisting (each test
    file's `process.env.DB_PATH = ":memory:"` line runs after its hoisted
    `import` of `db/index.js`, so it doesn't actually suppress the branch
    within that file's own process the way it looks like it should) — it is
    not a real regression, and disappeared entirely once the command was
    re-run the normal way (no manually-exported `DB_PATH`). Flagging this
    since it cost real debugging time and could bite again.

**Frontend** (`npx jest --coverage`):

- **292 tests, 292 passed, 0 failed** (33 suites; up from 281/33 suites
  before the coverage-improvement pass, plus one more test added during
  tech-lead review to prove the retry-on-every-foreground-event behavior
  directly — added targeted tests to `settings-db.test.ts`, `api.test.ts`,
  `companion.test.tsx`, `settings-context.test.tsx`, and
  `settings/__tests__/wardrobe.test.tsx` to close branches the first pass
  had left uncovered).
- Coverage (all files): **98.53% statements / 91.71% branch / 98.05%
  functions / 99.56% lines.**
- Plan's stated baseline: 98.16 / 90.30 / 98 / 99.45. Current run is
  **above baseline on all four axes** (+0.37 stmts, +1.41 branch, +0.05
  funcs, +0.11 lines) — no regression, and well clear of the 90% floor on
  every metric.
- `app/settings/*` (all 4 new screens): 100/100/100/100.
- `companion.tsx`: 100/100/100/100.
- `settings-context.tsx`: 100% stmts/lines, 91.66% branch, 94.73% funcs —
  the one remaining gap (line 143, `retrySync`'s `retriedRef.current` guard
  against an *overlapping* in-flight retry — not a "only retry once ever"
  limit; the provider does retry again on each later foreground event, per
  the two dedicated tests covering a failed retry and a subsequent
  successful one) is defensive and covered indirectly, but the exact
  concurrent-retry-in-flight branch wasn't independently isolated; left
  as-is since it's not user-visible behavior and pushing further risked
  over-fitting a test to internal implementation detail rather than
  observable behavior.
- Remaining uncovered lines elsewhere (`index.tsx:183-185,255`, `log.tsx:599,602`,
  `sign-in.tsx:279`, `theme.ts:115`, `external-link.tsx:14`) are all
  pre-existing and unrelated to this ticket.

**`npx tsc --noEmit`** (in `app/`): **3 errors**, identical to the plan's
stated baseline ("same 3 pre-existing errors"):
- `src/components/animated-icon.tsx(150,5)`: TS2698 spread-types
- `src/components/app-tabs.web.tsx(72,15)`: TS2322 `SFSymbols7_0`
- `src/components/ui/collapsible.tsx(22,13)`: TS2322 `SFSymbols7_0`

No new errors.

## Theme-override verification (explicit, per the plan's acceptance
criteria)

All 6 files listed in the plan were touched. Test coverage per file, stated
accurately (a CTO review pass caught this section previously overclaiming
dedicated tests for two of the six):
`use-color-scheme.ts` and `use-color-scheme.web.ts` — both have dedicated,
rewritten (not incidentally-passing) test files. `app-tabs.tsx` and
`app-tabs.web.tsx` — new dedicated test files
(`app-tabs.test.tsx`/`app-tabs.web.test.tsx`) asserting tab-bar color
resolves per `themeMode`. `use-theme.ts` — confirmed by reading it to need
no code change (it already calls the wrapped hook, not React Native's
directly) and has no dedicated new test of its own, since nothing in it
changed. `_layout.tsx` — the `ThemedApp` split (theme now sourced from the
wrapped hook, not React Native's raw one) has **no dedicated test**;
`_layout.tsx` is a pre-existing coverage exclusion from before this ticket,
not something newly untested here, but this file's correctness rests on
manual code reading plus the passing behavior of the hooks it calls, not on
a direct assertion of its own.

## Deferred / could not verify from this environment

- **True "zero flash" on real device paint timing.** The local
  `expo-sqlite` cache hydration is verified as directly as this environment
  allows (a unit test proves `settings.themeMode` reflects the cached value
  synchronously on first render, before the network `GET` resolves) — but
  an actual visual absence of flicker on a cold-started real device is not
  something a headless test can prove, and gets the same honesty treatment
  as this project's prior "can't verify on real hardware" disclosures.
- **Real on-device retry/foreground behavior.** The "retry a pending write
  on every app-foreground event until it succeeds" policy is verified by
  directly invoking the mocked `AppState` `'change'` listener in tests
  (success case, no-op-when-nothing-pending case, a failed retry leaving
  `syncFailed` set, and a later foreground event retrying again and
  succeeding after an earlier retry failed) — a real backgrounding/
  foregrounding cycle on a physical device was not
  exercised from this environment.

## Files changed / added

**Backend:**
- `backend/src/db/index.js` — `user_settings` table; `getOrCreateUser` line.
- `backend/src/routes/user.js` — new.
- `backend/src/index.js` — mounts `userRouter` at `/user`.
- `backend/test/user.test.js` — new, 16 tests.

**Frontend:**
- `app/package.json` — `expo-sqlite` dependency.
- `app/src/lib/api.ts` — `UserSettings` type, `getUserSettings`,
  `updateUserSettings`.
- `app/src/lib/settings-db.ts` — new.
- `app/src/lib/settings-context.tsx` — new.
- `app/src/hooks/use-color-scheme.ts`, `use-color-scheme.web.ts`,
  `use-reduce-motion.ts` — rewritten.
- `app/src/hooks/use-theme.ts` — confirmed unchanged (no fix needed).
- `app/src/app/_layout.tsx` — `SettingsProvider` mounted; theme source
  switched.
- `app/src/components/app-tabs.tsx`, `app-tabs.web.tsx` — theme source
  switched.
- `app/src/app/companion.tsx` — gear nav entry, equip/unequip wiring.
- `app/src/app/index.tsx` — settings-driven calorie/macro targets.
- `app/src/app/settings/index.tsx`, `goals.tsx`, `appearance.tsx`,
  `wardrobe.tsx` — new screens.
- `app/src/hooks/__tests__/use-color-scheme.test.ts`,
  `use-color-scheme.web.test.tsx`, `use-reduce-motion.test.ts` — rewritten.
- `app/src/components/__tests__/app-tabs.test.tsx`,
  `app-tabs.web.test.tsx` — new.
- `app/src/lib/__tests__/settings-db.test.ts`,
  `settings-context.test.tsx` — new.
- `app/src/lib/__tests__/api.test.ts` — extended.
- `app/src/app/__tests__/companion.test.tsx`, `index.test.tsx` — rewritten/extended.
- `app/src/app/settings/__tests__/index.test.tsx`, `goals.test.tsx`,
  `appearance.test.tsx`, `wardrobe.test.tsx` — new.
- `app/__mocks__/expo-sqlite.js` — new manual mock.

No git commands (add/commit) were run — per the gated-build pipeline, this
branch's changes are left uncommitted for human review.
