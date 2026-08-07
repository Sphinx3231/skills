# Outcome: FoxBite design refresh (typography, palette, one signature motif)

Branch: `foxbite-design-refresh`. Implements
`docs/plans/design-refresh-plan.md` in full. Changes are left uncommitted
for the next pipeline stage (Sonnet QA) to review.

## What changed

### 1. Typography — Bitter (display) + Work Sans (body)

- Added `@expo-google-fonts/bitter` and `@expo-google-fonts/work-sans` as
  real dependencies (`app/package.json`, `app/package-lock.json`).
- `src/app/_layout.tsx`: loads `Bitter_600SemiBold`, `Bitter_700Bold`,
  `WorkSans_400Regular`, `WorkSans_500Medium`, `WorkSans_700Bold` via
  `useFonts()`. The splash isn't allowed to hide until fonts finish
  loading — see "Splash gating" below.
- `src/constants/theme.ts`: `Fonts` now also exposes `display`
  (`Bitter_700Bold`), `displaySemiBold` (`Bitter_600SemiBold`), `body`
  (`WorkSans_500Medium`), `bodyRegular` (`WorkSans_400Regular`), `bodyBold`
  (`WorkSans_700Bold`) alongside the pre-existing `sans`/`serif`/`rounded`/
  `mono` system-font map (renamed internally to `SystemFonts` and spread
  into the exported `Fonts`, so `Fonts.mono` — the only other consumer —
  is unaffected).
- Added `TypeScale` to `theme.ts`: a deliberate ~1.25 modular scale
  (`xs:10, sm:13, base:16, lg:20, xl:25, xxl:31, display:49`) replacing the
  old ad hoc 14/16/32/48px jump. `xxl` (31) and `display` (49) land close
  to the previous subtitle (32) and title (48) sizes, so the visual size
  of headings barely moves — only the underlying scale is now principled.
  (`xs` was originally mis-set to `12` next to a `// 16 / 1.25^2` comment
  that actually computes to `10.24` — a tech-lead review catch, fixed by
  changing the value to `10` rather than the comment, so the scale is
  consistently ~1.25 end to end rather than just having a corrected label
  on a still-inconsistent number.)
- `src/components/themed-text.tsx`: every `type` variant's style now pulls
  its `fontSize` from `TypeScale` and its `fontFamily` from `Fonts`
  (`title`/`subtitle` → Bitter, `default`/`small`/`smallBold`/`link`/
  `linkPrimary` → Work Sans, `code` unchanged/monospace). All 8 `type`
  prop values (`default`, `title`, `small`, `smallBold`, `subtitle`,
  `link`, `linkPrimary`, `code`) still exist with identical names — no
  call site anywhere in the app needed to change.
- Redundant `fontWeight` values were dropped from the styles that now
  carry an explicit per-weight `fontFamily` (mixing a numeric `fontWeight`
  with an already-weighted custom font risks the platform trying to
  synthesize further boldness); `code`'s `fontWeight` was left as-is since
  it still uses the generic system `mono` family, not a specific weight.

### 2. Splash gating (`src/components/animated-icon.tsx` / `.web.tsx`)

`AnimatedSplashOverlay` gained a `ready?: boolean` prop (default `true`,
so any other caller is unaffected). Previously the plain splash `View`'s
`onLayout` directly called `SplashScreen.hideAsync()`; now `onLayout` just
records `laidOut`, and a `useEffect` calls `hideAsync()` only once both
`laidOut && ready` are true. `_layout.tsx` passes
`ready={fontsLoaded || !!fontError}` (both booleans destructured from
`useFonts()`) so the splash never hides until the two font families are
actually loaded — no flash-of-fallback-font. The `.web.tsx` variant (which
always returns `null` — the web build has its own CSS-driven splash) got
the same prop added to its signature for type-shape parity, but it's
unused there since the function body doesn't change.

**Tech-lead review catch, fixed**: the original `useFonts()` call
destructured only `[fontsLoaded]`, discarding the error slot. If font
loading ever fails, `fontsLoaded` stays `false` forever and — since
`ready` was wired straight to it — the splash would hang permanently
instead of falling back to system fonts. Now destructures
`[fontsLoaded, fontError]` and treats either a successful load *or* a
reported error as "ready to stop waiting."

### 3. Color tokens (`src/constants/theme.ts`)

All 5 tokens swapped 1:1 in both light and dark mode, per the plan's
table:

| Token | Light (old → new) | Dark (old → new, brightened) |
|---|---|---|
| `accent` | `#E65100` → `#C9622A` | `#F4511E` → `#E08355` |
| `protein` | `#D81B60` → `#B85C6B` | `#F06292` → `#D98A96` |
| `carbs` | `#FFA000` → `#D9A544` | `#FFC24B` → `#E8C275` |
| `fats` | `#2E7D32` → `#4B7355` | `#66BB6A` → `#7FA989` |
| `bark` | `#3E2723` → `#2B1B13` | `#EFE0DC` (unchanged — already a bright cream, no Material-stock swap needed) |

Dark-mode values weren't in the plan's table (light-only), so I chose
brightened equivalents that preserve the same hue relationships as the
existing light→dark pairs (e.g. the existing `carbs` pair goes amber→a
brighter amber; the new pair follows the same lightening ratio).
`background`/`backgroundElement`/`backgroundSelected` were left untouched
in both modes, per the plan's explicit note not to shift them toward
cream. No call sites changed — everything already read
`theme.accent`/`theme.protein`/etc.

**Tech-lead review catch, fixed**: this pass had left one hardcoded color
untouched — `'#D32F2F'` (Material Red 700), used in `src/app/index.tsx`
for the over-goal state (calorie ring fill/tip color and the calorie
number itself once `calories > goal`), all 3 occurrences on what was
originally lines 154/155/158. Sitting directly next to the new
de-saturated `#C9622A` accent, the leftover saturated Material red read
loud and mismatched. Added a proper theme token instead of another
hardcoded literal:

| Token | Light | Dark (brightened) |
|---|---|---|
| `overGoal` | `#B5432E` — scorched red-clay | `#E2795F` |

All 3 `index.tsx` occurrences now read `theme.overGoal` (light/dark aware,
consistent with every other color in this palette) instead of the literal
hex. Grepped the rest of `src/` for `D32F2F` to confirm no other
occurrence was missed — none were.

### 4. Tabular numerals (`src/app/index.tsx`)

- `styles.calorieNumber` (the Tail Sweep ring's calorie count) gained
  `fontVariant: ['tabular-nums']`.
- The macro-card gram numbers got a new `styles.macroGrams` style (also
  `fontVariant: ['tabular-nums']`) applied to the `ThemedText` that used
  to have no dedicated style.

### 5. `PawPrint` signature motif (`src/components/paw-print.tsx`, new)

A small `react-native-svg`-based paw print (one rounded main pad +
4 toe ellipses, each rotated outward), styled consistently with
`fox-companion.tsx`'s SVG approach (`size`/`color` props, plain shape
primitives, no external assets). Used in two places in `index.tsx`:

- **Daily Forage bucket-label marker**: each bucket label
  (`MORNING FORAGE`, etc.) is now preceded by a small (`size=12`)
  paw print in `theme.textSecondary`, inside a new `styles.bucketLabelRow`
  flex row.
- **Foxxy hero-card watermark**: a large (`size=72`), low-opacity
  (`opacity=0.14`) paw print in `theme.bark`, absolutely positioned in the
  card's bottom-right corner (`styles.foxCardWatermark`) with
  `pointerEvents="none"` so it never intercepts touches. `foxCard` gained
  `overflow: 'hidden'` so the watermark can't bleed past the card's
  rounded corners.

  **Tech-lead double-check (no change needed)**: confirmed `overflow:
  'hidden'` on `foxCard` doesn't clip `FoxMoment` or `FoxCompanion`
  (both rendered at `size={116}` in that same card, as an alternative to
  each other). `foxCard` is an auto-sized flex row (`padding:
  Spacing.four`, no fixed height) — it grows to fit its tallest child, so
  the 116×116 fox/moment box is always fully inside the card's content
  area with room to spare, never clipped. The watermark itself is placed
  with positive `right`/`bottom` insets (`styles.foxCardWatermark`),
  keeping it inside the card's bounds too, so `overflow: 'hidden'` only
  ever clips the watermark's own corners against the card's rounded
  corners — which is the point of adding it — and never touches the fox
  or the moment GIF.

### 6. `useReduceMotion()` in `fox-companion.tsx`

The component now calls `useReduceMotion()` and each of the three idle
`useEffect`s (bob loop, ear-wiggle loop, and the recursive blink
scheduler) starts with an `if (reduceMotion) { ... return; }` guard, added
to each effect's dependency array. The `onTarget`-only sparkle loop was
intentionally left alone: the plan names only bob/blink/ear-wiggle.

**Tech-lead review catch (blocking), fixed**: my original claim that
"`Animated.Value`s default to their resting values, so simply never
starting the loop already renders the resting pose — no extra freeze
logic needed" is only true of the *mount* path. `useReduceMotion()`
starts `false` and only flips `true` once
`AccessibilityInfo.isReduceMotionEnabled()` resolves asynchronously (or
later, if the OS setting is toggled mid-session — the hook also
subscribes to `reduceMotionChanged`). That means:

- On a device with reduce motion already on at launch, all three loops
  briefly **do** start at mount, before the hook's promise resolves.
- If a user toggles the OS setting mid-session, the effects re-run and
  each loop's own cleanup (`bobLoop.stop()` / `wiggleLoop.stop()` /
  `clearTimeout(id)`) just *stops* the animation wherever it happened to
  be — for `blink` (which drives the eyes' `scaleY`), that could
  permanently freeze the eyes squinted at `0.08` instead of open.

Fixed by having each guard explicitly reset its `Animated.Value` to the
resting frame *before* returning, rather than relying on stopping alone:

```ts
if (reduceMotion) {
  bob.setValue(0); // and earWiggle.setValue(0) / blink.setValue(1) in the other two effects
  return;
}
```

So a mid-session toggle now always snaps back to the resting pose
(`bob`/`earWiggle` → `0`, `blink` → `1`, eyes open) instead of freezing at
whatever frame the loop was stopped on.

## Tests added/updated

- `src/components/__tests__/fox-companion.test.tsx`: added a test, with
  `Math.random` mocked deterministic, that exercises the blink scheduler's
  recursive re-schedule and its post-unmount `cancelled` guard (this
  closed a coverage gap in pre-existing code that only executes when a
  second, recursively-scheduled timeout fires after unmount — a branch
  that was already flaky/borderline-covered before this change, since it
  depends on the component's randomized 2200–4800ms delay).
- `src/components/__tests__/paw-print.test.tsx` (new): renders with
  default props and with custom `size`/`color`/`opacity`.
- `src/app/index.tsx`'s existing test suite (`index.test.tsx`) needed no
  changes — the new watermark/marker/tabular-nums additions don't change
  any text assertions it makes, and it still passes unmodified.

### Fix (post-QA): reduce-motion test was a false positive

QA's first pass caught a real bug in the test I originally wrote for
`useReduceMotion()` gating (item 6 above). The original test mocked
`AccessibilityInfo.isReduceMotionEnabled` to resolve `true`, then asserted
`toJSON()` was byte-identical before and after advancing fake timers by
10s. QA proved this was vacuous by temporarily deleting all three
`if (reduceMotion) return;` guards and re-running that exact test — it
still passed unmodified. Root cause: all three animations use
`useNativeDriver: true`, so `Animated`'s internal frame-by-frame state
lives in the native layer and never appears in the JS-serializable tree
`toJSON()` inspects — the before/after snapshot check holds trivially
whether or not a loop is actually running.

Rewrote the test to instead spy on the actual call sites
(`jest.spyOn(Animated, 'loop')` and `jest.spyOn(Animated, 'timing')`, from
`react-native`'s `Animated`) and assert on whether they're invoked at all,
which — unlike the rendered tree — does distinguish "guard fired" from
"guard didn't fire":

- Switched from spying on `AccessibilityInfo` to mocking
  `@/hooks/use-reduce-motion` directly (`jest.mock(...)` +
  `mockedUseReduceMotion.mockReturnValue(...)`), so each test can force
  `reduceMotion` synchronously with no async-resolution race to wait out
  (the old approach's state started `false` and only flipped to `true`
  after a promise resolved, which would have undermined a call-count
  assertion taken right at mount).
- Added a companion **"off" test** (`starts the bob/ear-wiggle
  Animated.loop when reduce motion is off`) asserting the spies **are**
  called — without it, an always-passing assertion (e.g. a typo'd
  `.not.not.toHaveBeenCalled()`) could slip through undetected, which is
  exactly the class of bug being fixed here.
- Both new tests render with `mood="neutral"` (the default), not
  `mood="onTarget"` — the sparkle loop is gated on `mood`, not
  `reduceMotion` (intentionally, per the plan's scope — only
  bob/blink/ear-wiggle are in scope for this gate), and would otherwise
  call `Animated.loop`/`Animated.timing` regardless of the mocked
  `reduceMotion` value, confounding both assertions.
- The blink scheduler's `Animated.timing` calls happen inside a
  `setTimeout` callback, not synchronously on mount, so the "off" test's
  assertion is carried entirely by the bob/ear-wiggle loops constructing
  synchronously in their mount-time `useEffect`s — which is sufficient,
  since all three effects' guards are structured identically
  (`if (reduceMotion) return;` as the very first line, before anything
  `Animated`-related is constructed).

**My own mutation-check** (mirroring QA's, done independently after the
fix): temporarily deleted the same three `if (reduceMotion) return;` lines
in `fox-companion.tsx`, ran `npx jest fox-companion` — the new
`does not start the bob/blink/ear-wiggle Animated.loop/timing calls when
reduce motion is on` test failed as expected (`Received number of calls:
2` for both `loopSpy` and `timingSpy`, from the now-unguarded bob and
ear-wiggle loops), while the "off" test and all others still passed.
Restored the three guard lines and re-ran — all 7 tests in the file
passed again, confirming the test now actually proves the gating works in
both directions.

### Fix (post-tech-lead): reduce-motion guards only covered the mount path

Tech-lead review then caught the deeper bug described under item 6 above
— the guards stopped the loops but never reset the driven values, so a
mid-session reduce-motion toggle could freeze `blink` squinted instead of
open. This is a scenario the reduce-motion test suite up to that point
still couldn't have caught, since every existing test set the mocked hook
to a single static value *before* rendering — none of them modeled the
hook's value changing *after* mount, which is exactly the path the bug
lived on.

Added a new test, `resets bob/blink/ear-wiggle to their resting values
when reduce motion toggles on mid-session`:

- Renders with the mocked hook returning `false`, then flips the mock to
  `true` and calls `rerender(...)` — simulating the hook's own
  `reduceMotionChanged` subscription firing mid-session, not just a
  different static value picked before the first render.
- Spies on `Animated.Value.prototype.setValue`, clearing the spy's
  recorded calls right after the initial mount (so only calls made in
  response to the *toggle* are counted).
- Asserts exactly 2 calls with argument `0` (bob + ear-wiggle resetting)
  and exactly 1 call with argument `1` (blink resetting to eyes-open) —
  precise enough that removing any one of the three `setValue(...)` lines
  breaks a specific count, not just "some assertion somewhere."

**My own mutation-check for this fix**: temporarily removed all three
`bob.setValue(0)` / `earWiggle.setValue(0)` / `blink.setValue(1)` calls
(keeping the `if (reduceMotion) return;` guards themselves intact), ran
`npx jest fox-companion -t "resets bob"` — failed exactly as expected
(`Expected length: 2, Received length: 0` for the `0`-argument calls).
Restored the three lines and re-ran the full file — all 8 tests passed.

## Verification

### Automated

- `npx jest --coverage` (in `app/`), re-run after the tech-lead-review
  fixes (blocking reduce-motion-reset fix + the 3 cheap fixes) above:
  **156 tests, 21 suites, all passing** (one more test than the QA-pass
  number — the new mid-session-toggle companion test). Aggregate
  coverage: **97.97% stmts / 89.43% branch / 97.95% funcs / 99.39%
  lines** — a hair higher than the pre-fix 97.95% stmts (the new test adds
  covered statements) and still above the required bar
  (97.83/89.18/–/99.35) on every measured axis; `fox-companion.tsx` itself
  stays at 100%/100%/100%/100%.
  - Note: measuring the *pre-existing, untouched* baseline in this same
    environment (via `git stash`, done during the original implementation
    pass) came out at 97.73/88.76/–/99.38 — slightly *below* the plan's
    stated bar on stmts/branch. This is because one pre-existing branch in
    `fox-companion.tsx`'s blink scheduler only gets exercised depending on
    `Math.random()`'s value during the test run, making the aggregate
    mildly run-to-run flaky independent of anything in this change. A
    deterministic-`Math.random()` test added earlier in this pass closes
    that gap for good, which is why the post-change number is both higher
    than the plan's bar *and* more stable than the baseline was.
- `npx tsc --noEmit`, re-run after all fixes: only the same 3 pre-existing
  errors remain (`animated-icon.tsx:150` spread-from-object-types,
  `app-tabs.web.tsx:71` and `collapsible.tsx:22` SF Symbols typing) — all
  three untouched by this change. No new errors introduced.

### Visual (manual, via Playwright against the running app)

Launched the real backend (`backend/src/index.js`) and Expo web build
(`npx expo start --web`) and drove them with a headless Chromium browser
(per the repo's `run-foxbite-web` skill).

- **Sign-in screen** (unauthenticated, reachable without credentials):
  confirmed it renders unchanged — it deliberately keeps its own fixed
  dark look per the plan's explicit "out of scope" note, and does not use
  `ThemedText`/theme color tokens.
  Screenshot inspected directly; matches the pre-existing look.
- **Dashboard screen could not be reached and screenshotted directly.**
  Signing in requires real Clerk credentials (none seeded in this repo,
  per the `run-foxbite-web` skill's own note), and the sign-up path hit a
  Cloudflare bot-protection challenge ("Verify you are human") that a
  headless browser cannot solve — this is an environment/tooling
  limitation, not a code defect introduced by this change.
- **Font rendering was verified as a substitute**, since `useFonts()`
  loads fonts in the root layout regardless of auth state: confirmed via
  `document.fonts.check(...)` in the live page that all 5 font faces
  (`Bitter_700Bold`, `Bitter_600SemiBold`, `WorkSans_400Regular`,
  `WorkSans_500Medium`, `WorkSans_700Bold`) load and render correctly when
  given text to display — screenshotted the result and visually confirmed
  Bitter renders as a genuine slab-serif and Work Sans as a distinct
  humanist sans, clearly different from each other and from the sign-in
  screen's plain system sans. This proves the font files, package
  installs, and exact family-name wiring in `theme.ts`'s `Fonts` object
  are all correct and load successfully in a real browser — the same
  mechanism the Dashboard's `ThemedText` instances use — short of
  screenshotting the gated Dashboard route itself.
- **Palette tokens were not independently visually re-confirmed** beyond
  code review (exact hex diff above, no call-site changes needed since
  every usage already reads `theme.accent`/`theme.protein`/etc.), for the
  same sign-in-gating reason.

## Deferred / blocked

- **Live Dashboard screenshot** (fonts *and* palette together, as the
  acceptance criteria ask for): blocked by lack of seeded Clerk test
  credentials and a Cloudflare bot-protection challenge on sign-up in this
  environment. Recommend the next reviewer either supply real test
  credentials (the `run-foxbite-web` skill documents the exact
  interaction steps once credentials are available) or accept the
  font-face-level verification above as sufficient, since it exercises
  the identical font-loading/rendering path the Dashboard uses.
- Nothing else from the plan's 6-item scope was skipped or reduced.

## Out of scope (per plan, untouched)

- Sign-in screen's fixed dark look.
- `fox-companion.tsx`'s paths/shapes and the GIF-moments feature.
- Backend, billing, AI-scan.
