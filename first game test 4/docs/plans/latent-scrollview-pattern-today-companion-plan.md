# Plan: Investigate and close the latent ScrollView pattern in Today/Companion

Ticket: `docs/tickets/008-latent-scrollview-pattern-today-companion.md`

## Step 1 — Empirically determine current exposure (before touching any code)

Reasoning about the styles suggests `index.tsx`/`companion.tsx` may NOT
actually be exposed the way `log.tsx` was, because their `ScrollView` sits
inside a `SafeAreaView` that already has `width: '100%', maxWidth: 800` and
doesn't override `alignItems` (default `stretch`), whereas `log.tsx`'s
`ScrollView` was a *direct* child of a container with `alignItems:
'center'`. But this project has already been surprised once by
react-native-web's actual flex-resolution behavior (that's the entire
reason ticket 006's bug existed and took a tech-lead catch to find), so
don't ship a conclusion based on reasoning alone.

**The probe needs a positive control, or a null result proves nothing.**
If the screen doesn't break, that's ambiguous between "genuinely not
exposed" and "the probe wasn't wide enough / measured the wrong thing" —
exactly the same evidentiary weakness that produced the original,
imprecise N10 finding (which was itself grep-derived: two matching style
blocks plus an absence, without ever noticing the intervening
`SafeAreaView`). Don't repeat that shape in the ticket meant to correct it.

**Probe methodology** (temporary, reverted before any commit regardless of
outcome) — a 2×2 matrix, not a single measurement:

1. Start backend (`:4000`) and web (`:8097`) dev servers if not already
   running.
2. Temporarily inject a deliberately wide horizontal row into `index.tsx`
   (pick whichever screen is faster to probe; if it shows no issue,
   spot-check `companion.tsx` too since they're not byte-identical in
   their surrounding layout even though the `screen`/`safeArea` styles
   match) — e.g. 10 fixed-`minWidth` boxes in a `flexDirection: 'row'`
   `View` inside the existing `scrollContent`, sized to intrinsically
   exceed 430px combined.
3. **Positive control**: also temporarily add `alignItems: 'center'` to
   `styles.safeArea` — the exact future edit Step 2's rationale claims to
   defend against. This is expected to reproduce `log.tsx`'s pre-fix
   symptom, proving the probe itself is capable of detecting the bug
   before drawing any conclusion from a case where nothing breaks.
4. Using Playwright (reuse a saved authenticated storage-state file from
   the scratchpad if one is still valid — do NOT trigger a fresh Clerk
   OTP), measure at a 430×932 viewport, across all 4 cells of:

   |  | `safeArea` as shipped | `safeArea` + `alignItems:'center'` (control) |
   |---|---|---|
   | **before any fix** | expect: fine (the hypothesis) | expect: **breaks** — proves the probe can detect the bug |
   | **after Step 2's fix** | expect: fine | expect: **fine** — proves the fix is actually defensive, not just theoretically so |

   For each cell, measure the mechanism directly — the `ScrollView`
   element's own `getBoundingClientRect().width` against its
   `SafeAreaView` parent's `getBoundingClientRect().width` (the ratio
   *is* the hypothesis: shrink-to-fit vs. matching-parent) — plus the
   header element's bounding box as the user-visible symptom check
   (inside `[0, 430]` on the x-axis or not). Do **not** rely on
   `document.documentElement.scrollWidth` as the primary metric — RNW's
   `ScrollView` base style sets `overflowX: 'hidden'`, which clips an
   internal overflow before it can ever reach the document, so that
   metric can silently miss the exact failure this ticket is checking
   for.
5. Take a screenshot at each cell and actually look at it (Read tool), not
   just trust the numbers.
6. Revert every probe injection (the wide row AND the temporary
   `alignItems: 'center'` control) immediately after measuring — none of
   this must ever appear in any commit.

Record the full 2×2 result plainly in the outcome document, with the
actual measured numbers, not just a verdict — including that the
top-left/bottom-left cells (unmodified `safeArea`) are expected to both
read "fine," which is the ticket's actual finding, and that the
top-right/bottom-right cells (the control) are what make that finding
trustworthy rather than assumed.

## Step 2 — Apply the defensive fix regardless of Step 1's finding

Even if Step 1 finds `index.tsx`/`companion.tsx` are not *currently*
exposed, that safety currently depends on an *implicit* default
(`SafeAreaView`'s un-overridden `alignItems: 'stretch'`) rather than an
*explicit* constraint. A future, unrelated edit to either screen's
`safeArea` style (e.g. someone adding `alignItems: 'center'` there for some
other reason) would silently reintroduce exactly this bug with no test or
type system able to catch it — the same "latent until someone touches an
unrelated line" character that made the original `log.tsx` bug so easy to
ship unnoticed.

Apply an explicit `alignSelf: 'stretch'` to both `index.tsx` and
`companion.tsx`'s `ScrollView` — **`alignSelf: 'stretch'` only, not also
`flex: 1`**. RNW's `ScrollView` base style
(`react-native-web/dist/exports/ScrollView/index.js`) already supplies
`flexGrow: 1, flexShrink: 1` on the vertical axis; adding `flex: 1` on top
would only change `flexBasis` from `auto` to `0%` — a main-axis (vertical)
change unrelated to the actual defense (which is cross-axis/width), on two
screens whose `ScrollView`s currently have no `style` at all. It's
"almost certainly neutral," but this plan's own probe only measures width,
so it structurally cannot catch a vertical regression from an unnecessary
change — don't introduce a risk the verification can't see. `log.tsx`'s
fix used `flex: 1` alongside `alignSelf: 'stretch'` — but that file's `screen`
container is itself `flex: 1` and `log.tsx`'s specific vertical-fill needs
may differ from these two screens' (not independently re-verified here,
since it's an orthogonal main-axis concern). Don't copy it for parity's
sake without the same justification; the width-defense mechanism this
ticket needs comes entirely from `alignSelf: 'stretch'`:

```ts
// in each file's styles:
scroll: { alignSelf: 'stretch' },
```
```tsx
<ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} ...>
```

This makes the containment explicit and independent of `SafeAreaView`'s
default, rather than relying on it silently continuing to hold.

**Also close the same implicit dependency one level down** (non-blocking
per tech-lead review, but cheap and completes the argument): `log.tsx`'s
fixed `scrollContent` carries `width: '100%', maxWidth: MaxContentWidth,
alignSelf: 'center'` together, but `index.tsx`/`companion.tsx`'s
`scrollContent` has no width constraint at all — it currently renders
correctly only because it's already stretched to exactly the right width
by the chain above it. Add `width: '100%'` to both files'
`scrollContent` — **`width: '100%'` alone, do NOT also add
`alignSelf: 'center'`** copied from `log.tsx`. In `log.tsx` that's paired
with an explicit `width: '100%'` in the same object; added on its own here
it would make `scrollContent` shrink-to-fit and introduce the exact bug
this ticket exists to prevent. `width: '100%'` by itself is provably
neutral today (the container is already stretched to that width by the
parent chain) and removes the second implicit dependency the plan's own
"don't rely on unstated defaults" rationale would otherwise leave open.

## Step 3 — Re-verify with the same 2×2 probe methodology

Re-run Step 1's full 2×2 matrix (wide row × `alignItems:'center'` control)
against the fixed code — Step 1 only fills the matrix's *before-fix* row;
this step fills the *after-fix* row, completing all four cells across the
two passes.

Expected: **three cells fine, and the before-fix + control cell must
break.** That top-right cell is not optional evidence — if it does *not*
break, the probe itself is invalid (not wide enough, or the control style
didn't actually apply) and no conclusion can be drawn from any other cell;
fix the probe and re-run rather than reporting "not exposed." The
after-fix + control cell (bottom-right) flipping from broken to fine is
the result that actually proves the fix is defensive, not just that
nothing currently breaks. Screenshot and read each cell, then revert every
probe injection again.

## What the outcome document must record

1. **The full 2×2 matrix's actual measured numbers** (ScrollView-vs-parent
   width ratio, header bounding box) for both before-fix and after-fix
   passes — not just a pass/fail verdict.
2. **Why the original N10 finding was imprecise, with the correction.**
   Ticket 006's CTO verdict identified this as "the same latent pattern"
   via `grep` — two matching style blocks (`screen: {flex:1,
   alignItems:'center'}` and a `ScrollView` with no `style` prop) plus an
   absence, without observing the intervening `SafeAreaView` that actually
   determines the outcome. State plainly that `index.tsx`/`companion.tsx`
   were structurally different from `log.tsx`'s pre-fix state, and that
   this ticket's fix is preventive (closing an implicit-default
   dependency) rather than a fix to an actual live defect.
3. **Why neither screen has a plausible trigger today**, as a stronger
   "no present defect" statement than "renders fine at 430px": `log.tsx`'s
   trigger was specifically a horizontal `ScrollView` (Quick Stash) whose
   intrinsic content exceeds its container. Neither `index.tsx` nor
   `companion.tsx` has one — `index.tsx`'s macro-card row is `flex:1`
   cards inside an already-constrained `width:'100%'` row (no intrinsic
   overflow), and `companion.tsx`'s wardrobe grid uses `flexWrap: 'wrap'`
   with `flexBasis: '47%'` (wraps to a new line rather than overflowing
   horizontally). Confirm this by reading the actual current layout of
   both screens' widest rows before asserting it, the same way the
   `SafeAreaView` structural claim itself needed direct verification
   rather than being assumed.

## Non-goals

- No visual/behavioral change to either screen at normal widths — this is
  purely defensive.
- Not touching `log.tsx` (already fixed in ticket 006).
- Not attempting to write a permanent automated regression test for this
  specific layout-overflow class: this project's frontend tests
  (`jest-expo` + React Native Testing Library) use a mock renderer that
  does not compute real Yoga/flexbox layout, so a unit test cannot detect
  a shrink-to-fit-width bug the way a real browser layout engine can. This
  is why ticket 006's bug was only ever caught and verified via live
  Playwright measurement, not a unit test — the same is true here. Live
  probing (Steps 1 and 3 above) is the verification method for this ticket,
  not a permanent addition to the test suite.

## Verification

- `npx jest` — full pass, no regressions (no test changes expected unless
  the fix's `style` addition somehow affects an existing snapshot/test —
  check).
- `npx tsc --noEmit` — same 3 pre-existing errors only.
- The two live probe passes described above (Steps 1 and 3), with actual
  screenshots read and numbers recorded in the outcome doc.
