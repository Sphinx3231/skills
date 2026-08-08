# Plan: User Settings & Wardrobe Customization

Ticket: `docs/tickets/003-user-settings-wardrobe.md` (tracked in-repo, no
GitHub issue this round — see ticket doc for why).
Branch: `foxbite-user-settings` (isolated from `main`, gated-build pipeline
combined with ticketed-change tracking, per standing instruction).

## Context and architecture decisions confirmed with the user

Three decisions were confirmed via direct questions before writing this plan
(see the ticket doc for the exact question wording):

1. **`expo-sqlite`, not `better-sqlite3`, for client-side local storage.**
   `better-sqlite3` is a Node-only native addon (used by the backend, `backend/
   src/db/index.js:1`) and cannot run inside Expo/React Native — there is no
   way to satisfy the spec's literal wording without a substitution. `expo-
   sqlite` is the real equivalent: a genuine local SQLite database usable
   from RN/Expo. It's not currently installed (confirmed via `app/package.json`
   — no local persistence library of any kind exists client-side today; every
   screen re-fetches from the server on focus).
2. **Keep 4 independent wardrobe slots** (scarf, hat, crown, backpack) rather
   than merging hat+crown into one "headwear" slot as the spec's literal
   field list implied. `backend/src/routes/companion.js:9-14`'s
   `STREAK_UNLOCKS` already treats these as 4 separate unlockable items;
   collapsing two of them into a single slot would be a bigger, disruptive
   change to the unlock model for no benefit the user asked for. This ticket
   adds an **equip/unequip toggle per slot** — today, unlocked always means
   worn; after this ticket, unlocked items can be turned off.
3. **`woodland_dusk` is a rename of the existing static light palette**, not
   a new palette to design. The theme picker becomes `woodland_dusk` / `dark`
   / `system` (system = today's pure-OS-driven behavior, still available as
   an option, not the only option anymore).

## Additional deviations from the spec's literal wording (found during
## investigation, not asked about — low-risk enough to just decide and flag)

- **API path**: the spec asks for `GET/PATCH /api/v1/user/settings`, but
  this backend has no `/api/v1` prefix anywhere — every existing route is
  flat (`/food`, `/companion`, `/billing`, mounted directly in
  `backend/src/index.js:37-39`). Introducing a versioned prefix for one new
  route while every sibling route stays unversioned would be inconsistent
  and confusing to the next person reading `index.js`. This plan uses
  **`GET/PATCH /user/settings`** (new `backend/src/routes/user.js`, mounted
  as `app.use("/user", userRouter)`), matching the existing flat convention.
  If real API versioning is wanted across the whole backend, that's a
  separate, much bigger ticket — not something to bolt onto one route here.
- **Calorie goal already exists — don't duplicate it.** `users.daily_calorie_
  goal` (`backend/src/db/index.js:25`, default 2000) already exists and is
  already read by `GET /food/dashboard/summary` (`backend/src/routes/
  food.js`, near line 127). This ticket's `PATCH /user/settings` writes calorie
  changes to that existing column, not a second copy in a new table — two
  sources of truth for the same number is exactly the kind of drift bug this
  project's tickets have repeatedly had to catch. Only the genuinely new
  fields (macro targets, macro unit, theme, motion, wardrobe equip flags) get
  a new table.
- **Macro targets don't exist at all today.** `app/src/app/index.tsx:75-78`
  currently *derives* protein/carbs/fat targets from a hardcoded 25/45/30
  split of the single calorie goal, with a comment explicitly noting this is
  a placeholder ("Reasonable default macro split... since the goal is
  calorie-only"). This ticket replaces that hardcoded split with real
  per-user stored targets, defaulting to the *same* 25/45/30-derived numbers
  (protein 125g, carbs 225g, fat 67g for the 2000kcal default) so existing
  users see no numeric change until they actually edit something.

## Data model

### Backend: new `user_settings` table (`backend/src/db/index.js`)

```sql
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  protein_goal_g INTEGER NOT NULL DEFAULT 125,
  carbs_goal_g INTEGER NOT NULL DEFAULT 225,
  fats_goal_g INTEGER NOT NULL DEFAULT 67,
  macro_unit TEXT NOT NULL DEFAULT 'grams',
  theme_mode TEXT NOT NULL DEFAULT 'woodland_dusk',
  motion_setting TEXT NOT NULL DEFAULT 'system_default',
  equipped_scarf INTEGER NOT NULL DEFAULT 1,
  equipped_hat INTEGER NOT NULL DEFAULT 1,
  equipped_crown INTEGER NOT NULL DEFAULT 1,
  equipped_backpack INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Follows `companion_state`'s existing 1-row-per-user pattern exactly
(`user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`, `db/
index.js:46`). SQLite has no `ALTER TABLE ... ADD CHECK`, and this project's
`CREATE TABLE IF NOT EXISTS` convention has no migration runner (confirmed —
schema is additive-only inline SQL, `db/index.js:22-51`), so `macro_unit`/
`theme_mode`/`motion_setting` are validated in the route layer (allowlist),
not via a SQL `CHECK` constraint — consistent with how this codebase already
validates (`food.js`'s barcode regex, billing-gate checks) at the route,
not the schema.

**Why `equipped_*` default to `1`, not `0`:** items that are equipped but
*not yet unlocked* are simply never rendered (rendering gates on **both**
`unlocked` and `equipped`, see Frontend section) — so defaulting every
equip flag to "on" is harmless for locked items and exactly preserves
today's actual behavior for already-unlocked ones (today, unlocked always
means worn; this default keeps that true until a user explicitly turns
something off). No backfill migration needed for existing users' rows —
the same `INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)` that
provisions the row lazily on first access already gets the right defaults.

**`getOrCreateUser` (`db/index.js:53-57`)** gets one more line:
`INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)`, mirroring how
`companion_state` is already provisioned in the same function.

### Client: `expo-sqlite` local cache

New `app/src/lib/settings-db.ts`: opens a local `expo-sqlite` database
(`openDatabaseSync` or the async API — confirm which `expo-sqlite` exports
for the installed SDK-54-compatible version during implementation, per this
project's "verify API shapes, don't guess" rule from prior tickets) with a
single-row `settings_cache` table mirroring the backend shape, plus a
`pending_sync` flag/timestamp. Read on app boot (before first paint, in
`_layout.tsx`) to hydrate a `SettingsProvider` context instantly — this is
what gives "zero layout flash," not a network round-trip.

## Client state: `SettingsProvider` context

New `app/src/lib/settings-context.tsx`, mounted in `app/src/app/_layout.tsx`
above the existing providers (must be available before `Foxxy`, theme, and
reduce-motion consumers mount). Exposes:

```ts
type UserSettings = {
  dailyCalorieGoal: number;
  proteinGoalG: number; carbsGoalG: number; fatsGoalG: number;
  macroUnit: 'grams' | 'percentage';
  themeMode: 'woodland_dusk' | 'dark' | 'system';
  motionSetting: 'system_default' | 'force_reduced_motion' | 'full_animations';
  equippedScarf: boolean; equippedHat: boolean; equippedCrown: boolean; equippedBackpack: boolean;
};
function useUserSettings(): { settings: UserSettings; updateSettings: (patch: Partial<UserSettings>) => void };
```

`updateSettings`:
1. Merges the patch into local state immediately (optimistic UI).
2. Writes the merged row to the `expo-sqlite` cache immediately (survives
   app restart before the server round-trip completes).
3. Debounces the actual `PATCH /user/settings` call by 500ms per the spec —
   a trailing-edge debounce (rapid slider drags / multiple quick taps
   collapse into one network call), implemented as a small hand-rolled
   `setTimeout` helper (no debounce utility exists in this codebase today,
   confirmed by grep — this project prefers small hand-written utilities
   like `dashboard-logic.ts` over pulling in a library for one function).
4. On a failed PATCH (network error, validation 400), the local optimistic
   state is **not** silently kept forever — after a failed sync, mark the
   affected fields dirty and retry once on the next successful app-foreground
   event or explicit user action; if it fails again, surface a small
   non-blocking "changes not saved" indicator rather than pretending success.
   (Exact retry policy is intentionally left to the implementer to keep
   simple — this is not a offline-queue system, just "don't lie about sync
   state" — but it must not be entirely absent.)

## Backend API

### `GET /user/settings`

`requireAuth` (same middleware every other route uses). Reads and returns
the `user_settings` row (provisioned lazily via `getOrCreateUser` if
somehow missing) joined with `users.daily_calorie_goal`, shaped as:

```json
{
  "dailyCalorieGoal": 2000,
  "proteinGoalG": 125, "carbsGoalG": 225, "fatsGoalG": 67,
  "macroUnit": "grams",
  "themeMode": "woodland_dusk",
  "motionSetting": "system_default",
  "equippedScarf": true, "equippedHat": true, "equippedCrown": true, "equippedBackpack": true
}
```

### `PATCH /user/settings`

`requireAuth`. Body: any subset of the fields above (partial update, per
spec). Validation, all before any write:
- `dailyCalorieGoal`, `proteinGoalG`, `carbsGoalG`, `fatsGoalG`, if present,
  must be finite non-negative numbers (spec's explicit requirement) — reject
  with 400 and a field-naming error message otherwise, mirroring this
  project's existing `Number.isFinite` validation style in `food.js`.
- `macroUnit` if present must be `'grams' | 'percentage'`, else 400.
- `themeMode` if present must be `'woodland_dusk' | 'dark' | 'system'`, else
  400.
- `motionSetting` if present must be one of the 3 allowed values, else 400.
- `equipped*` fields if present must be booleans. **Server-side rule, not
  just client-side**: setting `equippedX: true` for a slot the user hasn't
  actually unlocked (cross-check `companion_state.unlocked_items`) is
  rejected with 400 — the client shouldn't be trusted to enforce this alone,
  the same principle already applied to the barcode/billing gates elsewhere
  in this codebase. **Important refinement (tech-lead review caught this):**
  because GET returns `equippedCrown: true` by default even for a locked
  crown (per the `equipped_* DEFAULT 1` choice above), a client that
  optimistically echoes back the full settings object it was just given
  (e.g. during the failed-sync retry path) would otherwise get rejected for
  a value the server itself just served — a false-positive 400 on a genuine
  no-op. The rule is therefore: reject only when the request would **change**
  a currently-`false`-or-absent-in-`unlocked_items` slot to `true`; a PATCH
  that redundantly re-sends the existing (locked, default-true) value for a
  slot that was never actually unlocked is a no-op and must succeed.
- `dailyCalorieGoal` writes to `users.daily_calorie_goal` (the existing
  column, in the same request/transaction as the `user_settings` update);
  every other field writes to the new `user_settings` row.
- Returns the full updated settings object (same shape as GET), so the
  client's optimistic-update reconciliation has a definitive source of
  truth to compare against.

### Backend tests (`backend/test/user.test.js`, `node --test`)

Mirror this project's existing test style (`food.test.js`, `companion.js`
has none yet but follows the same DB-per-test pattern): GET returns defaults
for a fresh user; GET returns previously-set values; PATCH updates a single
field without clobbering others (the actual meaning of "partial update" —
a test that sets one field then confirms a second, untouched field still
has its old value); PATCH rejects negative calorie/macro values; PATCH
rejects an invalid `themeMode`/`motionSetting`/`macroUnit` enum value; PATCH
rejects `equippedScarf: true` for an unlocked-but-not-yet-earned slot; PATCH
`dailyCalorieGoal` actually updates `users.daily_calorie_goal` (read it back
via a direct query, not just via the response body — this project's
"verify a real round-trip, not just that the route accepts the request"
rule from the barcode-source ticket applies here too).

## Frontend

### Goals & Targets screen (`app/src/app/settings/goals.tsx`, new)

Numeric inputs for calorie goal and the three macro targets (grams by
default per `macroUnit`), plus the grams/percentage toggle. Each field calls
`updateSettings` on change (optimistic + debounced, per the context above).
**"Instantly update Foxxy's live mood state calculations"**: `index.tsx`'s
`foxxyState(logCount, calories, goal)` call and its `proteinTarget`/
`carbsTarget`/`fatTarget` hardcoded-split lines (`index.tsx:72,75-78`) are
replaced with `settings.dailyCalorieGoal` and `settings.proteinGoalG`/
`carbsGoalG`/`fatsGoalG` read from `useUserSettings()` instead of
`summary?.goal` and the hardcoded split — since the settings context updates
synchronously on the optimistic write, Dashboard mood/remaining-calorie math
reacts on the very next render, with no dependency on a network round-trip
or a screen-focus refetch. (`GET /food/dashboard/summary`'s own `goal` field
stays as-is for the calorie total math server-side — it already reads
`users.daily_calorie_goal`, which this ticket keeps as the single source of
truth, so it can't drift from what Goals & Targets just wrote.)

### Appearance & Theme screen (`app/src/app/settings/appearance.tsx`, new)

Theme picker (3 options) and a reduce-motion override toggle
(`system_default` / `force_reduced_motion` / `full_animations`), both
backed by `updateSettings`.

**Theme wiring** — per investigation (and a tech-lead correction that found
a 5th file the first pass missed), these **5 files** currently read React
Native's `useColorScheme()` directly or via a passthrough, and every one
must respect an override for "instant re-skin" to actually be true
everywhere, not just on screens that happen to use the wrapped hook:
1. `app/src/hooks/use-color-scheme.ts` — currently a bare passthrough
   (`export { useColorScheme } from 'react-native';`) used on native.
   Replace its export with a real hook that reads `settings.themeMode` from
   `useUserSettings()` and resolves `system` to the OS value, `woodland_dusk`
   to `'light'`, `dark` to `'dark'`.
2. **`app/src/hooks/use-color-scheme.web.ts`** — a separate platform-specific
   twin (Metro resolves `@/hooks/use-color-scheme` to *this* file on web),
   which independently re-exports RN's raw hook. Missed in the first plan
   draft; must be fixed with the same logic as (1), or the override silently
   does nothing on web — the one platform this project's own headless
   verification (`run-foxbite-web` skill) actually exercises, so a partial
   fix here would look like it works during testing while being broken on
   native, or vice versa.
3. `app/src/hooks/use-theme.ts` — calls whichever of (1)/(2) Metro resolves,
   so it updates for free once both are fixed, **provided** it's not also
   re-importing RN's `useColorScheme` directly (confirm during
   implementation).
4. `app/src/app/_layout.tsx:33,43` — currently calls RN's `useColorScheme()`
   directly for `@react-navigation`'s `DarkTheme`/`DefaultTheme`. Must
   switch to the same resolved value as (1)/(2), not the raw OS value.
5. `app/src/components/app-tabs.tsx` **and** its `.web.tsx` twin — two more
   files, same fix, currently independent direct `useColorScheme()` calls
   for tab-bar coloring.

That's 6 files across 5 conceptual call sites (native+web pairs count as
one "site" each for `use-color-scheme.*` and `app-tabs.*`). All must be
verified changed via tests on each file — "instant re-skin" is not true
until every one of them reads from the same resolved source. Existing tests
for the two `use-color-scheme.*` files (`use-color-scheme.test.ts`,
`use-color-scheme.web.test.tsx`) currently assert pure-passthrough
behavior and must be rewritten to assert override behavior instead, not
just left passing by accident.

### Reduce-motion override (`app/src/hooks/use-reduce-motion.ts`)

Currently purely `AccessibilityInfo`-driven with no override concept
(confirmed, no arguments, no stored preference). Add the override layered
*inside* the hook itself (not at each call site) so every existing consumer
(`foxxy.tsx`, `companion.tsx`) gets the override for free without changing
their code — matching this codebase's existing "hook owns the logic, dumb
components take a prop" split (the same pattern `FoxIdle`/`fox-idle.tsx`
already uses): `motionSetting === 'system_default' ? osReduceMotion :
motionSetting === 'force_reduced_motion'`. **"Replaces Foxxy's looping GIFs
with static pose frames when active"** is already exactly what happens
today when `useReduceMotion()` returns true (`autoplay={!reduceMotion}` in
`fox-idle.tsx`) — this item requires zero new rendering logic, only that the
hook's return value can now be forced on/off by a stored preference, not
just the OS.

### Wardrobe / Customization screen (`app/src/app/settings/wardrobe.tsx`, new;
### existing `companion.tsx` wardrobe grid gets equip controls added)

The existing wardrobe grid in `companion.tsx` (`companion.tsx:140-147`)
already shows locked/unlocked state per item — this ticket adds an
equip/unequip tap target on each *unlocked* item (locked items stay
non-interactive, unchanged). `Foxxy`/`FoxWardrobeOverlay`'s 4 boolean props
(`wearingScarf` etc., `foxxy.tsx:15-29`) change from being derived purely
from `unlockedItems.includes('scarf')` to `unlockedItems.includes('scarf')
&& settings.equippedScarf` — both conditions required, so a locked item can
never render regardless of its equip flag (this is also why defaulting
`equipped_*` to `1` in the DB is safe, per the Data Model section above).
No changes to `FoxWardrobeOverlay`'s internal SVG rendering (it still takes
booleans, unchanged prop shape) — only the boolean's derivation changes,
one line per slot in `companion.tsx`.

### Settings navigation

Per the investigation, there's no settings-adjacent screen or nav entry
today. This ticket adds `app/src/app/settings/` as a stack (Goals, Appearance,
Wardrobe as 3 sub-screens under one settings entry point,
`app/src/app/settings/index.tsx` as a simple list linking to the 3), reached
via a gear icon added to `companion.tsx`'s header (not a 4th bottom tab —
adding a tab requires touching `app-tabs.tsx` *and* its `.web.tsx` twin for
what's a low-frequency settings area; a header icon is the lighter-weight,
equally-discoverable choice and avoids reflowing the existing 3-tab layout).

## Explicitly out of scope

- Actually adding *more than one* item per wardrobe slot (multiple scarf
  designs to choose from) — the 4-slot boolean-equip model this ticket
  builds is the ceiling of what today's unlock data supports; adding real
  item variety is new content work, not this ticket.
- A genuinely new third color palette distinct from the current light theme
  (confirmed with the user — `woodland_dusk` is a rename, not a redesign).
- Any backend API versioning beyond this one route's pragmatic `/user`
  mount point — no `/api/v1` prefix is being retrofitted onto existing
  routes.
- An offline sync queue / conflict-resolution system beyond the simple
  "retry once, then show a non-blocking failure indicator" policy described
  above.
- Changing how streaks are earned or how `STREAK_UNLOCKS` unlocks items —
  only whether an already-unlocked item is currently worn.

## Acceptance criteria

- [ ] `GET /user/settings` returns defaults for a fresh user (calorie 2000,
      protein/carbs/fat 125/225/67, grams, woodland_dusk, system_default,
      all 4 equipped flags true) and returns previously-set values otherwise.
- [ ] `PATCH /user/settings` updates only the fields present in the body,
      proven by a test that changes one field and asserts a second field's
      prior value survives untouched.
- [ ] `PATCH /user/settings` rejects negative or non-finite calorie/macro
      values with 400, before any write.
- [ ] `PATCH /user/settings` rejects an invalid `themeMode`/`motionSetting`/
      `macroUnit` value with 400.
- [ ] `PATCH /user/settings` rejects `equippedX: true` when it would newly
      turn on a slot the user hasn't unlocked, with 400 — but accepts a
      no-op PATCH that redundantly re-sends the same (locked, default-true)
      value without actually changing anything, proven by two separate
      tests (reject-on-change vs accept-on-no-op).
- [ ] `dailyCalorieGoal` writes through to the existing `users.daily_calorie_
      goal` column (proven by a direct DB read, not just the response body)
      — `GET /food/dashboard/summary`'s `goal` field reflects it immediately.
- [ ] Changing the calorie goal on the Goals & Targets screen updates
      Foxxy's mood/idle-kind on the Dashboard on the very next render, with
      no network round-trip required to see the change (proven by a test
      that changes settings context state and asserts the rendered idle
      kind / remaining-calories text updates synchronously).
- [ ] Changing theme updates all 6 identified files
      (`use-color-scheme.ts`, `use-color-scheme.web.ts`, `use-theme.ts`,
      `_layout.tsx`'s nav theme, `app-tabs.tsx` and its `.web.tsx` twin) —
      proven by tests on each, not just one, including rewritten (not just
      still-passing-by-accident) versions of the two existing
      `use-color-scheme*` tests.
- [ ] Setting `motionSetting` to `force_reduced_motion` freezes Foxxy's idle
      GIFs on a static frame regardless of the OS accessibility setting;
      `full_animations` keeps them looping even if the OS has reduce-motion
      on; `system_default` matches today's pure-OS behavior exactly.
- [ ] Unequipping an unlocked wardrobe item hides its overlay on both the
      Companion hero and the Dashboard hero (if applicable) without
      affecting its `unlocked` status — re-equipping restores it.
- [ ] Settings persist across an app restart via the local `expo-sqlite`
      cache with no visible flash/default-then-correct-value flicker
      (verified as directly as this environment allows — full "zero flash"
      claims about real device paint timing get the same honesty treatment
      as this project's prior "can't verify on real Android hardware"
      disclosures if a true visual proof isn't obtainable headlessly).
- [ ] A failed PATCH (simulated network failure) does not silently lose the
      user's change forever — some retry or visible "not saved" state
      exists, proven by a test.
- [ ] Full `npx jest --coverage` in `app/` and backend's `npm run
      test:coverage` in `backend/` stay at or above 90% on every metric and
      do not regress below current baselines (backend 99.05%/96.40%/100%;
      frontend 98.16/90.30/98/99.45, per the last merged ticket).
- [ ] `npx tsc --noEmit` shows no new errors beyond the same 3 pre-existing
      ones.

## Review

Gated-build pipeline: Sonnet build → Sonnet QA → Opus tech-lead → Opus CTO
verdict (Fable unavailable on this plan, same independence caveat noted in
every prior verdict this session). Build only after plan approval and the
user's explicit go-ahead per the ticketed-change hard gate.
