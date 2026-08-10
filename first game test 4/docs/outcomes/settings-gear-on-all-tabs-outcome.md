# Outcome: Settings gear icon on every tab, not just Companion

Ticket: `docs/tickets/006-settings-gear-on-all-tabs.md`
Plan: `docs/plans/settings-gear-on-all-tabs-plan.md`
Branch: `foxbite-settings-gear-all-tabs`

## What changed

Three files changed in `app/src/app/(tabs)/`, plus their two matching test
files. `companion.tsx` is untouched, per the plan.

### 1. `app/src/app/(tabs)/index.tsx` (Today)

- Added `useRouter` to the existing `expo-router` import (alongside
  `useFocusEffect`) and `const router = useRouter();` inside the component.
- Wrapped the existing "Sign out" `PressableScale` and a new gear
  `PressableScale` in a new `<View style={styles.headerActions}>`, so both
  sit side by side on the right of the `header` row — "Sign out" is
  unchanged in behavior, label, and relative order (still second/rightmost).
- New gear button: `onPress={() => router.push('/settings')}`,
  `testID="settings-gear-button"`, `accessibilityLabel="Settings"`,
  `style={styles.gearButton}`, `Ionicons name="settings-outline"`.
- New styles: `headerActions: { flexDirection: 'row', alignItems: 'center',
  gap: Spacing.three }`, `gearButton: { padding: Spacing.one }`.

### 2. `app/src/app/(tabs)/log.tsx` (Log)

- No new imports/hooks needed — `Ionicons`, `useRouter`, `theme`, and
  `router` were already present in this file.
- Wrapped the previously-unwrapped `eyebrow`/`title` texts in a new
  `<View>`, added a sibling gear `PressableScale`, and wrapped both in a
  new `<View style={styles.headerRow}>`.
- New styles: `headerRow: { flexDirection: 'row', alignItems: 'flex-end',
  justifyContent: 'space-between' }`, `gearButton: { padding: Spacing.one }`.
- Changed `eyebrow`'s `marginBottom` from `-8` to `2` — deliberate, in-scope
  fix per the plan: `-8` was tuned against `scrollContent`'s `gap:
  Spacing.three` (16px) applying between `eyebrow`/`title` as direct
  children of the scroll container. Wrapping them in a new `<View>` removes
  them from that direct-child relationship, so the 16px gap no longer
  applies between them — leaving `-8` in place would make the eyebrow
  overlap the title by 8px. `2` reproduces the same ~8px net visual gap
  (matches `index.tsx`'s own `eyebrow` style, which has the same
  wrapped-in-a-View relationship to its title).

### 3. `app/src/app/(tabs)/companion.tsx`

Zero diff, confirmed — not touched.

### Test files

- `app/src/app/(tabs)/__tests__/index.test.tsx`: added `const mockPush =
  jest.fn();` and extended the `expo-router` mock with `useRouter: () => ({
  push: mockPush })` (previously only mocked `useFocusEffect`, which would
  have made `useRouter()` resolve to `undefined` and crash every test once
  `index.tsx` called it). Added a new test, `'tapping the settings gear icon
  navigates to /settings'`, asserting `mockPush` is called with
  `'/settings'` after pressing `testID="settings-gear-button"`.
- `app/src/app/(tabs)/__tests__/log.test.tsx`: added `const mockPush =
  jest.fn();` and extended the existing `useRouter` mock from `{ navigate:
  mockNavigate }` to `{ navigate: mockNavigate, push: mockPush }` (the gear
  button calls `router.push`, which the old mock didn't have — pressing it
  would have thrown `router.push is not a function`). Added a matching new
  test asserting `mockPush` is called with `'/settings'`.

All three screens' gear buttons use the identical `testID`,
`accessibilityLabel`, and destination, matching `companion.tsx`'s existing
pattern exactly.

## Why

Settings was previously reachable only from the Companion tab. The user
asked for it to be reachable from every tab. Today already had a
right-hand header slot occupied by "Sign out" — the user's explicit choice
(asked directly) was to add the gear icon alongside it, not replace it.
Log had no header row at all, so one was introduced from scratch, carrying
over the necessary spacing fix so eyebrow/title don't visually collide once
wrapped.

## Automated test results

### `npx jest --coverage` (in `app/`)

**34 test suites, 305 tests, all passing** (two new tests added, one per
touched screen; the third screen, Companion, already had this coverage).

| Metric | Result | Ticket-005 baseline | Status |
|---|---|---|---|
| Statements | 98.57% | 98.56% | at/above baseline |
| Branches | 91.79% | 91.79% | at baseline |
| Functions | 98.13% | 98.11% | at/above baseline |
| Lines | 99.57% | 99.57% | at baseline |

No metric regressed; three improved fractionally due to the new tests.

### `npx tsc --noEmit`

Same 3 pre-existing errors tracked since ticket 004/005, all in files this
ticket does not touch:

```
src/components/animated-icon.tsx(150,5): error TS2698
src/components/app-tabs.web.tsx(72,15): error TS2322
src/components/ui/collapsible.tsx(22,13): error TS2322
```

No new errors. This ticket added no new route files under `app/src/app/`,
so the route-types-staleness risk noted in the project's
`run-foxbite-web` skill doesn't apply here — `router.push('/settings')` was
already the exact call `companion.tsx` used before this ticket, unchanged.

### `backend/` test suite

Not run — no backend files touched, matching the ticket's acceptance
criterion that backend coverage is unaffected.

## Live, visual, headless-browser verification

Playwright against the running dev stack (backend `:4000`, Expo web
`:8098`), signed in as `moyfarouk@gmail.com` with real Clerk email-OTP
verification completed live (not mocked/skipped) at both viewport widths.
Two independent clean verification passes were run (the second navigating
directly by URL rather than via tab-bar clicks, to rule out any
tab-click-specific artifact) — both passed identically.

### Locator-uniqueness scoping (per the tech-lead-flagged risk)

All three screens share `testID="settings-gear-button"`, and the web tab
layout does keep unfocused tab screens mounted — confirmed directly:
`gearLocator.count()` returned up to 3 (all three screens' gear buttons
present in the DOM simultaneously) depending on which tabs had been
visited. Rather than assume global uniqueness, every check iterated the
locator and filtered to `isVisible()`, asserting **exactly one** visible
match before clicking it. This held on every one of the 6
width×tab combinations in both verification passes — never 0, never >1.

### Results — all 3 tabs × both widths (narrow 430×932, wide 960×800)

| Width | Tab | Gear visible & unique | Click → `/settings` | `back()` → correct tab |
|---|---|---|---|---|
| 430×932 | Today | yes | yes | yes (`/`) |
| 430×932 | Log | yes | yes | yes (`/log`) |
| 430×932 | Companion | yes | yes | yes (`/companion`) |
| 960×800 | Today | yes | yes | yes (`/`) |
| 960×800 | Log | yes | yes | yes (`/log`) |
| 960×800 | Companion | yes | yes | yes (`/companion`) |

Every click used a **normal Playwright `.click()`** (no DOM-dispatch
workaround). Every navigation and every `back()` was confirmed via
`page.url()`.

### Visual confirmation

- **Today** (`t006r-narrow-today.png`, `t006f-narrow-today.png`): "THE DEN"
  eyebrow, "Today" title, gear icon, and "Sign out" all render correctly at
  narrow width — gear and "Sign out" sit side by side in the new
  `headerActions` row, both fully visible, not overlapping, both readable
  and independently tappable. Same at wide width.
- **Companion** (`t006r-narrow-companion.png`, `t006f-wide-companion.png`
  and others): unchanged, gear icon renders exactly as before at both
  widths, confirming the zero-diff claim held visually too.
- **Log wide (960×800)** (`t006f-wide-log.png`): "QUICK SNARE" eyebrow,
  "Log a meal" title, and the new gear icon all render correctly in the new
  `headerRow`, positioned top-right, no overlap with the nav bar or the hub
  tiles below.
- **Log narrow (430×932)**: **corrected below** — this was originally
  reported as a benign, unrelated pre-existing overflow with the gear
  "confirmed present via DOM checks despite not being visible in the
  screenshot." That framing was wrong: a tech-lead review caught, from the
  actual screenshot evidence, that the gear icon was rendering **outside
  the visible viewport** (bounding-box x ≈ 559 on a 430px-wide viewport,
  i.e. ~145px past the right edge) — not merely obscured by scroll
  position. `isVisible()` returning true and a normal `.click()` succeeding
  do not prove something is inside the viewport; both can succeed on an
  element sitting off-screen to the right, which is exactly what was
  happening here and is why the original pass's "gear confirmed
  present/clickable" claim was true but not sufficient evidence of the bug
  being harmless. See "Narrow-width Log fix (tech-lead-caught)" below for
  the root cause, the fix, and the corrected re-verification.
- No overlap with the nav bar (ticket 005's fix) was observed on any tab at
  either width, in any screenshot where the header was visible.

### Narrow-width Log fix (tech-lead-caught)

**This section replaces the original "Known limitation" writeup above**,
which incorrectly concluded the narrow-width overflow was benign. A
tech-lead review, working from the actual screenshots (not the DOM-check
summary), caught that the gear icon was rendering **outside the visible
430px viewport** — a real, user-facing bug, not a harmless scroll artifact.

**Root cause**: `log.tsx`'s outer vertical `<ScrollView
contentContainerStyle={styles.scrollContent}>` had no `style` prop of its
own — only `contentContainerStyle`. On react-native-web, with the screen's
`alignItems: 'center'` (used, same as every other screen, to center
`scrollContent` up to `MaxContentWidth` (800) on wide viewports), a
`ScrollView` given no explicit `style` sizes itself by shrink-to-fit
against its own content rather than stretching to the parent's actual
(definite, viewport-derived) width. The pre-existing "Quick Stash"
horizontal `ScrollView` (multiple `minWidth: 120` cards plus gaps) has
unclipped intrinsic content around 615px wide; with no definite width
anywhere above it to stop the propagation, that intrinsic width bubbled
all the way up through `scrollContent` and the outer `ScrollView`, capped
only by `scrollContent`'s own `maxWidth: 800` — so at a 430px viewport the
whole header row (including the new gear button, `justifyContent:
'space-between'`) rendered inside an 800px-wide box, parking the gear
~145–160px past the real right edge. Confirmed via DOM ancestor-chain
inspection: before the fix, the node carrying `scrollContent`'s styles
measured `width: 800` at a 430px viewport; the gear's bounding box was
`x ≈ 559` (off-screen). `isVisible()` and Playwright's auto-scrolling
`.click()` don't check "is this within the current viewport," so both
reported success despite the element being off-screen — which is why the
original verification pass's DOM checks looked clean.

**Fix** (`app/src/app/(tabs)/log.tsx`, Log-only, no changes to Today/
Companion or any shared component):

1. Gave the outer vertical `ScrollView` an explicit `style={styles.scroll}`
   with `scroll: { flex: 1, alignSelf: 'stretch' }` — `alignSelf: 'stretch'`
   overrides `screen`'s `alignItems: 'center'` for just this one child,
   giving the `ScrollView` a definite width equal to its parent's actual
   width instead of a shrink-to-fit one. `scrollContent`'s own `width:
   '100%', maxWidth: MaxContentWidth` can now resolve correctly against
   that definite width (`min(100%, 800)`), which is 430 on a 430px viewport
   and unchanged (still capped at 800, still centered via
   `alignSelf: 'center'`) on wide viewports — no visual change at 960px,
   confirmed by screenshot.
2. Gave the horizontal Quick Stash `ScrollView` its own explicit
   `style={styles.stashScroll}` with `stashScroll: { width: '100%',
   overflow: 'hidden' }`, in addition to its existing
   `contentContainerStyle={styles.stashRow}` — belt-and-suspenders
   containment directly at the scrolling element itself, per the
   tech-lead's suggested approach, so it can't inflate its own ancestor's
   width even if some other future change reintroduces an indefinite-width
   ancestor above it. `horizontal`, `showsHorizontalScrollIndicator=
   {false}`, and `contentContainerStyle` are unchanged — Quick Stash still
   scrolls horizontally exactly as before, just properly contained.

No changes to `eyebrow`/`title`/`headerRow`/`gearButton` styles, and no
changes to any other screen.

**Re-verification** (live, headless-browser, same running dev stack,
reusing a saved authenticated Clerk session — no new OTP sent):

- Ancestor-chain diagnostics at 430×932 after the fix: the node carrying
  `scrollContent`'s styles now measures `width: 430` (was 800);
  `document.scrollingElement` shows `scrollWidth: 441` vs. `clientWidth:
  430` — an 11px residual, consistent with a scrollbar-gutter/box-sizing
  artifact, not a layout escape.
- Gear button `boundingBox()` at 430×932: `{ x: 374, y: 116, width: 32,
  height: 34 }` — right edge at x=406, fully inside `[0, 430]`.
- Screenshot at 430×932 (`t006-fix-narrow-log.png`, read and visually
  confirmed, not just trusted from the bounding-box number): "QUICK SNARE"
  eyebrow, "Log a meal" title, and the gear icon all render at the top of
  the screen, gear fully visible in the top-right, no overlap with the nav
  bar. Quick Stash shows "QA seed item 18" and "19" fully, with a third
  card partially cut off at the right edge — confirming the row still
  overflows its container (i.e. is still horizontally scrollable) rather
  than having been shrunk or restructured; it's just now properly contained
  instead of escaping upward.
- Screenshot at 960×800 (`t006-fix-wide-log.png`) confirms no visual
  regression at the previously-passing wide width: gear at
  `boundingBox() = { x: 824, y: 116, width: 32, height: 34 }`, header and
  hub grid unchanged, Quick Stash showing 5 full cards plus a 6th cut off
  at the edge (same overflow-scroll behavior as before, just wider viewport
  fitting more cards before clipping).
- A normal Playwright `.click()` on the gear at 430×932 navigated to
  `/settings`; `page.goBack()` returned to `/log` — both confirmed via
  `page.url()`.
- `npx jest --testPathPattern tabs`: 89 tests passed (5 suites), no
  changes needed to any test file for this fix (no new imports/hooks, only
  style/JSX containment changes).
- `npx tsc --noEmit`: same 3 pre-existing errors only
  (`animated-icon.tsx`, `app-tabs.web.tsx`, `collapsible.tsx`), no new
  errors.

This is no longer deferred — it was the actual bug this ticket's own gear
icon exposed on Log at narrow widths, now fixed and re-verified, not a
pre-existing issue to file separately.

## Acceptance criteria status

- [x] `companion.tsx` — zero diff.
- [x] `index.tsx` — gear icon added alongside "Sign out"; both visible and
      independently tappable (confirmed live at both widths).
- [x] `log.tsx` — new header row with gear icon; `eyebrow`/`title` text
      properties unchanged; `eyebrow.marginBottom` changed from `-8` to
      `2` per the in-scope spacing fix.
- [x] All three tabs' gear icons use identical `testID`,
      `accessibilityLabel`, and destination.
- [x] Live headless-browser screenshots at desktop (~960px) and narrow
      (~430px) show the gear icon correctly placed on Today, Companion,
      and Log at both widths — including Log at narrow width, following
      the tech-lead-caught fix documented in "Narrow-width Log fix
      (tech-lead-caught)" above (bounding box `x=374, width=32`, fully
      inside `[0, 430]`; visually confirmed via screenshot, not just the
      bounding-box number).
- [x] A normal (non-DOM-dispatch) Playwright `.click()` on the gear icon
      succeeded from all three tabs at both widths, navigating to
      `/settings` every time, with `back()` returning to the correct tab
      every time.
- [x] Full `npx jest --coverage` in `app/` at/above the ticket-005 baseline
      on every metric (98.57%/91.79%/98.13%/99.57%).
- [x] `npx tsc --noEmit` shows no new errors beyond the same 3
      pre-existing ones tracked since ticket 005.
- [x] `npm run test:coverage` in `backend/` unaffected (not run, no
      backend files touched).

## Screenshots (scratchpad dir)

```
C:\Users\ELSAMA~1\AppData\Local\Temp\claude\C--Users-El-Samaka\16e27f89-34bf-4855-856f-d0a45b8b143f\scratchpad\
  t006-narrow-today.png / t006-narrow-companion.png       (first pass, tab-click nav, fullPage)
  t006r-narrow-today.png / t006r-narrow-companion.png     (second pass, viewport-clipped)
  t006f-narrow-today.png / t006f-narrow-companion.png     (third pass, direct URL nav + scroll reset)
  t006f-wide-today.png / t006f-wide-log.png / t006f-wide-companion.png
  t006f-diag-430-before.png / t006f-diag-430-after-reset.png   (Log-narrow overflow diagnostics)
  t006f-diag-960-before.png / t006f-diag-960-after-reset.png
  t006-fix-narrow-log.png / t006-fix-wide-log.png   (tech-lead-caught fix: post-fix re-verification, 430 and 960 widths)
```

## Not touched / out of scope (per plan)

- No shared `<ScreenHeader>` component extraction.
- `settings/index.tsx` or any other Settings screen.
- The gear icon's destination (still `/settings` on every screen).
- `app-tabs.web.tsx`/`app-tabs.tsx` (ticket 005 already fixed the layering
  bug; not touched here).
- "Sign out"'s behavior, label, or position.

## Deferred

None. The Log-screen narrow-width overflow issue originally deferred here
was re-investigated after a tech-lead review flagged it as an actual bug
(the gear rendering off-screen, not a benign pre-existing artifact) and has
been fixed and re-verified in `app/src/app/(tabs)/log.tsx` — see
"Narrow-width Log fix (tech-lead-caught)" above.
