# Plan: Settings gear icon on every tab, not just Companion

Ticket: `docs/tickets/006-settings-gear-on-all-tabs.md`
Branch: `foxbite-settings-gear-all-tabs` (isolated from `main`, gated-build
pipeline combined with ticketed-change tracking).

## Context

The gear icon currently only exists on Companion's header row
(`app/src/app/(tabs)/companion.tsx:78-90`):

```tsx
<View style={styles.headerRow}>
  <ThemedText type="title" style={styles.title}>
    Your companion
  </ThemedText>
  <PressableScale
    onPress={() => router.push('/settings')}
    hitSlop={8}
    scaleTo={0.9}
    testID="settings-gear-button"
    accessibilityLabel="Settings"
    style={styles.gearButton}>
    <Ionicons name="settings-outline" size={24} color={theme.textSecondary} />
  </PressableScale>
</View>
```

`headerRow`/`gearButton` styles: `headerRow: { flexDirection: 'row',
alignItems: 'center', justifyContent: 'space-between' }`,
`gearButton: { padding: Spacing.one }`.

Today (`app/src/app/(tabs)/index.tsx:111-125`) already has a header row,
with a different right-hand item:

```tsx
<View style={styles.header}>
  <View>
    <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
      THE DEN
    </ThemedText>
    <ThemedText type="title" style={styles.title}>
      Today
    </ThemedText>
  </View>
  <PressableScale onPress={() => signOut()} hitSlop={8} scaleTo={0.9}>
    <ThemedText type="link" themeColor="textSecondary">
      Sign out
    </ThemedText>
  </PressableScale>
</View>
```

`header` style: `{ flexDirection: 'row', alignItems: 'flex-end',
justifyContent: 'space-between', marginBottom: Spacing.two }`.

Log (`app/src/app/(tabs)/log.tsx:299-305`) has no header row at all —
just two stacked, non-rowed `ThemedText`s:

```tsx
<ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
  QUICK SNARE
</ThemedText>
<ThemedText type="title" style={styles.title}>
  Log a meal
</ThemedText>
```

(A second, unrelated `"title"`-styled `ThemedText` exists later in the
same file at line ~618, inside a separate paywall-screen component
rendered only when the free trial has expired — not this screen's header,
out of scope, not touched.)

**User's explicit decision** (asked directly, since Today's header
already has an item in the gear icon's natural slot): add the gear icon
**alongside** "Sign out" on Today, not replacing it. No change to sign-out
behavior or its own placement/label.

## The fix

Three screens change; no shared component extraction (see "Deliberately
not doing" below for why).

### 1. `app/src/app/(tabs)/companion.tsx` — unchanged

Already has the gear icon. Not touched by this ticket, included here only
for cross-reference; the diff for this ticket should show zero changes
to this file.

### 2. `app/src/app/(tabs)/index.tsx` — add gear icon alongside Sign out

```tsx
<View style={styles.header}>
  <View>
    <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
      THE DEN
    </ThemedText>
    <ThemedText type="title" style={styles.title}>
      Today
    </ThemedText>
  </View>
  <View style={styles.headerActions}>
    <PressableScale
      onPress={() => router.push('/settings')}
      hitSlop={8}
      scaleTo={0.9}
      testID="settings-gear-button"
      accessibilityLabel="Settings"
      style={styles.gearButton}>
      <Ionicons name="settings-outline" size={24} color={theme.textSecondary} />
    </PressableScale>
    <PressableScale onPress={() => signOut()} hitSlop={8} scaleTo={0.9}>
      <ThemedText type="link" themeColor="textSecondary">
        Sign out
      </ThemedText>
    </PressableScale>
  </View>
</View>
```

- Needs `useRouter` imported from `expo-router` (not currently imported in
  this file — `useFocusEffect` already is, add `useRouter` to the same
  import) and a `const router = useRouter();` line added inside the
  component (verified: not currently present). `Ionicons` and `theme`
  (`useTheme()`) are already imported/instantiated in this file — no new
  import needed for either.
- New style: `headerActions: { flexDirection: 'row', alignItems: 'center',
  gap: Spacing.three }` — wraps both actions so they sit side by side
  without disturbing `header`'s existing `justifyContent: 'space-between'`
  (the `View` on the left with eyebrow+title vs. this new wrapper on the
  right are still exactly 2 children of `header`, so its layout is
  unaffected).
- New style: `gearButton: { padding: Spacing.one }` — copy verbatim from
  `companion.tsx`, same visual size/hit target.
- `alignItems: 'flex-end'` on the parent `header` style is unchanged.
  Note (per a tech-lead review): giving `headerActions` its own
  `alignItems: 'center'` means "Sign out" now centers against the taller
  (24px icon + padding) gear button rather than bottom-aligning under
  `header`'s own `flex-end`, so it shifts a few px from its exact prior
  position — an accepted, minor visual difference, not a regression to
  avoid. QA should eyeball it in the screenshot rather than assume
  pixel-identical placement.

**Required test fix** (blocking, per a tech-lead review):
`app/src/app/(tabs)/__tests__/index.test.tsx:10-16` mocks `expo-router`
with only `useFocusEffect` — no `useRouter`. Adding `const router =
useRouter()` to `index.tsx` makes `useRouter` resolve to `undefined` in
that test file, throwing on every render. The mock must add
`useRouter: () => ({ push: mockPush })` (with a `const mockPush =
jest.fn();` declared alongside), matching the pattern already used in
`log.test.tsx` and `companion.test.tsx`. Add assertions that pressing the
new gear button calls `mockPush` with `'/settings'`.

### 3. `app/src/app/(tabs)/log.tsx` — add a header row with the gear icon

Currently no row wrapper exists at all, just two stacked texts. Introduce
one:

```tsx
<View style={styles.headerRow}>
  <View>
    <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
      QUICK SNARE
    </ThemedText>
    <ThemedText type="title" style={styles.title}>
      Log a meal
    </ThemedText>
  </View>
  <PressableScale
    onPress={() => router.push('/settings')}
    hitSlop={8}
    scaleTo={0.9}
    testID="settings-gear-button"
    accessibilityLabel="Settings"
    style={styles.gearButton}>
    <Ionicons name="settings-outline" size={24} color={theme.textSecondary} />
  </PressableScale>
</View>
```

- Verified: `log.tsx` already imports `Ionicons` and `useRouter`, and its
  main component already has both `const theme = useTheme();` (line 36)
  and `const router = useRouter();` (line 37) — this screen needs **zero
  new imports or hooks**, only the JSX/style addition below.

**Required test fix** (blocking, per a tech-lead review):
`app/src/app/(tabs)/__tests__/log.test.tsx:8-10` declares
`const mockNavigate = jest.fn();` and mocks `useRouter: () => ({
navigate: mockNavigate })` — no `push`. `log.tsx`'s existing code only
ever calls `router.navigate('/')` (barcode/photo success flows), which is
why the mock never needed `push` before. The new gear button calls
`router.push('/settings')`, so pressing it in a test would throw
`router.push is not a function` against the current mock. Fix: add
`const mockPush = jest.fn();` and extend the mock to `useRouter: () => ({
navigate: mockNavigate, push: mockPush })`. Do **not** change the gear
button itself to call `router.navigate` instead of `router.push` for
mock-convenience — `push` is required for this ticket's own acceptance
criterion (step 5: `router.back()` from Settings returning to the correct
tab depends on ticket 004's Stack `push` semantics, not `navigate`, which
would behave differently against the back stack).
- New styles: `headerRow: { flexDirection: 'row', alignItems: 'flex-end',
  justifyContent: 'space-between' }` and `gearButton: { padding:
  Spacing.one }`. Keep the existing `eyebrow`/`title` styles' own text
  properties (font size, letter spacing, etc.) exactly as they are — only
  the spacing context around them changes, per the required fix below.
- **Required fix to the spacing claim** (blocking, per a tech-lead
  review): the plan originally said to preserve `eyebrow`'s
  `marginBottom: -8` "exactly" on the theory that this ticket doesn't
  touch spacing. That instruction is actually wrong and would cause the
  regression it's trying to avoid: today, `eyebrow`/`title` are direct
  children of `scrollContent`, which has `gap: Spacing.three` (16) between
  all its children — the `-8` margin was tuned against that 16px gap to
  net out to a deliberate 8px visual gap. Wrapping them in a new `<View>`
  removes them from `scrollContent`'s direct children, so that 16px gap no
  longer applies between eyebrow and title — leaving `-8` in place would
  make the eyebrow overlap the title by 8px. Fix: change `eyebrow`'s
  `marginBottom` from `-8` to `2` (matching `index.tsx`'s `eyebrow` style,
  which has the same relationship to its own title once wrapped) — this is
  now correctly in scope, not an unrelated change.

## Deliberately not doing

- **No shared `<ScreenHeader>` component extraction.** Three screens, three
  slightly different header shapes (title-only-with-gear on Companion,
  title+two-actions on Today, title-with-gear on Log) — forcing a shared
  abstraction now would mean either overfitting it to today's three shapes
  or over-engineering a generic API neither this ticket nor any other
  currently needs. Revisit if a 4th screen needs a header later.
- **No change to `settings/index.tsx` or any other settings screen.**
- **No change to the gear icon's destination** — still
  `router.push('/settings')` on every screen, landing on the same Settings
  list screen regardless of which tab it was opened from (this is the
  correct, expected behavior: Settings is one shared destination, not
  per-tab).
- **No change to `app-tabs.web.tsx`/`app-tabs.tsx`** — ticket 005 already
  fixed the layering bug that would have hidden any of these header rows;
  nothing about the tab-bar component itself needs touching for this
  ticket.
- **No change to `"Sign out"`'s behavior, label, or position** — it stays
  exactly where and what it was, per the user's explicit choice.

## Verification (the actual point of this ticket)

Per ticket 005's own lesson — a click succeeding via automation is not
proof a human can see or reach something — verification here must be
visual, not just DOM-level:

1. Real signed-in headless-browser session (Playwright, Clerk sign-in), at
   a normal desktop width (~960×800, the width the ticket-005 bug was
   actually observed at) and a narrow width (~430×932).
2. At each width, navigate to **all three tabs** (Today, Log, Companion)
   and screenshot each. Visually confirm the gear icon is present, fully
   visible (not overlapped by the nav bar — should already hold given
   ticket 005's fix, but confirm rather than assume), and correctly
   positioned relative to each screen's own header content.
3. On Today specifically, confirm "Sign out" is still present, unchanged,
   and that both it and the new gear icon are readable/tappable without
   overlapping each other.
4. Use a normal Playwright `.click()` (not a DOM-dispatch workaround) on
   the gear icon from **each of the three tabs** and confirm it navigates
   to `/settings` every time.
5. From `/settings`, confirm `router.back()` returns to whichever tab the
   gear icon was pressed from (should be automatic given ticket 004's
   Stack/anchor setup — no new navigation logic is being added here, this
   just confirms the existing behavior still holds from three different
   entry points instead of one).
6. **Scope the Playwright locator per visible tab** (per a tech-lead
   review): all three screens will share `testID="settings-gear-button"`.
   If the web tab layout keeps unfocused tab screens mounted (rather than
   unmounting them), a bare `page.locator('[data-testid=...]')` could
   match more than one element at once and hit Playwright strict-mode
   errors. Scope each click to the currently-visible tab (e.g. via a
   parent container selector, or by confirming only one match exists
   before clicking) rather than assuming global uniqueness.

## Acceptance criteria

- [ ] `app/src/app/(tabs)/companion.tsx` — zero diff (unchanged).
- [ ] `app/src/app/(tabs)/index.tsx` — gear icon added alongside
      "Sign out" (not replacing it); both visible and independently
      tappable.
- [ ] `app/src/app/(tabs)/log.tsx` — new header row with gear icon added;
      `eyebrow`/`title` text properties (font size, letter spacing, etc.)
      unchanged; `eyebrow`'s `marginBottom` deliberately changed from `-8`
      to `2` to reproduce the same visual gap now that it's wrapped
      (per the B3 fix above — this is an intentional, in-scope change,
      not a regression).
- [ ] All three tabs' gear icons use identical `testID="settings-gear-button"`,
      `accessibilityLabel="Settings"`, and navigate to the same
      `/settings` route.
- [ ] Live headless-browser screenshots at desktop (~960px) and narrow
      (~430px) widths show the gear icon visible and correctly placed on
      all three tabs, with no overlap from the ticket-005-fixed nav bar.
- [ ] A normal (non-DOM-dispatch) Playwright `.click()` on the gear icon
      succeeds from all three tabs, navigating to `/settings`.
- [ ] Full `npx jest --coverage` in `app/` stays at or above the ticket
      005 baseline (98.56%/91.79%/98.11%/99.57%) on every metric. Existing
      tests for `index.tsx`/`log.tsx`/`companion.tsx` that assert on their
      current header content will need updating for the new gear icon
      (`companion.test.tsx`'s gear-button assertions are the existing
      pattern to follow for the other two).
- [ ] `npx tsc --noEmit` shows no new errors beyond the same pre-existing
      ones already tracked since ticket 005.
- [ ] `npm run test:coverage` in `backend/` is unaffected (no backend
      files touched).

## Review

Full gated-build pipeline: Sonnet build → Sonnet QA (independent live
visual re-verification, per the ticket 005 precedent) → Opus tech-lead →
Opus CTO verdict (Fable unavailable on this plan, same independence caveat
noted in every prior verdict this session). Build only after plan approval
and the user's explicit go-ahead.
