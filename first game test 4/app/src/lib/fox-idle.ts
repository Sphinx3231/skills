import type { FoxMood } from '@/lib/dashboard-logic';

export type FoxIdleKind = 'stand' | 'calm' | 'sleepy' | 'happy' | 'excited' | 'asleep';

/**
 * Dashboard hero idle GIF, direct from `foxxyState()`'s mood — mirrors the
 * "Sly moves!" close-to-goal threshold `foxxyState` already uses (remaining
 * <= 15% of goal) rather than re-deriving a second copy of that comparison.
 */
export function idleKindForDashboard(mood: FoxMood, remaining: number, goal: number): FoxIdleKind {
  if (mood === 'empty') return 'sleepy';
  if (mood === 'over') return 'asleep';
  // `foxxyState()` never actually produces 'neutral' from real dashboard
  // data (it's wardrobe-preview-only) — handled explicitly rather than
  // left to fall through to the onTarget branch below, so a future mood
  // value added to FoxMood can't silently inherit onTarget's behavior.
  if (mood === 'neutral') return 'stand';
  return remaining <= goal * 0.15 ? 'excited' : 'happy';
}

/** Companion hero idle GIF — a live streak reads as more alert than none. */
export function idleKindForCompanion(streakCount: number): FoxIdleKind {
  return streakCount > 0 ? 'calm' : 'stand';
}
