# Plan: replace SVG FoxCompanion with always-looping idle GIFs

Branch: `foxbite-idle-gifs` (isolated from `main`, gated-build pipeline).
No GitHub issue filed — direct user request via `/gated-build`, same as the
just-merged design refresh.

## Brief

User added 6 new GIFs (`app/assets/Gifs/foxidle_0{1-6}_*.gif`: stand, calm,
sleepy, happy, excited, asleep) with explicit instruction: use them for the
companion "alongside the other animations" (the existing 5 one-shot
`FoxMoment` event GIFs — wave/sleepy/celebrate/resting/order), and "I dont
want him to ever be a still png."

**This reopens ground the project has been back-and-forth on.**
`HANDOFF.md`'s "Recent decisions" section records an earlier session that
tried a raster/image-based Foxxy redesign, which the user explicitly
reverted back to the hand-drawn SVG. Confirmed directly with the user this
time (not assumed):
- The SVG `FoxCompanion` is to be **fully replaced**, everywhere it's
  currently used (Dashboard hero, Companion hero, Companion wardrobe grid
  thumbnails) — not kept as a fallback anywhere.
- Mood maps **directly** to idle GIF, same shape as today's `mood` prop.
- Idle GIFs **do** respect `useReduceMotion()` — freeze on a static frame
  when on, via `expo-image`'s `autoplay={false}`. "Never a still png"
  applies to normal use, not to an explicit OS accessibility request; this
  keeps the reduce-motion work from the just-merged design refresh intact
  rather than regressing it.

## Mood → idle GIF mapping

Direct, deterministic, mirrors `foxxyState()`'s existing mood logic
(`app/src/lib/dashboard-logic.ts`) — no new mood values invented.

| Screen / slot | Condition | Idle GIF |
|---|---|---|
| Dashboard hero | `mood === 'empty'` | `sleepy` |
| Dashboard hero | `mood === 'onTarget'`, not within final 15% | `happy` |
| Dashboard hero | `mood === 'onTarget'`, within final 15% of goal (same threshold `foxxyState` already uses for its "Sly moves!" line) | `excited` |
| Dashboard hero | `mood === 'over'` | `asleep` |
| Companion hero | `streakCount > 0` | `calm` |
| Companion hero | `streakCount === 0` | `stand` |
| Companion wardrobe grid thumbnail | any (unlocked or locked) | `stand` |

## Wardrobe accessories survive the swap

`fox-companion.tsx` currently draws `Scarf`/`Hat`/`Crown`/`Backpack` as SVG
paths on top of the fox body, in the same `viewBox="0 0 200 200"` coordinate
space. Extract those four functions verbatim (same paths/positions, don't
redraw them) into a new `FoxWardrobeOverlay` component — a transparent
`react-native-svg` `Svg` sized to match the idle GIF, absolutely positioned
on top of it. This is the only reason the SVG file isn't deleted outright
without extraction first.

## Scope of implementation

1. **`app/src/lib/fox-idle.ts`** — new module, mirrors `fox-moments.ts`'s
   style: `FoxIdleKind` type (`'stand' | 'calm' | 'sleepy' | 'happy' |
   'excited' | 'asleep'`), and `idleKindForDashboard(mood, remaining, goal)`
   / `idleKindForCompanion(streakCount)` pure functions implementing the
   mapping table above (extend `dashboard-logic.ts`'s existing "within 15%"
   threshold logic rather than duplicating it — check how `foxxyState`
   computes that and reuse the same comparison).
2. **`app/src/components/fox-idle.tsx`** — renders one looping idle GIF via
   `expo-image`, `autoplay={!reduceMotion}` (pass `reduceMotion` in as a
   prop; don't have this component call `useReduceMotion()` itself so it
   stays a dumb/testable presentational piece, matching `fox-moment.tsx`'s
   existing split between hook-driven parents and dumb GIF renderers).
3. **`app/src/components/fox-wardrobe-overlay.tsx`** — the extracted
   `Scarf`/`Hat`/`Crown`/`Backpack` SVG paths, same props shape
   (`wearingScarf`/`wearingHat`/`wearingBackpack`/`wearingCrown`) as
   `fox-companion.tsx` took, transparent background, same viewBox.
4. **`app/src/components/foxxy.tsx`** — new composite entry point,
   `<Foxxy kind={...} size={...} wearingScarf={...} .../>` — stacks
   `FoxIdle` and (if any wearing prop is true) `FoxWardrobeOverlay` in a
   sized `View`. This is what replaces `<FoxCompanion>` at all three call
   sites.
5. **Update call sites** in `index.tsx` and `companion.tsx`: swap
   `<FoxCompanion mood={...} .../>` for `<Foxxy kind={idleKindForDashboard(...)} .../>`
   (Dashboard) / `<Foxxy kind={idleKindForCompanion(...)} wearingX .../>`
   (Companion hero + grid). The existing `activeMoment ? <FoxMoment/> :
   <FoxCompanion/>` conditional shape stays — only the "else" branch's
   component changes.
6. **Delete** `app/src/components/fox-companion.tsx` and
   `app/src/components/__tests__/fox-companion.test.tsx` once no call site
   references them — confirm zero remaining references first (`grep -rn
   FoxCompanion src`).

## Explicitly out of scope

- The 5 existing one-shot `FoxMoment` event GIFs and their queue/session
  logic (`fox-moments.ts`, `fox-moment.tsx`, `use-fox-moment-queue.ts`) —
  untouched. They already loop-free/one-shot correctly and already respect
  reduce motion via `shouldPlayFoxMoment`.
- Bundle size: this adds ~11.2MB across 6 GIFs on top of the existing
  ~11.6MB event-GIF set (~23MB total in `assets/Gifs/`). Flagged, not
  addressed — same deferred-compression note as the original GIF-moments
  ticket.
- Sign-in screen, backend, billing — untouched.

## Acceptance criteria

- [ ] `grep -rn "FoxCompanion" app/src` returns nothing outside the deleted
      files' git history.
- [ ] Dashboard, Companion hero, and Companion wardrobe grid all render an
      idle GIF (never the old SVG, never a frozen single frame under normal
      reduce-motion-off use).
- [ ] Wardrobe accessories (scarf/hat/backpack/crown) still render
      correctly layered over the idle GIF on the Companion hero and grid.
- [ ] `useReduceMotion() === true` freezes idle GIFs on a static frame
      (verify via `autoplay` prop, mirroring how `fox-moment.tsx`/screens
      already gate on this hook) — a test proves this, not just a
      plausible-looking prop.
- [ ] Full `npx jest --coverage` in `app/` stays green at or above the
      current bar (97.97% stmts / 89.43% branch / 99.39% lines).
- [ ] `npx tsc --noEmit` shows no new errors beyond the same 3 pre-existing
      ones.

## Review

Same gated-build pipeline as the design refresh: Sonnet build → Sonnet QA
→ Opus tech-lead → Opus CTO verdict (Fable unavailable on this plan).
