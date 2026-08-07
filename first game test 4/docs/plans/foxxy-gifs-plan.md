# Plan: use Gifs/ assets to make Foxxy livelier

Ticket: [Sphinx3231/skills#1](https://github.com/Sphinx3231/skills/issues/1)

## Context

`HANDOFF.md`'s "Next session" note asks to use the five GIFs in
`app/assets/Gifs/` to make the app more lively. Those GIFs:

| File | Dimensions | Size |
|---|---|---|
| `fox_01_wave.gif` | 391×480 | 3.8 MB |
| `fox_02_sleepy.gif` | 480×381 | 2.1 MB |
| `fox_03_celebrate.gif` | 480×438 | 1.9 MB |
| `fox_04_resting.gif` | 480×274 | 1.7 MB |
| `fox_05_order.gif` | 480×422 | 2.0 MB |

Total ≈ 11.6 MB. That's a real bundle-size cost (see Risks below).

`HANDOFF.md`'s "Recent decisions" section is directly relevant: an earlier
session tried replacing the hand-drawn SVG `FoxCompanion` with an
image-based redesign (screenshot, then cropped expression tiles), and the
user explicitly reverted it, asking to "rewind ... but not before the GUI
changes." **This plan does not re-open that decision.** The SVG fox stays
the persistent, ambient companion. The GIFs are used for short, event-
triggered moments layered on top of/around it — additive, not a
replacement.

## Approach

Add a new component, `FoxMoment`, that shows one of the five GIFs briefly
(as an overlay or inline swap) in response to a specific in-app event, then
returns to the normal SVG `FoxCompanion`. Nothing about `FoxCompanion`
itself changes.

Proposed event → GIF mapping:

| Event | GIF | Where |
|---|---|---|
| Dashboard/Companion screen first focuses in a session | `fox_01_wave.gif` | `index.tsx` (Dashboard), one-shot per session via a ref flag |
| No food logged yet today (currently the `empty` SVG mood) | `fox_02_sleepy.gif` | Dashboard hero, shown briefly on load when `mood === 'empty'`, then settles to the SVG |
| Hitting the day's calorie/macro target (currently the `onTarget` SVG mood) *or* unlocking a streak wardrobe item | `fox_03_celebrate.gif` | Dashboard (on newly reaching target) and Companion screen (on new unlock) |
| Went over the goal (currently the `over` SVG mood) | `fox_04_resting.gif` | Dashboard hero, brief transition into the SVG "content/full" pose |
| Successfully logging a food entry (manual or AI photo scan) | `fox_05_order.gif` | Log screen (`log.tsx`), on save success, before navigating back |

Each moment plays once per trigger (not looping indefinitely) — `expo-image`
supports capping playback, or the component unmounts the GIF and swaps back
to the SVG after the GIF's natural duration.

## Technical notes

- Use `expo-image`'s `<Image>` (already a dependency, `~3.0.11`) — it
  decodes animated GIFs natively on iOS/Android and via `<img>` on web,
  and supports `onLoad`/caching better than the bare RN `Image`.
- `expo-image` v3 does **not** expose an "animation finished" event for
  GIFs (unlike its Lottie-style APIs). `FoxMoment` takes
  `{ gif: FoxMomentKind; onDone: () => void }` and calls `onDone` after a
  **fixed duration measured per file** by visually checking each GIF's loop
  length — there is no playback-capping API being relied on here. This is a
  little fragile if the GIFs are ever swapped for longer/shorter ones; note
  the measured duration next to each constant in code as a comment.
- Preload each GIF with `Image.prefetch(...)` **lazily, per screen**, when
  that screen mounts (Dashboard prefetches wave/sleepy/celebrate/resting;
  Log prefetches order) rather than all five eagerly at app start — this
  keeps startup memory/network cost from front-loading assets a session may
  never trigger.
- **Cross-screen dedup** ("wave once per session"): a component-local `ref`
  does not work — Dashboard and Companion are separate Expo Router screens
  that unmount/remount on navigation, and the same screen re-focusing also
  resets a ref. Use a plain module-level flag in a new small file (e.g.
  `app/src/lib/fox-moments.ts`, exporting `hasWavedThisSession` +
  a setter) — the project has no context/store already, so a
  singleton module variable is the smallest addition consistent with its
  existing lightweight style (see `dashboard-logic.ts` for the precedent of
  small pure-logic modules).
- **Unlock-celebration trigger is new logic, not existing signal.**
  `companion.tsx` currently has no memory of the *previous* unlock state —
  it only renders `companion.unlockedItems` as given by the API each load.
  Detecting a **newly** unlocked item (vs. an already-unlocked one) requires
  comparing the freshly-fetched `unlockedItems` against the previously-seen
  set (kept in the same `fox-moments.ts` module, or component state seeded
  from a first successful load) and firing the celebrate moment only on a
  set-difference, not on every render where an item happens to be unlocked.
- **Reduced motion**: check `AccessibilityInfo.isReduceMotionEnabled()`
  (built into React Native core, no new dependency) before triggering any
  `FoxMoment`; when reduce-motion is on, skip straight to the SVG mood the
  GIF would have led into, no autoplaying GIF at all.
- No changes to `fox-companion.tsx` itself — the two known SVG bugs noted in
  `HANDOFF.md` (rotation-string coercion, chest-ruff paint order) are out of
  scope for this ticket.

## Acceptance criteria

- [ ] Each of the five triggers in the mapping table fires its GIF exactly
      once per occurrence (not on every re-render/re-focus) and returns to
      the normal SVG `FoxCompanion` afterward.
- [ ] `AccessibilityInfo.isReduceMotionEnabled()` being true suppresses all
      five GIF moments; the underlying SVG mood/state change still happens.
- [ ] If a GIF hasn't finished prefetching when its trigger fires, the
      screen still functions correctly (either shows the SVG mood
      immediately with no error, or waits briefly — pick one and test it;
      it must not crash or hang the screen).
- [ ] Rapid re-triggering (e.g. logging two foods back to back) doesn't
      stack overlapping `FoxMoment` instances or crash — the second trigger
      either queues, replaces, or is ignored while one is already playing
      (pick one, document the choice).
- [ ] Full `npm test` in `app/` stays green, and coverage doesn't regress
      below its current bar (97.27% statements / 99.2% lines / 88.25%
      branches).

## Risks / open questions

- **Bundle size**: 11.6 MB across 5 GIFs is significant for an Expo app,
  especially the web target (Metro bundles all assets together). Out of
  scope to re-encode/trim them in this ticket, but flagging: if this
  noticeably slows web load, a follow-up ticket should compress or convert
  to WebP/APNG.
- **Decoded in-memory cost is separate from bundle size.** Even lazily
  prefetched, an animated GIF stays decoded in memory while its `<Image>` is
  mounted; holding multiple `FoxMoment` instances concurrently (see the
  rapid-retrigger acceptance criterion) multiplies that cost. Keeping only
  one `FoxMoment` mounted at a time avoids this — call this out in the
  implementation, don't just rely on unmounting to be prompt.
- **`expo-image` mockability under `jest-expo`** hasn't been verified —
  confirm before writing tests, given the project's existing coverage bar;
  if it can't be shallow-rendered cleanly, `FoxMoment`'s trigger/timeout
  logic should be extracted as a pure/testable unit the way
  `dashboard-logic.ts` separates logic from the screen component.
- **Web test environment**: per `HANDOFF.md`, `jest-expo` reports
  `Platform.OS === 'ios'` in tests regardless of target — `FoxMoment`'s
  tests will need to assert on trigger/timeout logic rather than platform
  branches.

## Verification plan

- Unit tests for `FoxMoment`'s trigger/timeout/onDone logic (mirroring the
  existing `dashboard-logic.ts` testing style — pure logic extracted where
  possible).
- Manual check in `npx expo start --web` for all five triggers (session
  wave, empty-state sleepy, target-hit celebrate, over-goal resting,
  log-success order).
- Run full `npm test` in `app/` after the change, not just the new test
  file, per the project's existing coverage bar (97%+ statements).

## Review

Reviewed by a `general-purpose` agent standing in for a dedicated
tech-lead/CTO role (none configured for this project). Five findings came
back, all blocking:

1. Mood-tied GIF triggers are close to the previously-reverted raster/SVG
   swap, just time-boxed — **resolved**: explicit user sign-off obtained to
   proceed with brief GIF moments tied to mood changes.
2. Session-dedup via component ref doesn't survive navigation — **resolved**
   in the plan: module-level flag in `app/src/lib/fox-moments.ts`.
3. Internal contradiction on `expo-image`'s playback-capping vs. hardcoded
   duration — **resolved**: plan now states plainly there's no
   animation-ended event; duration is hardcoded and measured per file.
4. Unlock-celebration needs new "just unlocked" diff logic that doesn't
   exist yet — **resolved**: called out explicitly as new logic in
   Technical notes, not existing signal.
5. No reduced-motion handling — **resolved**: `AccessibilityInfo
   .isReduceMotionEnabled()` gate added.

Plan approved. Awaiting the user's go-ahead to implement.
