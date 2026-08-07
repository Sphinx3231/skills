# Plan: FoxBite design refresh (typography, palette, one signature motif)

Branch: `foxbite-design-refresh` (isolated from `main` per the gated-build skill).
No GitHub issue filed — this is a design-quality pass initiated directly via
`/gated-build`, not a tracked bug/feature ticket.

## Design plan (frontend-design skill process)

**Subject**: FoxBite is a calorie tracker skinned as a fox-companion
pet-raising game — "The Den" (dashboard), "Quick Snare" (logging), "Daily
Forage" (meal timeline), streak-gated wardrobe unlocks. Audience wants
warmth and whimsy over a clinical macro-tracker. Job of the UI: make daily
logging feel like checking in on a pet, not filling out a form.

**What's currently generic** (checked against the actual `theme.ts`, not
assumed):
- `accent: '#E65100'`, `protein: '#D81B60'`, `carbs: '#FFA000'`,
  `fats: '#2E7D32'` are Material Design's stock "Orange 900 / Pink 700 /
  Amber 700 / Green 800" swatches verbatim — despite the app's own
  `foxbite` skill doc calling this a "woodland palette," it's an unmodified
  framework default.
- `Fonts` in `theme.ts` maps to `system-ui`/`normal` — no chosen typeface at
  all, so headings and the calorie number carry no typographic personality.
  Type scale (14/16/32/48px across `ThemedText` variants) is an arbitrary
  jump, not a deliberate ratio.
- `fox-companion.tsx`'s idle bob/blink/ear-wiggle loops don't check
  `useReduceMotion` (already added to `index.tsx`/`companion.tsx`/`log.tsx`
  for the GIF moments, but never applied to the SVG's own idle animation) —
  a real, checkable accessibility gap, not a design nitpick.

**Color** (bespoke woodland-dusk palette, replacing the Material swatches
1:1 so every existing usage site just picks up the new value):

| Token | Old (Material stock) | New |
|---|---|---|
| `accent` | `#E65100` (Orange 900) | `#C9622A` — ember/burnt-clay, warmer and less traffic-cone than stock orange |
| `protein` | `#D81B60` (Pink 700) | `#B85C6B` — dusty berry |
| `carbs` | `#FFA000` (Amber 700) | `#D9A544` — dulled honey |
| `fats` | `#2E7D32` (Green 800) | `#4B7355` — forest moss |
| `bark` | `#3E2723` (Brown 900) | `#2B1B13` — richer, less "brown crayon" |

Dark-mode equivalents get the same treatment (brightened for contrast, same
naming). Backgrounds (`background`, `backgroundElement`,
`backgroundSelected`) **stay neutral white/near-black** — deliberately not
shifted toward cream, to avoid pairing a warm accent with a cream ground
(the exact AI-generic combination the frontend-design skill calls out).

**Type** (2 roles, both via `@expo-google-fonts`, already whitelisted in
`jest.config`'s `transformIgnorePatterns` though never actually used yet):
- Display (headings, screen titles, "Foxxy says"): **Bitter** — a grounded
  slab-serif with real texture, warm without being the high-contrast
  editorial serif that pairs with the cream-background cliché.
- Body: **Work Sans** — clean humanist sans, distinct from Inter/Space
  Grotesk.
- Type scale: replace the ad hoc 14/16/32/48 jump with a deliberate ~1.25
  ratio scale in `ThemedText`, keeping the existing `type` prop names so
  call sites don't need to change.
- Calorie/macro numbers get `fontVariant: ['tabular-nums']` so digits align
  as they change (RN supports this natively — no new dependency).

**Signature motif**: a small hand-drawn **paw-print SVG glyph**, used as
(a) the marker before each Daily Forage bucket label (replacing the plain
uppercase text-only label), and (b) a low-opacity corner watermark on the
Foxxy hero card. This ties directly to FoxBite's own vocabulary (forage,
tracks) rather than the generic "big number + gradient" hero pattern the
frontend-design skill explicitly warns is the template answer — the Tail
Sweep ring already *is* that pattern structurally, so the signature element
deliberately lives somewhere else instead of doubling down on it.

**Restraint**: no new screens, no restructuring of the gradient hero
cards/AmbientGlow (those are already a legitimate, working brand element),
no new animation beyond what's needed to fix the reduce-motion gap. One
new SVG component (the paw-print), reused in two places.

## Scope of implementation

1. Add `@expo-google-fonts/bitter` + `@expo-google-fonts/work-sans` deps;
   load via `useFonts` in `src/app/_layout.tsx`, holding the existing
   `SplashScreen.preventAutoHideAsync()` until fonts (and whatever it
   already waits on) are ready.
2. Update `Fonts` and add a type scale to `theme.ts`; update `ThemedText`
   to consume the new scale/families per `type` variant, keeping prop
   names stable.
3. Replace the 5 Material-swatch hex values (light + dark) in `theme.ts`
   with the woodland-dusk tokens above. No call-site changes needed —
   everything already reads `theme.accent`/`theme.protein`/etc.
4. Add `fontVariant: ['tabular-nums']` to the calorie ring number and macro
   card gram numbers.
5. Add a `PawPrint` SVG component (`src/components/paw-print.tsx`); use it
   as the Daily Forage bucket-label marker (`index.tsx`) and as a subtle
   corner watermark on the Foxxy hero card (`index.tsx`).
6. Add `useReduceMotion()` to `fox-companion.tsx` and skip starting the
   bob/blink/ear-wiggle `Animated.loop`s when it's true (render the fox in
   its resting pose instead of a frozen mid-animation frame).

## Explicitly out of scope

- Sign-in screen's fixed dark look (it deliberately commits to one visual
  world per its own comment — not part of this pass).
- Any change to `fox-companion.tsx`'s actual paths/shapes, or to the GIF
  moments feature.
- Backend, billing, AI-scan — frontend/design only.

## Acceptance criteria

- [ ] `theme.ts`'s 5 color tokens no longer match the stock Material Design
      hex values in either light or dark mode.
- [ ] Bitter/Work Sans actually render (verified visually, not just "no
      crash") on at least the Dashboard.
- [ ] `fox-companion.tsx` does not start its `Animated.loop`s when
      `useReduceMotion()` is true; a test proves this (mock the hook,
      assert no loop-related state changes over time / it renders the
      resting pose).
- [ ] `PawPrint` renders in both its usage sites without layout regressions
      (existing screen tests still pass).
- [ ] Full `npx jest --coverage` in `app/` stays green at or above the
      current bar (97.83% stmts / 89.18% branch / 99.35% lines).
- [ ] `npx tsc --noEmit` shows no new errors beyond the 3 pre-existing ones.

## Review

Reviewed by a `tech-lead`-equivalent agent (Opus) per the gated-build
pipeline; environment note below.
