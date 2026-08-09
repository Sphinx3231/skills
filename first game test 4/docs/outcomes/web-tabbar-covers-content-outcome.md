# Outcome: web tab bar no longer covers screen content

Ticket: `docs/tickets/005-web-tabbar-covers-content.md`
Plan: `docs/plans/web-tabbar-covers-content-plan.md`
Branch: `foxbite-web-tabbar-layering`

## What changed

Single file changed, `app/src/components/app-tabs.web.tsx`, exactly the
three edits specified in the plan (verified via `git diff --shortstat`:
1 file changed, 1 insertion(+), 2 deletions(-) — corrected during QA, which
caught this doc originally misstating the count as +2/-3):

1. **Reordered JSX inside `<Tabs>`**: `<TabList>` (nav bar) now renders
   before `<TabSlot>` (screen content), instead of after.
2. **`TabSlot`'s style changed from `{ height: '100%' }` to `{ flex: 1 }`**
   — now that the nav bar is a real flex sibling instead of an
   absolutely-positioned overlay removed from flow, `TabSlot` shares space
   with it via `flex: 1` rather than claiming the full parent height and
   overlapping the nav bar's own slice.
3. **Removed `position: 'absolute'` from `tabListContainer`** — `width:
   '100%'` was kept (per the plan, it's harmless and needed for the
   pill's centering).

No other lines changed. `CustomTabList`'s inner styles/content (branding
text, "Docs" link, `innerContainer`, `tabButtonView`, etc.),
`app-tabs.tsx` (native), and every file under `app/src/app/` are
untouched, matching the plan's explicit scope boundaries.

```diff
 export default function AppTabs() {
   return (
     <Tabs>
-      <TabSlot style={{ height: '100%' }} />
       <TabList asChild>
         <CustomTabList>
           ...
         </CustomTabList>
       </TabList>
+      <TabSlot style={{ flex: 1 }} />
     </Tabs>
   );
 }
 ...
 const styles = StyleSheet.create({
   tabListContainer: {
-    position: 'absolute',
     width: '100%',
     ...
```

## Why

`Tabs`'s root wrapper is a plain `flex: 1` `View`; ordering/positioning of
its children is entirely up to `app-tabs.web.tsx`. Before this fix, the
nav bar (`position: absolute`) was the later DOM sibling and painted
*over* `TabSlot`'s content instead of the content flowing below it —
hiding the top of every screen (visually confirmed on the Companion
screen's `"Your companion"` title and gear icon). Making the nav bar and
`TabSlot` normal-flow siblings (nav bar first, `flex: 1` `TabSlot`
second) makes the nav bar claim its own height at the top and the screen
content fill the remaining space below it, with no overlap.

## Automated test results

### `npx jest --coverage` (in `app/`)

**34 test suites, 303 tests, all passing.** Coverage:

| Metric | Result | Ticket-004 baseline | Status |
|---|---|---|---|
| Statements | 98.56% | 98.56% | at baseline |
| Branches | 91.79% | 91.79% | at baseline |
| Functions | 98.11% | 98.11% | at baseline |
| Lines | 99.57% | 99.57% | at baseline |

Identical to baseline on every metric — expected, since
`app-tabs.web.test.tsx` mocks `TabSlot`/`TabList` down to
`toBeTruthy()` and cannot exercise real layout/positioning either before
or after this fix. No automated test coverage exists for this specific
bug class; the live visual verification below is the real proof.

### `npx tsc --noEmit`

Same 3 pre-existing errors as every prior outcome doc in this repo
(`animated-icon.tsx`, `app-tabs.web.tsx`'s `SymbolView` typing,
`ui/collapsible.tsx`), same identities, only shifted by one line number
in `app-tabs.web.tsx` due to the JSX reorder (was line 71/72, still the
same `SFSymbols7_0` mismatch on the same `SymbolView` call, now at line
72 after the edit — confirmed this is the pre-existing issue, not a new
one):

```
src/components/animated-icon.tsx(150,5): error TS2698
src/components/app-tabs.web.tsx(72,15): error TS2322
src/components/ui/collapsible.tsx(22,13): error TS2322
```

No new errors introduced.

### `backend/` test suite

Not run — this ticket touches no backend files, per the plan's
acceptance criteria (backend coverage is unaffected because there is no
backend change to affect).

## Live, visual, headless-browser verification

Playwright, signed in as `moyfarouk@gmail.com` against the running dev
stack (backend on port 4000, Expo web on port 8098). Full sign-in
including Clerk email OTP was completed live (real code relayed
mid-session, not skipped/mocked).

### Narrow width (430×932)

Navigated to `/companion`, waited ~3.5s past page load for
`AnimatedSplashOverlay` to fully dismiss before screenshotting.

**Screenshot: `t005-02-narrow-companion.png`** (scratchpad dir) —
visually confirmed: the nav bar ("Expo Starter" / Today / Log / Companion
/ Docs) occupies its own band at the very top, and immediately below it,
fully visible with no overlap, sits the "Your companion" heading and the
gear icon to its right. Nothing is hidden underneath the nav bar.

Clicked the gear button with a **normal Playwright `.click()`**
(`page.locator('[data-testid="settings-gear-button"]').click()` — no
DOM-dispatch bypass): succeeded without needing any occlusion workaround,
navigating to `http://localhost:8098/settings`.
**Screenshot: `t005-03-narrow-settings.png`** shows the Settings list
(Goals & Targets / Appearance & Theme / Wardrobe) rendering correctly.
Clicked the back button (also a normal `.click()`): returned to
`/companion` successfully (`t005-04-narrow-back-to-companion.png`).

### Wide/desktop width (960×800)

Same navigation and same splash-dismissal wait, at the width the original
bug report was observed at.

**Screenshot: `t005-05-wide-companion.png`** — visually confirmed: same
result as narrow width. The nav bar sits in its own band at the top; the
"Your companion" title and gear icon are fully visible directly below it,
not overlapped. This is the specific regression the ticket was filed
against, and it is fixed.

Normal `.click()` on the gear button succeeded again, navigating to
`/settings` (`t005-06-wide-settings.png`, showing the same Settings list
correctly rendered at this width), and the back button returned to
`/companion` (`t005-07-wide-back-to-companion.png`).

### Regression check against ticket 004's narrow-width screenshots

Compared `t005-02-narrow-companion.png` against ticket 004's prior
`n04-companion.png`/`q04-companion.png` (present in the scratchpad): the
nav bar's pill styling, centering, and tab highlighting are visually
unchanged at this width — only the vertical position of the screen
content relative to the nav bar changed (now flush below it instead of
partially hidden under it, since ticket 004's own screenshots were
themselves taken via the DOM-dispatch workaround and did not surface this
overlap either). No visual regression introduced by this fix.

### Log screen scroll behavior

Navigated to `/log` at 960×800 and confirmed the nav bar's bounding box
before/after a `mouse.wheel(0, 1200)` scroll attempt was unchanged
(`t005-08-log-top.png`, `t005-09-log-scrolled.png`) — but this comparison
turned out to be inconclusive on its own: at that viewport, and in this
fresh trial account's current state (0 logged meals, no history to
render), the Log screen's entire content (header + the four Quick Snare
action cards) fits within the viewport with room to spare, so there was
nothing to scroll and the wheel event had no effect either way.

Re-tested with a deliberately short viewport (500×420) signed in fresh —
still no measurable overflow was found via a DOM scan for elements with
`scrollHeight > clientHeight` (`t005-12-log-short-vp-top.png` shows the
content ending almost exactly at the viewport edge with no scrollbar).
This account's Log screen content is simply too short to force genuine
overflow-scrolling through the UI in its current (empty) state, even at
a fairly aggressive viewport height.

Given that, this specific plan risk item is verified **structurally
instead of empirically**: `app/src/app/(tabs)/log.tsx:299` wraps the
screen's own content in `<ScrollView contentContainerStyle=
{styles.scrollContent}>`, entirely nested inside `TabSlot`'s `flex: 1`
box. The nav bar (`TabList`) is `TabSlot`'s sibling one level up, outside
that `ScrollView` — it has no `position` override at all (now static, in
normal flow) and is not a descendant of the screen's `ScrollView`, so it
structurally cannot be scrolled by that `ScrollView`'s own scrolling.
This matches the plan's expected structure (`Tabs`'s root `View` is not
itself scrollable; only each screen's own inner `ScrollView` scrolls).
Stated plainly: the mechanism that keeps the nav bar fixed was confirmed
by code inspection, not by watching it hold still under real scrolling,
because this test account currently has too little content to produce
real scrolling on this screen.

**Update — closed by QA's independent verification pass**: QA seeded 25
real food-log entries via `POST /food/logs` using the signed-in session's
own Clerk token, then forced a short (500×350) viewport to produce genuine
measured overflow (`scrollHeight 446` vs. `clientHeight 276`). A real
wheel-scroll moved the content (`scrollTop` 0→170), while the nav bar's
anchor element held an **identical** pixel position (`top:27,
left:420.6875`) before and after. This is now a full empirical pass, not
just the structural read above — see QA's report for its own screenshots.

## Acceptance criteria status

- [x] `app-tabs.web.tsx`: `TabList`/`CustomTabList` renders before
      `TabSlot`; `TabSlot`'s style is `{ flex: 1 }`;
      `tabListContainer`'s `position: 'absolute'` removed.
- [x] `app-tabs.tsx` (native) untouched.
- [x] `CustomTabList`'s branding text, "Docs" link, and inner styles
      untouched — diff shows only the two layout-property changes plus
      the reorder.
- [x] No changes to any file under `app/src/app/`.
- [x] Live headless-browser screenshot at desktop width (~960px) shows
      `"Your companion"` and the gear icon fully visible, not overlapped.
- [x] Live headless-browser screenshot at mobile-emulation width
      (~430px) shows the same, no visual regression vs. ticket 004.
- [x] A normal (non-DOM-dispatch) Playwright `.click()` on the gear
      button succeeded at both widths.
- [x] Scrolling the Log screen keeps the nav bar fixed at the top —
      confirmed structurally by this document's own author, then closed
      to a full empirical pass by QA (seeded 25 log entries to force real
      overflow, measured the nav bar's pixel position was unchanged across
      an actual scroll).
- [x] Full `npx jest --coverage` in `app/` at baseline
      (98.56%/91.79%/98.11%/99.57%) on every metric.
- [x] `npx tsc --noEmit` shows no new errors beyond the same 3
      pre-existing ones tracked since ticket 004.
- [x] `backend/` test suite unaffected (not touched, no backend files
      changed).

## Screenshots (scratchpad dir)

```
C:\Users\ELSAMA~1\AppData\Local\Temp\claude\C--Users-El-Samaka\16e27f89-34bf-4855-856f-d0a45b8b143f\scratchpad\
  t005-00-after-password.png
  t005-01-after-verify.png
  t005-02-narrow-companion.png        (narrow width, companion — title/gear visible)
  t005-03-narrow-settings.png         (narrow width, settings after normal click)
  t005-04-narrow-back-to-companion.png
  t005-05-wide-companion.png          (wide width, companion — title/gear visible)
  t005-06-wide-settings.png           (wide width, settings after normal click)
  t005-07-wide-back-to-companion.png
  t005-08-log-top.png / t005-09-log-scrolled.png       (960x800, no overflow)
  t005-12-log-short-vp-top.png / t005-13-log-short-vp-scrolled.png  (500x420, no overflow)
```

## Not touched / out of scope (per plan)

- `CustomTabList`'s "Expo Starter" branding and "Docs" external link.
- `app-tabs.tsx` (native `NativeTabs`).
- Any individual screen file.
- Backend.

## Deferred

None. The one gap this document originally deferred (a fully empirical
Log-screen scroll proof) was closed during QA's independent pass — see
the "Update" note above.
