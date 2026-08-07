# Outcome: use Gifs/ assets to make Foxxy livelier

Ticket: [Sphinx3231/skills#1](https://github.com/Sphinx3231/skills/issues/1) ·
Plan: [docs/plans/foxxy-gifs-plan.md](../plans/foxxy-gifs-plan.md)

## What changed

Added five short, event-triggered GIF "moments" layered around the existing
hand-drawn SVG `FoxCompanion` — the SVG itself is untouched and remains the
persistent, ambient companion. Each moment plays once, then hands back to the
SVG.

| Trigger | GIF | Screen |
|---|---|---|
| Dashboard/Companion first focuses this session | `fox_01_wave.gif` | Dashboard hero |
| First paint with nothing logged yet today | `fox_02_sleepy.gif` | Dashboard hero |
| Transition into the day's target being hit | `fox_03_celebrate.gif` | Dashboard hero |
| Backend reports a newly-unlocked wardrobe item | `fox_03_celebrate.gif` | Companion hero |
| Transition into going over the goal | `fox_04_resting.gif` | Dashboard hero |
| A food log saves successfully | `fox_05_order.gif` | Log screen, before navigating home |

New files:
- `app/src/lib/fox-moments.ts` — pure logic: session wave flag, mood-transition
  → moment mapping, per-file durations (measured from each GIF's real frame
  delays, not guessed), reduce-motion gate.
- `app/src/hooks/use-fox-moment-queue.ts` — keeps at most one moment mounted
  at a time, queuing anything enqueued while one is already playing.
- `app/src/hooks/use-reduce-motion.ts` — wraps
  `AccessibilityInfo.isReduceMotionEnabled()` + its change event.
- `app/src/components/fox-moment.tsx` — renders one GIF via `expo-image`,
  calls `onDone` after the measured duration.

Modified: `app/src/app/index.tsx`, `app/src/app/companion.tsx`,
`app/src/app/log.tsx` to wire the above in, plus their test files.

## Why (design decisions)

- **Additive, not a replacement.** The prior session explicitly reverted a
  permanent raster/SVG swap for Foxxy (see `HANDOFF.md` → "Recent
  decisions"). These GIFs are brief, event-triggered overlays that hand back
  to the SVG — the user explicitly signed off on this being a different,
  acceptable category of change during plan review.
- **Reviewer-driven correction on Companion's unlock trigger.** The first
  draft detected "newly unlocked" client-side via a ref comparing the
  previous vs. current load. Re-reading `backend/src/routes/companion.js`
  during implementation showed the backend already computes this diff
  server-side and returns it as `newlyUnlocked`, persisting the unlock in
  the same request — the client-side version was not just redundant but
  wrong, since it could never fire on a screen's very first load after an
  unlock (the exact moment celebration matters most). Switched to reading
  `companion.newlyUnlocked` directly; deleted the now-unused
  `getNewlyUnlocked` helper and its tests.
- **Session dedup at module scope, not component state.** Dashboard and
  Companion are separate Expo Router screens that unmount/remount on
  navigation, so `hasWavedThisSession`/`markWavedThisSession` live as
  module-level state in `fox-moments.ts` rather than a ref.
- **Durations are measured, not guessed.** Summed each GIF's per-frame
  delay (GIF89a graphic control extension) via a one-off parsing script
  rather than eyeballing loop length — see `FOX_MOMENT_DURATIONS` in
  `fox-moments.ts` for the resulting constants.

## Verification

- `npx jest --coverage` in `app/`: **145/145 passing**.
  Coverage 97.83% stmts / 89.18% branch / 97.93% funcs / 99.35% lines —
  at or above the project's previously documented bar (97.27% / 88.25% /
  99.2%).
- `npm test` in `backend/` (untouched by this ticket, run anyway per the
  pipeline's "run the full suite" rule): **40/40 passing**.
- `npx tsc --noEmit`: no new errors (3 pre-existing errors in unrelated
  files — `animated-icon.tsx`, `app-tabs.web.tsx`, `collapsible.tsx` — were
  present before this change and aren't touched by it). This claim was
  initially wrong in an earlier draft of this doc: `tsc` actually reported a
  4th error inside this ticket's own new
  `use-reduce-motion.test.ts` (a type mismatch on a mocked event handler),
  caught during outcome-doc review. Fixed with a narrowing cast
  (`as unknown as ...`) and reconfirmed 0 new errors.
- Mutation-checked the new logic rather than trusting green tests blindly:
  temporarily broke `momentForMoodTransition`'s null-check and confirmed the
  "does not celebrate/rest on first evaluation" test failed, then restored
  it.
- Two test-authoring bugs were caught and fixed during this work, not just
  the app code: an un-awaited `act()` call in `use-fox-moment-queue.test.ts`
  that silently corrupted the render result (testing-library's `act` returns
  a Promise in this version), and a `mockRestore()` on
  `AccessibilityInfo.isReduceMotionEnabled` in `log.test.tsx` that broke the
  mock for every later test in the file — replaced with `mockResolvedValueOnce`
  so it self-clears.
- An unrelated side effect was caught and reverted: running `npx expo lint`
  as a verification step triggered an eslint auto-install that modified
  `package.json`/`package-lock.json` and added `eslint.config.js`, but the
  install never actually resolved (lint still doesn't run in this repo).
  Reverted those three files rather than commit a broken, out-of-scope
  change.

## Review

- **Plan review** (before implementation): 5 blocking findings, all
  resolved — see the plan doc's own "Review" section.
- **Implementation review** (`general-purpose` agent standing in for a
  tech-lead/CTO, after implementation): **approved, no blocking findings.**
  Two non-blocking notes: `index.tsx` keeps a redundant `hasWavedRef`
  alongside the module-level session flag (harmless belt-and-suspenders);
  the 11.6MB GIF bundle-size risk remains deferred, as the plan already
  flagged and the user accepted.

## Deferred / left out

- **Bundle size** (11.6MB across 5 GIFs) — flagged in the plan, not
  addressed here. A follow-up ticket should compress or convert to
  WebP/APNG if it noticeably slows the web build.
- The two known SVG bugs in `fox-companion.tsx` (rotation-string coercion,
  chest-ruff paint order) noted in `HANDOFF.md` — out of scope, untouched.
- Manual on-device verification (`npx expo start --web`, tapping through all
  five triggers) has not been done in this session — only automated tests.
  Recommend a manual pass before considering this fully done.
