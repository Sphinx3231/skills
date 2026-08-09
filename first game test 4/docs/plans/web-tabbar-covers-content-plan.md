# Plan: stop the web tab bar from covering screen content

Ticket: `docs/tickets/005-web-tabbar-covers-content.md`
Branch: `foxbite-web-tabbar-layering` (isolated from `main`, gated-build
pipeline combined with ticketed-change tracking).

## Context

Confirmed live, in a genuinely fresh Incognito browser window (ruling out
any browser-cache explanation) and confirmed against the actual served dev
bundle (ruling out a stale-bundle explanation — `settings-gear-button` and
`Your companion` are both present in the current bundle): the Companion
screen's `"Your companion"` title and its Settings gear icon render, but
are visually hidden underneath the "Expo Starter" web nav bar. A real user
cannot see or click either.

**Root cause**: `app/src/components/app-tabs.web.tsx`:

```tsx
export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />       {/* screen content, 1st in DOM */}
      <TabList asChild>
        <CustomTabList>...</CustomTabList>           {/* nav bar, 2nd in DOM */}
      </TabList>
    </Tabs>
  );
}

// ...
const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    ...
  },
  ...
});
```

`Tabs`'s root wrapper (`expo-router/build/ui/Tabs.js`) is a plain
`flex: 1` `View` — it imposes no layout contract of its own; ordering and
positioning are entirely up to `app-tabs.web.tsx`. `TabSlot` renders at
`height: '100%'`, and `CustomTabList`'s outer wrapper is
`position: 'absolute'`. Being the later DOM sibling, the absolutely
positioned nav bar paints *over* `TabSlot`'s content instead of the
content flowing below it. Every screen's own top content — currently
Companion's header row, but this would affect any future screen too —
sits exactly where the nav bar visually overlaps.

Confirmed this is web-only: `app-tabs.tsx` (native) uses
`expo-router/unstable-native-tabs`'s `NativeTabs`, a platform-native tab
bar with no equivalent absolute-overlay behavior — out of scope, not
touched.

## Why this predates and outlived tickets 003/004

This layering bug is not something either prior ticket introduced — it is
a pre-existing characteristic of `app-tabs.web.tsx` (confirmed no git
history evidence of an intentional overlay design; reads as an
unaddressed side effect of a `position: absolute` originally chosen to
make the tab bar look like a floating pill over content on scroll,
without accounting for content starting flush at the top). It became a
functional blocker only once Settings needed a gear icon reachable at the
very top of a screen. During ticket 004's own verification, the pipeline's
Playwright script hit this exact overlay as a click-target interception
(diagnosed at the time as the "Docs" external link intercepting the
gear-button click) and worked around it with a DOM-level `click()`
dispatch — which bypasses the same occlusion check that would also tell a
human "you can't see or click this." The workaround correctly solved the
*automation's* problem but incidentally hid the *human's* problem from the
pipeline entirely.

## The fix

Change `app-tabs.web.tsx` so the nav bar and the screen content are
**normal-flow siblings**, not an overlay:

```tsx
export default function AppTabs() {
  return (
    <Tabs>
      <TabList asChild>
        <CustomTabList>...</CustomTabList>
      </TabList>
      <TabSlot style={{ flex: 1 }} />
    </Tabs>
  );
}
```

- Reorder: `TabList` (the nav bar) first, `TabSlot` (the screen content)
  second — so in `Tabs`'s default flex-column layout, the nav bar claims
  its own natural height at the top, and `TabSlot` fills the remaining
  space below it.
- Change `TabSlot`'s style from `height: '100%'` to `flex: 1` — `height:
  '100%'` measured against the `Tabs` root's `flex: 1` container was only
  correct when `TabSlot` was the sole flex participant (with the nav bar
  removed from flow via `position: absolute`); once the nav bar becomes a
  real flex sibling, `TabSlot` needs to share space via `flex: 1`, not
  claim 100% of the parent's height and overflow/overlap the nav bar's own
  slice.
- In `CustomTabList`'s `tabListContainer` style, remove
  `position: 'absolute'`. Keep `width: '100%'` (needed for the
  `justifyContent: 'center'` centering behavior of the inner pill to still
  span the full width) — audit whether removing `position: absolute`
  changes how `width: '100%'` resolves (it should now measure against the
  nav bar's own normal-flow box, same numeric result, but confirm visually
  rather than assuming).
- Do **not** touch `CustomTabList`'s inner styles (`innerContainer`,
  `tabButtonView`, `brandText`, `externalPressable`) or its content (the
  "Expo Starter" branding text, the "Docs" link) — ticket 005 is scoped to
  the layering bug only, per the ticket's own "explicitly out of scope"
  section.
- Do **not** touch `app-tabs.tsx` (native) — no equivalent bug exists
  there.
- Do **not** touch any individual screen (`(tabs)/index.tsx`, `log.tsx`,
  `companion.tsx`, or the `settings/*.tsx` screens) — the fix is centralized
  in the shared tab-bar component specifically so no per-screen top-padding
  workaround is needed, now or for any future screen.

## Risk / things to double check during implementation

- **Scroll behavior**: with the nav bar now in normal flow, does the
  overall page still scroll correctly (nav bar fixed at top of the flex
  column while `TabSlot`'s own internal `ScrollView`s scroll within their
  `flex: 1` box), or does removing `position: absolute` cause the nav bar
  itself to scroll away with the page? `Tabs`'s root `View` is not itself
  scrollable (no `ScrollView` wrapper there), and each screen's own content
  is wrapped in its own `ScrollView` inside `SafeAreaView` — so the nav bar
  sitting in normal flow above a `flex: 1` `TabSlot` should behave like a
  fixed header with independently scrolling content below it, matching the
  likely original intent. Confirm this visually (scroll down on a long
  screen like Log, verify the nav bar stays put and doesn't scroll off).
- **`SafeAreaView`'s top inset**: each screen already wraps its own content
  in a `SafeAreaView` for iOS/Android notch handling. On web, this
  typically resolves to zero top inset (no notch), so no double-spacing is
  expected — confirm no unwanted extra gap appears between the nav bar and
  a screen's content on web specifically.
- **`MaxContentWidth` centering**: confirm the nav bar's centered pill
  still visually centers correctly at both narrow (mobile emulation,
  ~430px) and wide (desktop, ~960px+) viewport widths — the bug report that
  triggered this ticket was specifically observed at desktop width, but the
  fix must not regress the narrow-viewport layout that ticket 004's
  Playwright tests already exercised successfully.

## Verification (the actual point of this ticket)

Unlike ticket 004 (where a DOM-dispatch click bypassed the exact
occlusion problem being fixed here), this ticket's verification must
prove the content is **visually** above the fold, not just clickable via
a workaround:

1. Real signed-in headless-browser session (Playwright, Clerk sign-in,
   credentials as used in prior tickets), at **two viewport widths**:
   narrow (~430×932, matching ticket 004's prior tests) and wide
   (~960×800 or larger, matching the width at which this bug was actually
   observed).
2. At each width, navigate to the Companion screen and take a screenshot.
   Visually confirm (by reading the screenshot, not just checking a
   `data-testid` locator exists in the DOM) that `"Your companion"` and
   the gear icon are fully visible below the nav bar, not overlapped by
   it.
3. Use a **normal** Playwright `.click()` (not a DOM-dispatch bypass) on
   the gear button and confirm it succeeds without needing any occlusion
   workaround — this is the actual regression test for the bug class: if
   the overlay returns, a normal click should start failing again the way
   it did during ticket 004's investigation.
4. Confirm navigation into `/settings` still works after this (should be
   unaffected, since ticket 004's routing fix is untouched by this
   ticket) — reuse, don't re-litigate, ticket 004's own verification depth
   for the routing behavior itself.
5. Scroll down on the Log screen (has the most content) and confirm the
   nav bar stays fixed at the top rather than scrolling away, per the risk
   note above.
6. Re-check the narrow-viewport screenshot against a prior ticket 004
   screenshot (if still available in the scratchpad) to confirm no visual
   regression at that width.
7. **Screenshot timing gotcha** (per a tech-lead review): the root
   layout's `AnimatedSplashOverlay` is an absolutely positioned splash
   screen that transiently covers content while fonts load, mounted
   outside `Tabs` entirely (in `app/src/app/_layout.tsx`, unrelated to and
   unaffected by this ticket's fix). Screenshotting before it dismisses
   would read as a false layering regression. Wait for it to finish (a
   short, bounded delay after page load — confirm visually that the splash
   is gone before treating a screenshot as evidence either way).

## Acceptance criteria

- [ ] `app-tabs.web.tsx`: `TabList`/`CustomTabList` renders before
      `TabSlot` in JSX order; `TabSlot`'s style is `{ flex: 1 }` (not
      `height: '100%'`); `tabListContainer`'s `position: 'absolute'` is
      removed.
- [ ] `app-tabs.tsx` (native) is untouched.
- [ ] `CustomTabList`'s branding text, "Docs" link, and all other inner
      styles are untouched — diff should show only the two layout-property
      changes above (plus, if needed, the reorder).
- [ ] No changes to any file under `app/src/app/` (screens/layouts) — the
      fix is fully contained in `app-tabs.web.tsx`.
- [ ] A live, headless-browser screenshot at desktop width (~960px+) shows
      `"Your companion"` and the gear icon fully visible, not overlapped by
      the nav bar.
- [ ] A live, headless-browser screenshot at mobile-emulation width
      (~430px) shows the same, with no visual regression from ticket 004's
      prior screenshots.
- [ ] A **normal** (non-DOM-dispatch) Playwright `.click()` on the gear
      button succeeds at both widths.
- [ ] Scrolling the Log screen keeps the nav bar fixed at the top.
- [ ] Full `npx jest --coverage` in `app/` stays at or above the ticket
      004 baseline (98.56%/91.79%/98.11%/99.57%) on every metric.
      `app/src/components/__tests__/app-tabs.web.test.tsx` does exist (a
      tech-lead review confirmed it), but it's already excluded from
      coverage (`package.json`) and mocks `TabSlot`/`TabList` down to
      `toBeTruthy()` assertions — it cannot catch a layering regression
      either way, so this fix still has no automated coverage. Note that
      plainly rather than inventing a shallow test to claim otherwise; the
      live-screenshot checks above are the real verification for this
      ticket.
- [ ] `npx tsc --noEmit` shows no new errors beyond the same pre-existing
      ones already tracked in ticket 004's outcome doc.
- [ ] `npm run test:coverage` in `backend/` is unaffected (this ticket
      touches no backend files).

## Review

Full gated-build pipeline: Sonnet build → Sonnet QA (redoing the live
visual verification independently, per the ticket 004 lesson that a
single unverified pipeline stage's claim isn't trustworthy without
independent re-proof) → Opus tech-lead → Opus CTO verdict (Fable
unavailable on this plan, same independence caveat noted in every prior
verdict this session). Build only after plan approval and the user's
explicit go-ahead.
