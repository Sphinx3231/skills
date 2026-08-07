# Outcome: replace SVG FoxCompanion with always-looping idle GIFs

Branch: `foxbite-idle-gifs`. Implements
`docs/plans/foxxy-idle-gifs-plan.md` in full. Not committed — left staged
for the next gated-build review stage.

**Revision history**: this doc originally described the first implementation
pass. Opus tech-lead review found a real, blocking visual placement bug in
`FoxWardrobeOverlay` (not visible from code alone — required compositing the
accessory paths onto the actual GIF frames) plus two test-strength gaps. The
"Wardrobe accessory placement fix" section below documents that round;
everything above it in the file history still applies except where
superseded.

A subsequent CTO gate (`docs/outcomes/foxxy-idle-gifs-verdict.md`) returned
**MERGE** but flagged, in its §5 documentation note, that the placement
fix's Scarf-suppression decision had a real user-facing cost the outcome doc
hadn't stated plainly: the "Cozy scarf" streak unlock became permanently
invisible, since the only two idle kinds any call site ever renders it on
(`stand`/`calm`) are exactly the two kinds Scarf was suppressed for. That's
fixed in the "Wardrobe accessory placement fix" section below (see
`ScarfCozyWrap`) — suppression is gone; those two kinds now render a
deliberately different-looking Scarf variant instead.

## What changed

- **`app/src/lib/fox-idle.ts`** (new) — `FoxIdleKind` type (`'stand' |
  'calm' | 'sleepy' | 'happy' | 'excited' | 'asleep'`) and two pure mapping
  functions:
  - `idleKindForDashboard(mood, remaining, goal)` — `empty` → `sleepy`,
    `over` → `asleep`, `onTarget` → `excited` once `remaining <= goal *
    0.15` else `happy`. Reuses `foxxyState`'s existing "Sly moves!"
    threshold comparison rather than duplicating it.
  - `idleKindForCompanion(streakCount)` — `streakCount > 0` → `calm`, else
    `stand`.
- **`app/src/components/fox-idle.tsx`** (new) — dumb/presentational: renders
  one `expo-image` `<Image>` for a `FoxIdleKind`, `autoplay={!reduceMotion}`
  where `reduceMotion` is a required prop (not read via `useReduceMotion()`
  internally), matching `fox-moment.tsx`'s existing hook/dumb-component
  split.
- **`app/src/components/fox-wardrobe-overlay.tsx`** (new) — `Scarf`/`Hat`/
  `Crown`/`Backpack` extracted **verbatim** (same paths, same `viewBox="0 0
  200 200"`) from the retired `fox-companion.tsx`, as a transparent
  `react-native-svg` `Svg` with the same `wearingX` prop shape.
- **`app/src/components/foxxy.tsx`** (new) — composite entry point.
  `useReduceMotion()` lives here (not in `FoxIdle`) so call sites don't
  each need to thread it through; stacks `FoxIdle` and, if any `wearingX`
  prop is true, an absolutely-positioned `FoxWardrobeOverlay` on top.
- **Call sites updated**, `else`-branch only (the `activeMoment ? <FoxMoment
  /> : ...` shape is unchanged):
  - `app/src/app/index.tsx` — Dashboard hero: `<Foxxy
    kind={idleKindForDashboard(mood, goal - calories, goal)} size={116} />`.
  - `app/src/app/companion.tsx` — Companion hero:
    `<Foxxy kind={idleKindForCompanion(companion?.streakCount ?? 0)}
    size={200} wearingX.../>`. Wardrobe grid thumbnail: `<Foxxy kind="stand"
    size={64} wearingX.../>` (always `"stand"`, per the plan's mapping
    table — grid previews aren't mood-driven).
- **Deleted** `app/src/components/fox-companion.tsx` and
  `app/src/components/__tests__/fox-companion.test.tsx`, after confirming
  zero remaining functional references (`grep -rn FoxCompanion app/src`
  now only matches doc-comments in `foxxy.tsx`/`fox-wardrobe-overlay.tsx`
  that name the retired component for context).
- **`FoxMood` relocated**: it lived in `fox-companion.tsx` (now deleted).
  Moved to `app/src/lib/dashboard-logic.ts` (the file that actually owns the
  mood logic via `foxxyState()`); `fox-moments.ts` and `index.tsx` updated
  to import it from there instead.
- **Stale comments updated** in `fox-moment.tsx` and
  `app/src/app/__tests__/companion.test.tsx` that referred to "FoxCompanion"
  by name, since the component they described no longer exists.

## Why `reduceMotion` moved out of `FoxIdle`

Per the plan: `Foxxy` calls `useReduceMotion()` once and passes the boolean
down, keeping `FoxIdle` a pure, prop-driven renderer that's trivially
testable without mocking a hook per test (see
`fox-idle.test.tsx`'s `autoplay` assertions, which pass the prop directly).

## Verifying `autoplay` actually freezes the GIF, not just "looks plausible"

`fox-idle.test.tsx` renders `<FoxIdle reduceMotion={true|false} />` and
inspects `toJSON()` for the literal `"autoplay":true`/`"autoplay":false` in
the underlying `ViewManagerAdapter_ExpoImage` node's props — the same
prop-passthrough style already used elsewhere in this codebase for
`expo-image` usages. This proves the prop reaches the native image view,
not just that a plausible-looking value was passed to a wrapper.

## Test coverage collision this surfaced

The original `FoxCompanion` (SVG) had **no** `accessibilityLabel`; only the
one-shot `FoxMoment` GIFs did, and `companion.test.tsx` relied on that
asymmetry (`getByLabelText('Foxxy')` / `queryByLabelText('Foxxy')` toBeNull)
to distinguish "a moment is playing" from "the idle fox is showing." Now
that every `Foxxy` idle GIF *also* carries `accessibilityLabel="Foxxy"`
(reasonable for accessibility — it's the same character), that label alone
can no longer disambiguate. Also, `CompanionScreen` renders `Foxxy` five
times per screen (hero + 4 wardrobe-grid thumbnails), so `getByLabelText`
started throwing "multiple elements" once every idle instance shared the
label.

Fixed by re-targeting those two tests at what's actually distinctive: the
specific GIF asset filename a `FoxMoment` loads (`fox_03_celebrate.gif`),
found via `testUri` in the rendered `source` prop, instead of the shared
accessibility label. See `app/src/app/__tests__/companion.test.tsx`.

## New tests written

- `app/src/lib/__tests__/fox-idle.test.ts` — all six mapping branches for
  `idleKindForDashboard` (including the exact 15%-threshold boundary,
  matching `dashboard-logic.test.ts`'s boundary-testing style) and both
  branches of `idleKindForCompanion`.
- `app/src/components/__tests__/fox-idle.test.tsx` — renders every kind,
  accessibility label, custom size, and the `autoplay` true/false
  passthrough described above.
- `app/src/components/__tests__/fox-wardrobe-overlay.test.tsx` — no
  accessories, all four at once, each individually, custom size.
- `app/src/components/__tests__/foxxy.test.tsx` — every idle kind, overlay
  absent vs. present (checked via presence/absence of the `RNSVGSvgView`
  node — `react-native-svg`'s test-renderer output doesn't literally
  contain the string `"viewBox"`), each accessory individually, `autoplay`
  reflecting the (mocked) `useReduceMotion()` result, custom size.
- `app/src/app/__tests__/companion.test.tsx` — added a case forcing
  `streakCount: undefined` to exercise the `?? 0` fallback (see coverage
  section below), plus the celebrate-moment re-target described above.
- `app/src/components/__tests__/ambient-glow.test.tsx` (new, previously
  had zero test coverage despite being used on both screens this plan
  touches) — default `"warm"` variant and `"cool"` variant, closing a real
  branch gap rather than papering over it.

## Wardrobe accessory placement fix (post-review)

Tech-lead review composited the extracted accessory paths onto the actual
`stand`/`calm` GIF frames (accounting for `contentFit="contain"`'s letterbox
math) instead of trusting that byte-identical paths would land correctly on
a completely different body than the one they were drawn for. They didn't:

1. **`foxidle_01_stand.gif` and `foxidle_02_calm.gif` already have a blue
   bandana with a paw print baked into the artwork.** The `Scarf` overlay
   (`#3f7dd6`, the same blue) landed almost exactly on top of it.
2. **`Backpack` landed on the tail**, not the back — a green box floating
   past the body outline.
3. **Hat/Crown sat in the gap above the head fur**, reading as floating
   rather than worn.

### How this was actually verified, not just eyeballed

`Read` on `app/assets/Gifs/foxidle_01_stand.gif` and `foxidle_02_calm.gif`
directly (both display as images) confirmed finding #1 immediately — the
baked-in bandana is unmistakable. For the coordinate fixes, eyeballing
proved too imprecise (a first attempt at repositioning the Backpack, judged
only by looking at the image, moved it onto the fox's *cheek* instead of
the tail — worse, just wrong in a different spot). Precise numbers came
from actually reproducing this app's exact rendering geometry and measuring
it:

1. Rendered a `contentFit="contain"`-equivalent (`object-fit: contain` on
   an `<img>`) 220×220 box containing the real GIF, via a static HTML file
   and a headless-Chromium screenshot (`msedge.exe --headless=new
   --screenshot=...` — Edge ships on this Windows machine; no new
   dependency installed, no GIF file touched).
2. Read the resulting PNG's pixels with `pngjs` (already a transitive
   dependency in `app/node_modules`, not newly installed) to find exact
   bounding boxes: the baked-in bandana's blue, the fox's non-background
   silhouette per row/column, and (for the fix's own transforms) the
   composited accessory's rendered position, to catch mistakes like the
   cheek-placement attempt above before committing to numbers.
3. Every derived measurement below is stated as `(pixel-fraction) → viewBox
   coordinate (fraction × 200)`, so a future session can re-derive or
   re-verify them without redoing the screenshot step.
4. All screenshot/measurement scratch files stayed in the OS temp
   scratchpad, never in the repo — deleted after use; `git status` was
   checked clean of them before finishing.

### Measured findings

- Baked-in bandana (blue, `stand.gif`): x-fraction 0.300–0.627, y-fraction
  0.459–0.745 → viewBox x60–125, y92–149. The original `Scarf` overlay
  (x62–138, y110–154, pre-fix) overlapped this almost exactly, confirming
  finding #1 was a real, near-exact collision, not a near-miss.
- Head-top (the fur tuft *between* the ears, not the ear tips): y-fraction
  ≈0.16 → viewBox y≈32. Ear tips themselves: y-fraction ≈0.036 → viewBox
  y≈7.
- Head horizontal center: x-fraction ≈0.445 → viewBox x≈89, not x=100 (the
  original artwork's center) — a small but real offset.
- Body/tail silhouette profile (row-by-row non-background-pixel runs) at
  torso height, e.g. y-fraction 0.70: body spans x-fraction 0.286–0.618;
  the tail is a **separate** silhouette run at 0.641–0.864. The original
  `Backpack` (x124–158 → x-fraction 0.62–0.79) sits inside that tail run,
  confirming finding #2.
- Front-left paw: x-fraction ≈0.32–0.44, y-fraction ≈0.90–0.98 — used as
  the lower bound for where the repositioned Backpack shouldn't extend.

### Fixes applied, in `app/src/components/fox-wardrobe-overlay.tsx`

- **Scarf**: originally *suppressed* outright for `kind === 'stand' ||
  kind === 'calm'` — repositioning it elsewhere on these two frames was
  rejected because every available body location collides with either the
  bandana or the tail (see measurements above), and a same-color recolor
  would just double-paint the existing bandana. That suppression was
  revisited after the CTO gate flagged the real user-facing consequence
  plainly (see `docs/outcomes/foxxy-idle-gifs-verdict.md` §5): both call
  sites that ever pass `wearingScarf` (Companion hero, wardrobe grid) only
  ever render `stand`/`calm`, so suppressing Scarf on exactly those two
  kinds meant the "Cozy scarf" streak unlock was **permanently invisible**
  in the shipped app — a silent-absence regression, not an acceptable
  trade-off, once stated that plainly.

  **Fix: `stand`/`calm` now get a different Scarf design instead of no
  Scarf at all.** `ScarfCozyWrap` is a distinct "chunky knit wrap" —
  different color (`#4B7355`, the woodland-dusk palette's `fats`/forest-moss
  token from `theme.ts`, nowhere near the bandana's blue `#3f7dd6` or the
  fox's orange fur) and a different, wider/lower shape (a ribbed band plus
  two draping fringed tails, vs. the default `Scarf`'s single thin band +
  knot) so it reads as a second garment layered below the existing bandana,
  not a recolor of the same one. `FoxWardrobeOverlay` picks between `Scarf`
  and `ScarfCozyWrap` based on `KINDS_WITH_BAKED_IN_BANDANA` (renamed from
  `KINDS_WITH_BAKED_IN_SCARF` now that it selects a variant rather than
  suppressing); `kind` remains a required prop on `FoxWardrobeOverlay` for
  this decision, forwarded from `Foxxy`'s own `kind` prop as before.

  Verified the same way as Backpack/Hat/Crown: composited the exact
  `ScarfCozyWrap` path data onto real frames from both `stand.gif` and
  `calm.gif` (headless-Chromium screenshot of an `object-fit:contain`
  220x220 box). The wrap's band sits at viewBox y130-148 — deliberately
  overlapping the bandana's measured bottom edge (y92-149) so it reads as
  layered on top of/below the existing garment rather than floating
  separately — and its two draping tails end by y≈185, clear of the front
  paws (measured y-fraction 0.90-0.98 → viewBox y180-196). Also checked
  composited *together* with the Backpack (both render simultaneously on
  the Companion hero once a streak has unlocked both scarf and backpack,
  day 14+): the wrap's tails are narrower and more centered (x84-116) than
  a first draft specifically so a sliver of the Backpack (x51-85/y140-178)
  stays visible past the wrap's left edge instead of being fully buried —
  a small residual overlap remains and is accepted as a known, low-impact
  cosmetic compromise of this front-facing pose having only one usable
  "chest" area, consistent with the Backpack placement's own already-
  documented trade-off above.
- **Backpack**: `transform="translate(-73,14)"` on the accessory's `<G>`
  moves its bbox from (x124–158, y126–164) to (x51–85, y140–178) — viewBox
  x-fraction 0.255–0.425, y-fraction 0.70–0.89 — landing on the body's left
  side at torso height, below the bandana, above (with a small tolerated
  overlap right at the boundary) the front leg, and clear of the tail's
  measured x-fraction 0.64+ range. This is a front-facing pose with no back
  literally visible; "beside the body at torso height" was chosen over
  drawing shoulder straps across the chest because it keeps the extracted
  path verbatim (only the position changes, not the shape) rather than
  redrawing the accessory.
- **Hat**: `transform="translate(-10,4) scale(1,0.52)"` — shifts left 10
  (correcting for the measured x-center offset) and compresses/moves the
  hat vertically so its brim rests at viewBox y≈32 (the measured head-top)
  instead of y≈54 (which landed over the eyebrows).
- **Crown**: `transform="translate(-10,-1) scale(1,0.6875)"` — same
  left-shift, and a vertical rescale so its base lands at the same y≈32
  head-top anchor instead of the gap above the ears.
- Verified the fix, not just the math: rebuilt the same headless-screenshot
  composite with the new transforms applied and visually confirmed the hat
  and crown now sit on the head and the backpack sits beside the torso, clear
  of both the tail and the face, on both `stand.gif` and `calm.gif`.
- Added `testID`s (`wardrobe-scarf`/`wardrobe-hat`/`wardrobe-backpack`/
  `wardrobe-crown`) to each accessory's `<G>` so tests can assert a specific
  accessory is present, rather than "some SVG rendered."

None of the six idle GIF files were modified — only the overlay's own
coordinates.

### Test fixes and additions from this round

- **Restored** `app/src/app/__tests__/companion.test.tsx`'s `'does not play
  a FoxMoment when nothing was newly unlocked'` real negative assertion —
  it had been reduced to a comment with no assertion when the accessibility
  label became ambiguous (see "Test coverage collision" above). Now asserts
  `expect(JSON.stringify(toJSON())).not.toContain('fox_03_celebrate')`,
  mirroring the positive test immediately above it.
- `fox-idle.test.tsx`: added a test asserting each `FoxIdleKind` loads its
  *specific* GIF filename (`foxidle_0N_<kind>.gif`, checked via the mocked
  `Image`'s `testUri`), not just that something renders.
- `fox-wardrobe-overlay.test.tsx` / `foxxy.test.tsx`: rewritten to assert on
  each accessory's specific `testID` instead of "an SVG exists somewhere."
  Added dedicated cases for the Scarf variant-selection logic (post-CTO-gate
  revision, see "Scarf visibility fix" below): `stand`/`calm` render the
  `ScarfCozyWrap` variant (its own `wardrobe-scarf-cozy-wrap` testID) rather
  than the default `Scarf` (`wardrobe-scarf-default-band`), and a kind
  without a baked-in bandana (`happy`, a stand-in since it's not a real
  wearingX call site today but exercises the component's own logic) still
  gets the default. A same-kind comparison test renders both variants and
  asserts their `fill` props actually differ — `react-native-svg`'s test
  output encodes color as an `{type, payload}` int, not a literal hex
  string, so the color check compares the two rendered payloads directly
  rather than searching the tree for a hex substring.
- `fox-idle.test.ts`: `idleKindForDashboard`'s `'neutral'` case now asserts
  its own explicit value (`'stand'`) rather than documenting a fallthrough.

### `idleKindForDashboard`'s explicit `neutral` branch

Added `if (mood === 'neutral') return 'stand';` before the `onTarget`
calculation in `app/src/lib/fox-idle.ts`, rather than leaving `'neutral'`
to silently fall through to the `remaining <= goal * 0.15` ternary (which
happened to produce a plausible-looking result only by accident, since
`remaining`/`goal` are meaningless for a mood that isn't goal-derived).
`foxxyState()` never actually produces `'neutral'` from real dashboard data
today, but a future `FoxMood` value added without updating this function
will now hit a real branch instead of an accidental one.

## Scarf visibility fix (post-CTO-gate)

The CTO's verdict returned **MERGE** but its §5 documentation note stated
the shipped consequence of the placement fix's Scarf-suppression plainly:
`stand`/`calm` are the *only* two idle kinds either wardrobe call site
(Companion hero, wardrobe grid) ever renders with `wearingScarf`, so
suppressing Scarf there meant the "Cozy scarf" streak unlock never visibly
changed anything, anywhere, in the shipped app. That's a real regression on
a feature the user can earn — not an acceptable trade-off — so this round
replaces suppression with `ScarfCozyWrap`, a deliberately different-looking
Scarf variant for exactly those two kinds. Full rationale, measurements, and
the composited-verification method are in the "Wardrobe accessory placement
fix" → "Fixes applied" section above (the `ScarfCozyWrap` bullet); the
constant that used to be named `KINDS_WITH_BAKED_IN_SCARF` (a suppression
list) is now `KINDS_WITH_BAKED_IN_BANDANA` (a variant-selection list) to
match what it actually does.

None of the six idle GIF files were touched by this round either — same
discipline as the original placement fix: only the overlay's own SVG paths
and color values changed.

### Redraw (tech-lead rejected the first `ScarfCozyWrap` draft)

Tech-lead review of the fix above rejected it on three measured points
after compositing it onto the real `stand`/`calm` frames:

1. The band (viewBox x50–150) overhung the fox's actual silhouette (which
   only spans ~x64–128 at that height) on both sides, and its right edge
   crossed onto the tail (x129–173) — the exact overlap defect already
   diagnosed and fixed for the Backpack, reintroduced here by a flat
   rectangular bar that ignored the body's contour.
2. Its stroke (`#2f4a37`) didn't match `INK` (`#5a3320`), the color every
   other accessory in this file uses to match the retired SVG's outline
   style, and its fill was in the same green family as `Backpack`'s
   (`#5b8c5a`) — the two accessories read as one merged object.
3. The doc's claim that narrowed tails kept a sliver of Backpack visible
   was checked against the actual numbers and found false: the tails'
   width was irrelevant because the *band* itself (not the tails) was what
   overlapped the Backpack's bbox.

`ScarfCozyWrap` was redrawn from scratch to fix all three: the band is now
a tapered, contour-following bezier "drape" curve kept inside x70–120
(margin inside the measured x64–128 silhouette window on both `stand.gif`
and `calm.gif`, re-verified by the same per-row silhouette-scan method used
for Backpack/Hat/Crown, not re-guessed); stroke is `INK`; fill is
`#B85C6B` (the `protein`/dusty-berry token from `theme.ts`'s
design-refresh palette), nowhere near the Backpack's green or the
bandana's blue. The Backpack-coexistence claim was re-verified by actually
compositing both together on a real frame this time: the band's own bbox
(x70–120/y128–150) and the Backpack's bbox (x55–85/y140–178, per its own
`translate(-73,14)`) do overlap in a small x70–85/y140–150 corner — the
drape's left shoulder dips into the Backpack's top-right corner — but the
two fringed tails, the most visually prominent part of the wrap, sit at
x90–112, entirely clear of the Backpack's span. The composited screenshot
confirmed the Backpack's fill stays visible and distinct; only a thin
sliver of the band's outline stroke touches the Backpack's corner, not a
fill-on-fill collision. This corner overlap is disclosed here rather than
claimed away, since it's a real (small, cosmetic) imperfection, not a
solved problem.

## Coverage — measured, not estimated

Baseline (`main`-equivalent, before this branch's changes), measured with
`npx jest --coverage` before touching anything: **97.97% stmts / 89.43%
branch / 97.95% funcs / 99.39% lines**, 156 tests across 21 suites — this
matches the plan's stated floor exactly.

After the wardrobe-placement fix (first CTO-reviewed round): **97.81%
stmts / 89.52% branch / 97.79% funcs / 99.35% lines**, 182 tests across 25
suites — the CTO verdict explicitly accepted this as the new floor for
subsequent tickets (see verdict §3), since every file the plan touched was
individually at 100% and the dip was denominator arithmetic from deleting a
large, fully-covered file, not undertested new code.

After this round's Scarf visibility fix, same command: **97.82% stmts /
89.52% branch / 97.81% funcs / 99.35% lines**, 183 tests across 25 suites —
at or above the CTO-reset floor on all four metrics (stmts and funcs each
ticked up slightly; branch and lines held steady). `fox-wardrobe-overlay.tsx`
remains at 100/100/100/100 individually.

| Metric | Floor (CTO-reset) | Actual (this round) | Gap |
|---|---|---|---|
| Statements | 97.81% | 97.82% | **+0.01pp (met)** |
| Branches | 89.52% | 89.52% | **met (unchanged)** |
| Functions | 97.79% | 97.81% | **+0.02pp (met)** |
| Lines | 99.35% | 99.35% | **met (unchanged)** |

**Root cause, verified, not assumed**: this is mechanical denominator
shrinkage, not undertested new code. Every new/changed Foxxy file
(`fox-idle.ts`, `fox-idle.tsx`, `fox-wardrobe-overlay.tsx`, `foxxy.tsx`,
`dashboard-logic.ts`, `fox-moments.ts`, `companion.tsx`, `index.tsx`) sits
at **100% stmts/branch/funcs/lines** individually — confirmed in the
per-file coverage table, not inferred. The deleted `fox-companion.tsx` was
422 lines of fully-covered (100/100/100/100) hand-drawn SVG/Animated code;
its replacement (`fox-idle.tsx` + `fox-wardrobe-overlay.tsx` + `foxxy.tsx`)
is roughly 160 lines, also fully covered. Removing a large, 100%-covered
file shrinks the total statement/branch pool substantially; the *same
fixed number* of pre-existing, unrelated uncovered lines elsewhere
(`log.tsx` lines 401/404, `sign-in.tsx` line 279, `external-link.tsx`'s
platform branch, `theme.ts`'s `Platform.select` fallback) then represents a
slightly larger fraction of a smaller denominator, mechanically pulling the
aggregate percentage down — with no change in how well-tested those files
are.

Confirmed two of those specific gaps are **structurally uncoverable** under
this test setup rather than merely unaddressed:
- `external-link.tsx`'s `EXPO_OS !== 'web'` branch — already documented
  in-file (`external-link.test.tsx`'s trailing comment) as inlined to a
  compile-time constant by `babel-preset-expo`, immune to mutating
  `process.env.EXPO_OS` at runtime.
- `theme.ts`'s `Platform.select({ios, android}) ?? 0` fallback — per this
  codebase's own testing conventions (`jest-expo` always reports
  `Platform.OS === 'ios'`), `Platform.select` never returns `undefined` on
  this test platform, so the `?? 0` branch can't fire from a test.

The remaining gap (`log.tsx` lines 401/404's billing-checkout redirect,
`sign-in.tsx` line 279's password-visibility toggle) could be closed, but
doing so means adding tests to `sign-in.tsx` — a file the plan explicitly
lists as **out of scope** ("Sign-in screen, backend, billing —
untouched") — and to `log.tsx`, a screen with zero relationship to Foxxy.
I closed the one gap that was both cheap and legitimately tied to screens
this plan touches (`ambient-glow.tsx`, rendered on both Dashboard and
Companion, previously had no test file at all) and stopped there rather
than expanding scope into unrelated, explicitly-excluded screens to chase
the last ~0.2 percentage points. Flagging this explicitly for the
tech-lead/CTO gate rather than silently declaring the checkbox met.

## `npx tsc --noEmit`

Identical to baseline — the same 3 pre-existing errors, no new ones:
```
src/components/animated-icon.tsx(150,5): error TS2698
src/components/app-tabs.web.tsx(71,15): error TS2322
src/components/ui/collapsible.tsx(22,13): error TS2322
```

## Acceptance criteria status

- [x] `grep -rn "FoxCompanion" app/src` returns nothing outside deleted
      files' git history (two remaining hits are doc-comments in
      `foxxy.tsx`/`fox-wardrobe-overlay.tsx` naming the retired component
      for context, not references to it).
- [x] Dashboard, Companion hero, and Companion wardrobe grid all render an
      idle GIF via `Foxxy`/`FoxIdle` — never the old SVG, never frozen
      under normal reduce-motion-off use (`autoplay={true}` by default,
      verified by test).
- [x] Wardrobe accessories render correctly layered over the idle GIF —
      verified two ways: unit tests (`foxxy.test.tsx`,
      `fox-wardrobe-overlay.test.tsx`) for presence/variant-selection logic,
      and (after the post-review fix, and again after the Scarf visibility
      fix) an actual pixel-measured composite against the real
      `stand.gif`/`calm.gif` frames confirming placement, not just that
      paths render somewhere. See "Wardrobe accessory placement fix" and
      "Scarf visibility fix" above. Scarf specifically now visibly renders
      (as `ScarfCozyWrap`) on both kinds that ever show it, rather than
      being suppressed.
- [x] `useReduceMotion() === true` freezes idle GIFs on a static frame,
      proven by a test asserting `"autoplay":false` in the rendered tree,
      not just a plausible-looking prop value.
- [x] Full `npx jest --coverage` stays at or above the bar on all four
      metrics. Against the plan's original floor, branches clears
      (89.52% vs. 89.43%) while statements/functions/lines sit fractionally
      below for the mechanically-explained denominator-shrinkage reason in
      the Coverage section above — the CTO verdict explicitly accepted that
      and reset the floor to the measured post-fix values (97.81/89.52/
      97.79/99.35). Against that reset floor, this round's Scarf visibility
      fix measures **97.82/89.52/97.81/99.35** — at or above on all four.
- [x] `npx tsc --noEmit` shows no new errors beyond the same 3 pre-existing
      ones.

## Deferred / out of scope (unchanged from the plan)

- The 5 existing one-shot `FoxMoment` event GIFs, `fox-moments.ts`,
  `fox-moment.tsx`, `use-fox-moment-queue.ts` — untouched except for two
  stale-comment edits (see above) and the test re-targeting forced by the
  accessibility-label collision.
- Bundle size (~23MB total in `assets/Gifs/` once both GIF sets are
  counted) — flagged, not addressed, per the plan.
- Sign-in, backend, billing — untouched.
- The coverage-floor gap described above — flagged for tech-lead/CTO
  review rather than closed by expanding scope into out-of-scope screens.
