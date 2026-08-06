import { bucketLogs, foxxyState } from '../dashboard-logic';
import type { FoodLog } from '@/lib/api';

// bucketLogs interprets `logged_at` as a UTC instant (it appends 'Z') and
// buckets by the *viewer's local* hour — matching how the rest of the UI
// displays times via toLocaleTimeString(). To test bucket boundaries
// independent of the machine's timezone, build inputs from a Date
// constructed in local wall-clock time, then re-derive the UTC string the
// same way `datetime('now')` would produce it (no 'Z', space-separated).
function atLocalHour(hour: number, minute = 0): string {
  const d = new Date(2026, 0, 1, hour, minute, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function log(overrides: Partial<FoodLog>): FoodLog {
  return {
    id: 1,
    logged_at: atLocalHour(12),
    food_name: 'Test food',
    calories: 100,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    source: 'manual',
    ...overrides,
  };
}

describe('bucketLogs', () => {
  test('sorts logs into morning/midday/evening/snare by local hour', () => {
    const buckets = bucketLogs([
      log({ id: 1, logged_at: atLocalHour(7) }), // morning
      log({ id: 2, logged_at: atLocalHour(13) }), // midday
      log({ id: 3, logged_at: atLocalHour(19) }), // evening
      log({ id: 4, logged_at: atLocalHour(2) }), // quick snare (late night)
    ]);

    const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b.logs.length]));
    expect(byLabel['Morning Forage']).toBe(1);
    expect(byLabel['Midday Feast']).toBe(1);
    expect(byLabel['Evening Den']).toBe(1);
    expect(byLabel['Quick Snare']).toBe(1);
  });

  test('groups multiple logs into the same bucket', () => {
    const buckets = bucketLogs([log({ id: 1, logged_at: atLocalHour(7) }), log({ id: 2, logged_at: atLocalHour(9, 30) })]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].logs).toHaveLength(2);
  });

  test('omits empty buckets entirely', () => {
    const buckets = bucketLogs([log({ logged_at: atLocalHour(8) })]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].label).toBe('Morning Forage');
  });

  test('returns no buckets for an empty log list', () => {
    expect(bucketLogs([])).toEqual([]);
  });

  test('bucket boundary hours are inclusive of the start and exclusive of the end', () => {
    const buckets = bucketLogs([
      log({ id: 1, logged_at: atLocalHour(5) }), // start of morning
      log({ id: 2, logged_at: atLocalHour(10, 59) }), // end of morning
      log({ id: 3, logged_at: atLocalHour(11) }), // start of midday
    ]);
    const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b.logs.length]));
    expect(byLabel['Morning Forage']).toBe(2);
    expect(byLabel['Midday Feast']).toBe(1);
  });
});

describe('foxxyState', () => {
  test('empty mood when nothing has been logged yet', () => {
    const state = foxxyState(0, 0, 2000);
    expect(state.mood).toBe('empty');
    expect(state.line).toContain('forage');
  });

  test('over mood once calories exceed the goal', () => {
    const state = foxxyState(3, 2500, 2000);
    expect(state.mood).toBe('over');
    expect(state.line).toContain('den');
  });

  test('onTarget mood while comfortably under goal with logs present', () => {
    const state = foxxyState(2, 1000, 2000);
    expect(state.mood).toBe('onTarget');
    expect(state.line).toContain('1000 cal remaining');
  });

  test('onTarget mood switches to the close-to-goal message near the finish line', () => {
    const state = foxxyState(4, 1950, 2000);
    expect(state.mood).toBe('onTarget');
    expect(state.line).toContain('Sly moves');
  });

  test('exactly at goal counts as onTarget, not over', () => {
    const state = foxxyState(2, 2000, 2000);
    expect(state.mood).toBe('onTarget');
  });
});
