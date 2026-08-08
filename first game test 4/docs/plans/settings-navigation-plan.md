# Plan: make Settings actually reachable (root navigator restructure)

Ticket: `docs/tickets/004-settings-navigation-unreachable.md`
Branch: `foxbite-settings-navigation` (isolated from `main`, gated-build
pipeline combined with ticketed-change tracking).

## Context

Confirmed live, in a real signed-in browser session (not guessed): tapping
the Companion screen's gear icon calls `router.push('/settings')`
(`app/src/app/companion.tsx:83`), but the destination silently falls back
to the Today dashboard. All 4 settings screens
(`app/src/app/settings/{index,goals,appearance,wardrobe}.tsx`) are
individually correct and individually tested — this is purely a navigator
wiring gap, not a screen-content bug.

**Root cause**: `app/src/app/_layout.tsx`'s `Root()` renders `<AppTabs />`
directly when signed in:

```tsx
return isSignedIn ? <AppTabs /> : <SignInScreen />;
```

`AppTabs` (`app/src/components/app-tabs.tsx`) wraps
`expo-router/unstable-native-tabs`'s `NativeTabs`, declaring exactly 3
`<NativeTabs.Trigger>` entries: `index`, `log`, `companion`. Since nothing
wraps `AppTabs` in a `Stack`, `NativeTabs` becomes the *entire* router for
the signed-in app, and it structurally cannot resolve any route it hasn't
declared a trigger for — `/settings` has nowhere to go.

This is the **first** introduction of both a `<Stack>` navigator and an
Expo Router `(group)` folder in this codebase (confirmed zero existing
precedent) — there is no existing pattern here to copy; every piece of
this plan is written from scratch and needs correspondingly careful review.

## Why this escaped ticket 003's entire pipeline

Every existing test renders a screen component directly
(`render(<GoalsScreen />)`), which proves the screen's own logic works but
never mounts the real `_layout.tsx`/`AppTabs`/router tree the way an actual
app launch does. Component-level tests cannot catch a navigator wiring gap
by construction. **This ticket's acceptance criteria therefore require a
real, live click-through** (headless browser through actual Clerk
sign-in, clicking the real gear icon, landing on the real settings screen)
at every review stage, not just unit tests staying green — a lesson from
this exact gap, not a hypothetical.

## The fix

Standard Expo Router pattern for "tabs + a pushable screen outside the
tabs": move the 3 tab screens into a route group, wrap everything in a
root `Stack`.

### 1. New route group: `app/src/app/(tabs)/`

Move (not copy — delete the originals after moving):
- `app/src/app/index.tsx` → `app/src/app/(tabs)/index.tsx`
- `app/src/app/log.tsx` → `app/src/app/(tabs)/log.tsx`
- `app/src/app/companion.tsx` → `app/src/app/(tabs)/companion.tsx`
- Their test files (`app/src/app/__tests__/{index,log,companion}.test.tsx`)
  move alongside them to `app/src/app/(tabs)/__tests__/` — confirmed via
  investigation that all three import their screen by relative path
  (`import DashboardScreen from '../index'` etc.), so moving the tests
  with the screens preserves the relative import unchanged. Do **not**
  rewrite these to `@/` absolute imports as part of this move — that's an
  unrelated style change and this ticket should touch as few lines inside
  these files as possible to keep the diff reviewable.
- New `app/src/app/(tabs)/_layout.tsx`: renders the existing `AppTabs`
  component unchanged (`export default function TabsLayout() { return
  <AppTabs />; }` or equivalent) — `AppTabs`/`AppTabs.web` themselves need
  **zero internal changes**: route groups are transparent to URLs, so
  `NativeTabs.Trigger name="index"` still resolves to `/`, `name="log"` to
  `/log`, `name="companion"` to `/companion`, exactly as today. Confirmed
  via investigation — do not "fix" anything inside `app-tabs.tsx` or
  `app-tabs.web.tsx` as part of this ticket.
- Add `!src/app/**/_layout.tsx` to `package.json`'s jest
  `collectCoverageFrom` ignore list, **replacing** the existing
  `!src/app/_layout.tsx` single-file exclusion — a tech-lead review of this
  plan verified empirically (via this repo's own `jest-util`
  `globsToMatcher`) that a literal `!src/app/(tabs)/_layout.tsx` entry does
  **not** work: micromatch parses the parenthesized `(tabs)` as a regex
  group, so the negation silently fails to match and the file lands
  uncovered anyway. The glob form `!src/app/**/_layout.tsx` correctly
  excludes `_layout.tsx` at any depth, which also covers the new
  `settings/_layout.tsx` added in the next section — one glob change
  handles both new layout files without hardcoding the parenthesized path.

### 1b. New `app/src/app/settings/_layout.tsx` (required — not optional)

A tech-lead review of this plan's first draft caught a real blocker here:
without a `_layout.tsx` inside `settings/`, Expo Router **flattens the
folder into the parent navigator** as four separate top-level-feeling
routes (`settings/index`, `settings/goals`, `settings/appearance`,
`settings/wardrobe`) — there is no route actually named `settings` for a
`<Stack.Screen name="settings" />` in the root layout to reference, and
declaring one anyway throws at runtime ("No route named 'settings' exists
in nested children"). Fix: add
`app/src/app/settings/_layout.tsx` rendering its own nested
`<Stack screenOptions={{ headerShown: false }} />` with
`export const unstable_settings = { anchor: 'index' };` — this also gives
the 4 settings screens real push semantics between each other (Settings
list → Goals → back → Settings list), not just a single flattened screen.
The nested anchor matters for the same reason as the root one: without it,
a hard refresh on `/settings/goals` (or `appearance`/`wardrobe`) leaves an
empty back stack *within* the settings Stack, so `router.back()` on that
screen lands nowhere useful instead of returning to the Settings list —
per a tech-lead review, the root anchor alone only guarantees correct
`back()` behavior when refreshing on `/settings` itself.

### 2. Root `_layout.tsx` becomes a `Stack`

`Root()` changes from directly rendering `<AppTabs />` to:

```tsx
import { Stack } from 'expo-router';

export const unstable_settings = { anchor: '(tabs)' };

function Root() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  registerApiTokenGetter(getToken);

  if (!isLoaded) return null;
  if (!isSignedIn) return <SignInScreen />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
```

**`unstable_settings = { anchor: '(tabs)' }` is required, not decorative.**
Another blocker a tech-lead review caught: without an anchor, a hard
refresh or a deep link landing directly on `/settings` produces an empty
back stack — every settings screen's own `router.back()` (see below) then
becomes a dead no-op with no tab bar to return to, since there's nothing
behind it to pop to. The anchor guarantees `(tabs)` is always underneath
`settings` in the stack, refresh or not.

`headerShown: false` at the `Stack` level is **confirmed safe, not just
assumed** — a tech-lead review checked the actual settings screen code
(not just the plan's prose) and found all four already render their own
in-content back affordance calling `router.back()`:
`settings/index.tsx` (`testID="settings-back-button"`), `settings/goals.tsx`,
`settings/appearance.tsx`, `settings/wardrobe.tsx` all have one. Expo
Router's default stack header would only ever have been a duplicate, never
the only way back. This is now a closed question, not an implementation-
time check — no further verification of this specific point is needed.

`sign-in.tsx` needs **no changes** — it stays a plain conditional render
above the `Stack`, exactly as today (confirmed via investigation: the two
different signed-in-gating mechanisms — this manual conditional vs.
file-based routing recognizing `/sign-in` as a real route — are pre-existing
and orthogonal to this fix; not something this ticket needs to reconcile).

### 3. `settings/` folder itself is untouched

`app/src/app/settings/{index,goals,appearance,wardrobe}.tsx` and their
tests stay exactly where they are and exactly as they are — confirmed via
investigation that every `router.push('/settings...')` call and every test
asserting on those path strings (`companion.test.tsx:245-253`,
`settings/__tests__/index.test.tsx:41-42`) is completely unaffected by
this restructure, since `settings` remains a top-level Stack screen; only
its *sibling* (the tabs) moves one level deeper into a group.

## Verification (the actual point of this ticket)

Given the root cause was invisible to every existing automated test, this
ticket's own review must not repeat that mistake:

1. **Full test suites must stay green** — `npx jest --coverage` in `app/`,
   `npm run test:coverage` in `backend/` (backend is untouched by this
   ticket; confirming it stays green is a cheap sanity check, not the
   focus). Frontend baseline to hold or beat:
   98.56%/91.79%/98.11%/99.57% (current, after the two prior hotfixes).
2. **`npx tsc --noEmit`** — same 3 pre-existing errors, no new ones.
   Explicitly re-check after starting the dev server at least once post-move
   (per the `run-foxbite-web` skill's now-documented lesson: Expo Router's
   generated route types are stale until the dev server regenerates them,
   and this ticket moves route files, which is exactly the trigger case).
3. **A real live click-through is mandatory, not optional**, using the
   `run-foxbite-web` skill: start both servers fresh, sign in via headless
   browser through actual Clerk auth (ask the user for credentials — no
   seeded test account exists), click the real gear icon on the real
   Companion screen, screenshot the result and **confirm it is the Settings
   list screen**, not the Today dashboard. Then navigate into each of
   Goals/Appearance/Wardrobe from that screen (not just direct URL
   `page.goto`, since that bypasses testing whether the settings list
   screen's own navigation links work) and screenshot each. This must be
   done by the Sonnet builder AND independently re-done by QA — a repeat of
   this exact click-through is the actual acceptance test for this ticket,
   not a nice-to-have.
4. **The click-through must also include a hard-refresh-then-back step,
   not just forward navigation.** A tech-lead review flagged that the
   forward-only flow above cannot catch a missing/broken `anchor` (item 2
   above) — refreshing the browser while on `/settings` (or any of its
   sub-screens) and then pressing the in-content back button is the only
   way to prove the anchor actually works, since only a refresh clears the
   in-memory navigation history and forces the anchor to matter.
5. **Native-platform tab bar behavior is out of scope for headless
   verification** (no iOS/Android simulator in this environment,
   consistent with every prior ticket's disclosed limitation) — but the
   `(tabs)/_layout.tsx` change must not alter `AppTabs`'s own code, which is
   the strongest available assurance that native tab bar rendering is
   unaffected. **Also state plainly in the outcome doc that web and native
   use genuinely different tab navigators** (`app-tabs.tsx`'s `NativeTabs`
   vs. `app-tabs.web.tsx`'s `expo-router/ui` `Tabs`/`TabSlot`, per a
   tech-lead review) — headless verification exercises only the web one,
   so native tab-bar-plus-Stack interaction is asserted by code-reading
   (unchanged `AppTabs` internals) rather than observed directly.

## Explicitly out of scope

- **`app-tabs.web.tsx`'s hardcoded "Expo Starter" branding and "Docs" link**
  (`CustomTabList`, found during this ticket's investigation) — leftover
  Expo starter-template boilerplate, cosmetically confusing (it's what made
  the broken-navigation screenshot look even more like something foreign
  was rendering) but functionally unrelated to the navigation bug itself.
  Worth a follow-up ticket; not fixed here to keep this diff focused on the
  actual routing fix.
- Re-litigating whether Settings should be a bottom tab vs. a gear-icon
  push — ticket 003 already made that call with the user; this ticket only
  makes the existing design actually work.
- Any change to `AppTabs`/`AppTabs.web`'s internals, per the investigation's
  finding that route groups are URL-transparent and neither file needs to
  change.
- Any change to `sign-in.tsx` or the dual auth-gating mechanism noted above.

## Acceptance criteria

- [ ] `app/src/app/(tabs)/{index,log,companion}.tsx` exist with their
      original content unchanged (a pure file move, confirmed via diff
      showing only the path changed, not the content).
- [ ] `app/src/app/(tabs)/__tests__/{index,log,companion}.test.tsx` exist
      and pass unchanged (same move-not-edit standard).
- [ ] `app/src/app/(tabs)/_layout.tsx` exists, rendering `AppTabs`, and
      `package.json`'s jest `collectCoverageFrom` exclusion list has its
      old `!src/app/_layout.tsx` entry replaced with `!src/app/**/_layout.tsx`
      (verified to actually match, unlike a literal `(tabs)` path entry
      which micromatch mis-parses as a regex group).
- [ ] `app/src/app/settings/_layout.tsx` exists, rendering its own nested
      `<Stack screenOptions={{ headerShown: false }} />` with
      `unstable_settings = { anchor: 'index' }`, so `settings` resolves as
      a single addressable route (not flattened into 4 disconnected
      top-level routes) and a refresh on any settings sub-screen still has
      a working back stack.
- [ ] `app/src/app/_layout.tsx`'s `Root()` renders a `Stack` with
      `(tabs)` and `settings` as its two screens when signed in, and
      exports `unstable_settings = { anchor: '(tabs)' }`; `sign-in.tsx`
      rendering is unchanged.
- [ ] A live, headless-browser click-through (not `page.goto` directly to
      `/settings`) — sign in, tap the real gear icon, land on the real
      Settings list screen, tap into Goals/Appearance/Wardrobe from there,
      then hard-refresh on **both** `/settings` and a sub-screen (e.g.
      `/settings/goals`) and confirm the in-content back button still
      works on each (the root anchor only covers the former; the nested
      `settings/_layout.tsx` anchor only covers the latter) — is performed
      and
      screenshotted by both the builder and QA independently, with the
      screenshots showing actual settings UI, not the Today dashboard.
- [ ] Full `npx jest --coverage` in `app/` stays at or above the current
      baseline (98.56%/91.79%/98.11%/99.57%) on every metric.
- [ ] `npx tsc --noEmit` (checked **after** starting the dev server at
      least once post-move, to force route-type regeneration) shows no new
      errors beyond the same 3 pre-existing ones.
- [ ] `npm run test:coverage` in `backend/` is unaffected (this ticket
      touches no backend files) — run once as a sanity check, not expected
      to show any diff.

## Review

Full gated-build pipeline: Sonnet build → Sonnet QA → Opus tech-lead →
Opus CTO verdict (Fable unavailable on this plan, same independence caveat
noted in every prior verdict this session). Build only after plan approval
and the user's explicit go-ahead per the ticketed-change hard gate.
