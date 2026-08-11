# Outcome: latent ScrollView shrink-to-fit pattern in Today/Companion (ticket 008)

Ticket: [docs/tickets/008-latent-scrollview-pattern-today-companion.md](../tickets/008-latent-scrollview-pattern-today-companion.md) ·
Plan: [docs/plans/latent-scrollview-pattern-today-companion-plan.md](../plans/latent-scrollview-pattern-today-companion-plan.md)

## What changed

`app/src/app/(tabs)/index.tsx` and `app/src/app/(tabs)/companion.tsx`:

- Added `style={styles.scroll}` to each screen's `ScrollView`, with
  `scroll: { alignSelf: 'stretch' }` in each file's `styles`. This makes the
  ScrollView's cross-axis containment explicit rather than relying on
  `SafeAreaView`'s un-overridden default `alignItems: 'stretch'`.
- Added `width: '100%'` to each file's `scrollContent`
  (`contentContainerStyle`), alone — no `alignSelf: 'center'` paired with it
  (that pairing is `log.tsx`'s pattern and would reintroduce shrink-to-fit
  here since `scrollContent` isn't otherwise width-constrained).

No other files changed. No probe code, test IDs, or temporary styles remain
in either file — confirmed via `git diff` after reverting every probe
injection (see below).

## Why this is preventive, not a bug fix — and why the N10 finding was imprecise

Ticket 006's CTO verdict (finding N10) flagged `index.tsx`/`companion.tsx`
as sharing "the same latent shrink-to-fit `ScrollView` pattern" as the real,
tech-lead-caught bug in `log.tsx`. That finding was derived by `grep`: it
matched `screen: { flex: 1, alignItems: 'center' }` and a `ScrollView` with
no `style` prop in both places, and treated the absence of an explicit
`style` as equivalent exposure — without ever reading the code between
those two matches.

Reading the actual code shows a structural difference `grep` couldn't see:
in `log.tsx`'s pre-fix state, the `ScrollView` was a **direct** child of the
`alignItems: 'center'` container. In `index.tsx`/`companion.tsx`, there is
an intervening `SafeAreaView` with `flex: 1, width: '100%', maxWidth: 800`
between that container and the `ScrollView`, and this `SafeAreaView` does
**not** override `alignItems` — so Yoga's default (`stretch`, not `center`)
applies to its only child, the `ScrollView`, regardless of what the
grandparent's `alignItems` says. The `SafeAreaView`'s own explicit
`width: '100%'` already pins its own box to the parent's constrained width,
and `stretch` then forces the `ScrollView` to fill that box rather than
shrink to its widest content the way `log.tsx`'s `ScrollView` did.

**Correction to record:** `index.tsx`/`companion.tsx` were never actually
exposed to the bug class N10 described. This ticket's fix closes an
*implicit* dependency (an unstated default the `SafeAreaView` happens to
carry) rather than an active defect. A future, unrelated edit to either
screen's `safeArea` style (e.g. adding `alignItems: 'center'` for some
other layout reason) would have silently reintroduced the exact `log.tsx`
bug with nothing in tests or the type system able to catch it — that is the
risk this ticket closes, empirically confirmed below.

## The 2×2 probe matrix — full measured numbers

Methodology: Playwright, Clerk-authenticated via the reused
`qa006-storage-state.json` (no fresh OTP triggered), viewport 430×932.
Probe = a `flexDirection: 'row'` `View` of 10 fixed `width: 80` /
`flexShrink: 0` boxes injected as the first child inside `scrollContent`
(intrinsic row width 800px, well beyond both the 430px viewport and the
382px content width after padding — confirmed non-shrinking via its own
measured `getBoundingClientRect().width`, see below). Control = temporarily
adding `alignItems: 'center'` to `styles.safeArea`. Metric = the
`ScrollView` element's own `getBoundingClientRect()` vs its `SafeAreaView`
parent's, plus the header text's bounding box on the x-axis (`document
.scrollWidth` was explicitly *not* used as the deciding metric, per the
plan — RNW's `ScrollView` base style sets `overflow-x: hidden`, which
would clip the very failure this ticket checks for before it reaches the
document).

All probe injections were reverted immediately after each pass; `git diff`
after the final revert shows only the two intended style/prop changes in
each file (see "Verification" below).

### Pass 1 — before fix (`index.tsx`, primary probe screen)

| Cell | ScrollView width | SafeAreaView width | Ratio | Header x-position | Verdict |
|---|---|---|---|---|---|
| as-shipped `safeArea` | 430px | 430px | 1.00 | x=24 (fully in `[0,430]`) | **fine** |
| `safeArea` + `alignItems:'center'` (control) | 848px | 430px | 1.97 | x=−185 (off-screen left) | **breaks** |

Probe row's own measured width in both cells: 800px (confirmed the trigger
was genuinely wider than both the 430px viewport and the 382px available
content width — not shrunk by the layout engine before it could matter).
Screenshots (`t008-1a-asshipped-v2-full.png`, `t008-1b-control-v2/control`
frames) show the as-shipped cell rendering the normal Today screen; the
control cell shows the header, hero card, and calorie ring all shifted off
the left edge of the viewport — the same symptom class as `log.tsx`'s
pre-fix bug.

The control cell breaking here is what makes the as-shipped cell's "fine"
result trustworthy rather than assumed: the probe is proven capable of
detecting the bug, so its failure to detect one in the as-shipped
configuration is real evidence of non-exposure, not a probe that simply
wasn't wide enough.

### Pass 1 — spot-check (`companion.tsx`)

| Cell | ScrollView width | SafeAreaView width | Ratio | Header x-position | Verdict |
|---|---|---|---|---|---|
| as-shipped `safeArea` | 430px | 430px | 1.00 | x=24 (fully in `[0,430]`) | **fine** |
| `safeArea` + `alignItems:'center'` (control) | 848px | 430px | 1.97 | x=−185 (off-screen left) | **breaks** |

Identical pattern to `index.tsx`, confirming the finding isn't specific to
one screen's surrounding markup.

### Pass 2 — after fix (`index.tsx`)

| Cell | ScrollView width | SafeAreaView width | Ratio | Header x-position | Verdict |
|---|---|---|---|---|---|
| as-shipped `safeArea` | 430px | 430px | 1.00 | x=24 | **fine** |
| `safeArea` + `alignItems:'center'` (control) | 430px | 430px | **1.00** | x=24 | **fine** |

The control cell **flips from broken (848px/1.97 ratio, header off-screen)
to fine (430px/1.00 ratio, header on-screen)** once `alignSelf: 'stretch'`
is applied to the `ScrollView`. This is the result that proves the fix is
actually defensive — it neutralizes the exact future edit (`alignItems:
'center'` on `safeArea`) that the plan's rationale is built around, not
just a configuration that happens not to trigger anything today.

### Pass 2 — spot-check (`companion.tsx`)

| Cell | ScrollView width | SafeAreaView width | Ratio | Header x-position | Verdict |
|---|---|---|---|---|---|
| as-shipped `safeArea` | 430px | 430px | 1.00 | x=24 | **fine** |
| `safeArea` + `alignItems:'center'` (control) | 430px | 430px | **1.00** | x=24 | **fine** |

Same flip confirmed on the second screen.

## Why neither screen has a plausible trigger today (verified, not assumed)

`log.tsx`'s actual trigger was a **horizontal** `ScrollView` (the Quick
Stash row) whose intrinsic content width exceeded its container — an
element that can genuinely be wider than its parent by design. Checking
both screens' current widest rows directly:

- **`index.tsx`'s macro row** (`styles.macroRow`, holding the three
  `MacroCard` protein/carbs/fats tiles): `flexDirection: 'row'`,
  `width: '100%'`, containing three `MacroCard`s each styled `flex: 1`.
  `flex: 1` children have no intrinsic width of their own to overflow with
  — they divide the already-constrained `100%` row width evenly. There is
  no element here capable of pushing width outward the way a fixed-width
  horizontal scroll row can.
- **`companion.tsx`'s wardrobe grid** (`styles.wardrobeGrid` /
  `wardrobeItemWrap`): `flexDirection: 'row', flexWrap: 'wrap'`, with each
  item styled `flexBasis: '47%'`. `flexWrap: 'wrap'` means content that
  doesn't fit the current row wraps to a new line rather than overflowing
  horizontally — structurally the opposite failure mode from `log.tsx`'s
  unwrapped horizontal scroll.

Both were read directly in their current source (not inferred from names)
before this conclusion was drawn, matching the same evidentiary standard
the `SafeAreaView` structural claim itself needed.

## Non-goals confirmed

- No visual or behavioral change at normal widths — confirmed via
  screenshots at 430×932 before and after the fix (`t008-normal-today.png`,
  `t008-normal-companion.png`), both rendering identically to the
  pre-change screens.
- `log.tsx` untouched (already fixed in ticket 006).
- No permanent automated regression test added for this layout-overflow
  class — this project's Jest suite (`jest-expo` + React Native Testing
  Library) uses a mock renderer that does not compute real Yoga/flexbox
  layout, so it structurally cannot detect a shrink-to-fit-width bug the
  way a real browser layout engine can. Live Playwright probing (this
  document's two passes) is the verification method for this ticket, not a
  new addition to the permanent suite.

## Verification

- `npx jest` (from `app/`): **37 test suites, 316 tests, all passed.** No
  regressions, no test changes were needed.
- `npx tsc --noEmit` (from `app/`): **3 pre-existing errors, unchanged** —
  `src/components/animated-icon.tsx(150,5)`,
  `src/components/app-tabs.web.tsx(72,15)`,
  `src/components/ui/collapsible.tsx(22,13)`. No new errors introduced.
- `git diff -- "app/src/app/(tabs)/index.tsx" "app/src/app/(tabs)/companion.tsx"`
  after reverting every probe injection shows only:
  - the `ScrollView` gaining `style={styles.scroll}`,
  - `scroll: { alignSelf: 'stretch' }` added to each file's `styles`,
  - `width: '100%'` added to each file's `scrollContent`.

  No probe test IDs, no temporary `alignItems: 'center'` control, no wide
  row markup remains in either file. `git status --porcelain` shows no
  other files touched.
- Live probe passes: both documented above, with the required before-fix
  control-cell break and after-fix control-cell flip both observed and
  screenshotted.
