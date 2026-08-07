import type { FoxMood } from '@/components/fox-companion';

export type FoxMomentKind = 'wave' | 'sleepy' | 'celebrate' | 'resting' | 'order';

// Measured by summing each GIF's per-frame delay (graphic control extension),
// not guessed — see docs/plans/foxxy-gifs-plan.md. Re-measure if the source
// GIFs are ever replaced.
export const FOX_MOMENT_DURATIONS: Record<FoxMomentKind, number> = {
  wave: 2840,
  sleepy: 1960,
  celebrate: 1440,
  resting: 1880,
  order: 1480,
};

// Module-level, not component state: Dashboard and Companion are separate
// Expo Router screens that unmount/remount on navigation, so a ref or piece
// of component state can't dedupe "already waved this session" across them.
let wavedThisSession = false;

export function hasWavedThisSession(): boolean {
  return wavedThisSession;
}

export function markWavedThisSession(): void {
  wavedThisSession = true;
}

// Test-only: lets each test start from a clean session.
export function resetFoxMomentsSessionState(): void {
  wavedThisSession = false;
}

export function shouldPlayFoxMoment(reduceMotionEnabled: boolean): boolean {
  return !reduceMotionEnabled;
}

/**
 * Which celebratory moment (if any) a mood change should trigger.
 *
 * `previousMood` is `null` on the first evaluation after a screen mounts —
 * in that case we only greet an already-empty day (sleepy), never celebrate
 * or console for a mood the user already arrived in, since that would refire
 * on every re-open rather than on an actual change. Once a previous mood is
 * known, only an actual transition into onTarget/over fires a moment.
 */
export function momentForMoodTransition(previousMood: FoxMood | null, nextMood: FoxMood): FoxMomentKind | null {
  if (previousMood === null) {
    return nextMood === 'empty' ? 'sleepy' : null;
  }
  if (previousMood === nextMood) return null;
  if (nextMood === 'onTarget') return 'celebrate';
  if (nextMood === 'over') return 'resting';
  return null;
}
