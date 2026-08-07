import { idleKindForCompanion, idleKindForDashboard } from '../fox-idle';

describe('idleKindForDashboard', () => {
  test('empty mood maps to sleepy', () => {
    expect(idleKindForDashboard('empty', 2000, 2000)).toBe('sleepy');
  });

  test('over mood maps to asleep', () => {
    expect(idleKindForDashboard('over', -500, 2000)).toBe('asleep');
  });

  test('onTarget comfortably under goal maps to happy', () => {
    expect(idleKindForDashboard('onTarget', 1000, 2000)).toBe('happy');
  });

  test('onTarget within the final 15% of goal maps to excited', () => {
    expect(idleKindForDashboard('onTarget', 50, 2000)).toBe('excited');
  });

  test('onTarget exactly at the 15% threshold maps to excited (inclusive, mirrors foxxyState)', () => {
    expect(idleKindForDashboard('onTarget', 300, 2000)).toBe('excited');
  });

  test('onTarget just above the 15% threshold maps to happy', () => {
    expect(idleKindForDashboard('onTarget', 301, 2000)).toBe('happy');
  });

  test('neutral mood (wardrobe-preview-only, not real dashboard data) has its own explicit branch, not an onTarget fallthrough', () => {
    expect(idleKindForDashboard('neutral', 1000, 2000)).toBe('stand');
  });
});

describe('idleKindForCompanion', () => {
  test('a positive streak maps to calm', () => {
    expect(idleKindForCompanion(1)).toBe('calm');
    expect(idleKindForCompanion(30)).toBe('calm');
  });

  test('a zero streak maps to stand', () => {
    expect(idleKindForCompanion(0)).toBe('stand');
  });
});
