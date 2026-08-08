import {
  isSyncPending,
  markCacheSynced,
  readCachedSettings,
  writeCachedSettings,
  __resetForTests,
} from '@/lib/settings-db';
import type { UserSettings } from '@/lib/api';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __resetMockDb } = require('expo-sqlite');

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

describe('settings-db (expo-sqlite local cache)', () => {
  beforeEach(() => {
    __resetMockDb();
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

  test('boolean equip flags round-trip correctly when false', () => {
    writeCachedSettings(settings({ equippedScarf: false, equippedCrown: false }), false);
    const result = readCachedSettings();
    expect(result?.equippedScarf).toBe(false);
    expect(result?.equippedCrown).toBe(false);
    expect(result?.equippedHat).toBe(true);
  });

  test('equippedHat and equippedBackpack also round-trip correctly when false', () => {
    writeCachedSettings(settings({ equippedHat: false, equippedBackpack: false }), false);
    const result = readCachedSettings();
    expect(result?.equippedHat).toBe(false);
    expect(result?.equippedBackpack).toBe(false);
    expect(result?.equippedScarf).toBe(true);
    expect(result?.equippedCrown).toBe(true);
  });
});
