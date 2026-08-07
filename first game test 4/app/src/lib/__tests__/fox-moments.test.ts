import {
  FOX_MOMENT_DURATIONS,
  hasWavedThisSession,
  markWavedThisSession,
  momentForMoodTransition,
  resetFoxMomentsSessionState,
  shouldPlayFoxMoment,
} from '../fox-moments';

describe('fox-moments', () => {
  afterEach(() => resetFoxMomentsSessionState());

  describe('session wave flag', () => {
    test('starts false and flips true once marked', () => {
      expect(hasWavedThisSession()).toBe(false);
      markWavedThisSession();
      expect(hasWavedThisSession()).toBe(true);
    });

    test('resetFoxMomentsSessionState clears it back to false', () => {
      markWavedThisSession();
      resetFoxMomentsSessionState();
      expect(hasWavedThisSession()).toBe(false);
    });
  });

  describe('shouldPlayFoxMoment', () => {
    test('plays when reduce motion is off', () => {
      expect(shouldPlayFoxMoment(false)).toBe(true);
    });

    test('does not play when reduce motion is on', () => {
      expect(shouldPlayFoxMoment(true)).toBe(false);
    });
  });

  describe('momentForMoodTransition', () => {
    test('greets an already-empty day on first evaluation (previousMood null)', () => {
      expect(momentForMoodTransition(null, 'empty')).toBe('sleepy');
    });

    test('does not celebrate/rest on first evaluation even if already onTarget or over', () => {
      expect(momentForMoodTransition(null, 'onTarget')).toBeNull();
      expect(momentForMoodTransition(null, 'over')).toBeNull();
      expect(momentForMoodTransition(null, 'neutral')).toBeNull();
    });

    test('fires celebrate on a transition into onTarget', () => {
      expect(momentForMoodTransition('empty', 'onTarget')).toBe('celebrate');
    });

    test('fires resting on a transition into over', () => {
      expect(momentForMoodTransition('onTarget', 'over')).toBe('resting');
    });

    test('fires nothing when the mood is unchanged', () => {
      expect(momentForMoodTransition('onTarget', 'onTarget')).toBeNull();
    });

    test('fires nothing on a transition into empty or neutral', () => {
      expect(momentForMoodTransition('onTarget', 'empty')).toBeNull();
      expect(momentForMoodTransition('over', 'neutral')).toBeNull();
    });
  });

  test('every moment kind has a positive measured duration', () => {
    for (const duration of Object.values(FOX_MOMENT_DURATIONS)) {
      expect(duration).toBeGreaterThan(0);
    }
  });
});
