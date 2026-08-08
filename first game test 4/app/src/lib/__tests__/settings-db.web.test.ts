/**
 * @jest-environment jsdom
 */
// jsdom (not jest-expo's default RN environment) is required here because
// this file is the only one in the suite that touches a real `localStorage`
// global — everything else in this codebase runs against native RN APIs.
// Import the .web.ts file explicitly — jest-expo resolves the
// platform-less specifier to the native file by default, so this is the
// only way to exercise the web-specific localStorage-backed implementation
// (see use-color-scheme.web.test.tsx for the same pattern already used in
// this codebase).
import {
  isSyncPending,
  markCacheSynced,
  readCachedSettings,
  writeCachedSettings,
  __resetForTests,
} from '../settings-db.web';
import type { UserSettings } from '@/lib/api';

function settings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    dailyCalorieGoal: 2000,
    proteinGoalG: 125,
    carbsGoalG: 225,
    fatsGoalG: 67,
    macroUnit: 'grams',
    themeMode: 'woodland_dusk',
    motionSetting: 'system_default',
    equippedScarf: true,
    equippedHat: true,
    equippedCrown: true,
    equippedBackpack: true,
    ...overrides,
  };
}

describe('settings-db.web (localStorage local cache)', () => {
  beforeEach(() => {
    __resetForTests();
  });

  test('readCachedSettings returns null before anything has been written', () => {
    expect(readCachedSettings()).toBeNull();
  });

  test('writeCachedSettings then readCachedSettings round-trips the full shape', () => {
    writeCachedSettings(settings({ themeMode: 'dark', proteinGoalG: 150 }), false);
    expect(readCachedSettings()).toEqual(settings({ themeMode: 'dark', proteinGoalG: 150 }));
  });

  test('a later write overwrites the earlier cached row (single-row upsert)', () => {
    writeCachedSettings(settings({ dailyCalorieGoal: 2000 }), false);
    writeCachedSettings(settings({ dailyCalorieGoal: 2200 }), false);
    expect(readCachedSettings()?.dailyCalorieGoal).toBe(2200);
  });

  test('isSyncPending is false with no cached row', () => {
    expect(isSyncPending()).toBe(false);
  });

  test('writeCachedSettings(..., true) marks the row pending sync', () => {
    writeCachedSettings(settings(), true);
    expect(isSyncPending()).toBe(true);
  });

  test('markCacheSynced clears the pending flag', () => {
    writeCachedSettings(settings(), true);
    expect(isSyncPending()).toBe(true);

    markCacheSynced();
    expect(isSyncPending()).toBe(false);
  });

  test('markCacheSynced is a no-op when there is no cached row yet', () => {
    expect(() => markCacheSynced()).not.toThrow();
    expect(readCachedSettings()).toBeNull();
  });

  test('boolean equip flags round-trip correctly when false', () => {
    writeCachedSettings(settings({ equippedScarf: false, equippedCrown: false }), false);
    const result = readCachedSettings();
    expect(result?.equippedScarf).toBe(false);
    expect(result?.equippedCrown).toBe(false);
    expect(result?.equippedHat).toBe(true);
  });

  test('readCachedSettings backfills a missing key from a stale/partial cached blob', () => {
    // Simulate a cache written before a hypothetical future field existed —
    // write raw JSON directly, bypassing writeCachedSettings, since that
    // function always writes the full current shape and could never
    // produce a partial blob itself.
    const partial = settings();
    delete (partial as Partial<UserSettings>).fatsGoalG;
    localStorage.setItem('foxbite-settings-cache', JSON.stringify({ ...partial, pendingSync: false }));

    expect(readCachedSettings()?.fatsGoalG).toBe(67); // DEFAULTS.fatsGoalG
    expect(readCachedSettings()?.dailyCalorieGoal).toBe(2000); // present key untouched
  });

  test('readCachedSettings returns null and does not throw if localStorage.getItem throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage disabled');
    });
    expect(() => readCachedSettings()).not.toThrow();
    expect(readCachedSettings()).toBeNull();
    spy.mockRestore();
  });

  test('writeCachedSettings does not throw if localStorage.setItem throws (e.g. quota exceeded)', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeCachedSettings(settings(), false)).not.toThrow();
    spy.mockRestore();
  });
});
