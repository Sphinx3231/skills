import { render } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { FoxCompanion } from '../fox-companion';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

// Mocked directly (rather than via the underlying AccessibilityInfo call)
// so each test can force `reduceMotion` to a known value synchronously,
// with no async resolution race to wait out.
jest.mock('@/hooks/use-reduce-motion');
const mockedUseReduceMotion = useReduceMotion as jest.MockedFunction<typeof useReduceMotion>;

describe('FoxCompanion', () => {
  beforeEach(() => {
    mockedUseReduceMotion.mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders without crashing for every mood', async () => {
    for (const mood of ['empty', 'onTarget', 'over', 'neutral'] as const) {
      const { toJSON } = await render(<FoxCompanion mood={mood} />);
      expect(toJSON()).toBeTruthy();
    }
  });

  test('renders with every accessory combination enabled', async () => {
    const { toJSON } = await render(
      <FoxCompanion mood="onTarget" wearingScarf wearingHat wearingBackpack wearingCrown />
    );
    expect(toJSON()).toBeTruthy();
  });

  test('respects a custom size prop', async () => {
    const { toJSON } = await render(<FoxCompanion size={64} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('"width":64');
  });

  test('runs the scheduled blink animation without crashing, including after unmount', async () => {
    jest.useFakeTimers();
    const { unmount } = await render(<FoxCompanion />);

    jest.advanceTimersByTime(5000);
    unmount();
    jest.advanceTimersByTime(5000);

    jest.useRealTimers();
  });

  test(
    'stops recursively re-scheduling the blink animation once unmounted',
    async () => {
      // Deterministic (rather than the component's randomized 2200-4800ms)
      // delay so the first blink — and its recursive re-schedule of the
      // next one — reliably happens before we unmount.
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      const { unmount } = await render(<FoxCompanion />);

      await new Promise((resolve) => setTimeout(resolve, 2500));
      unmount();
      // The next recursively-scheduled timeout — not covered by the
      // effect's own cleanup, which only clears the very first setTimeout
      // id — fires here while `cancelled` is already true and should be a
      // no-op rather than throwing on an unmounted component.
      await new Promise((resolve) => setTimeout(resolve, 2500));

      randomSpy.mockRestore();
    },
    10000
  );

  test('starts the bob/ear-wiggle Animated.loop when reduce motion is off', async () => {
    mockedUseReduceMotion.mockReturnValue(false);
    const loopSpy = jest.spyOn(Animated, 'loop');
    const timingSpy = jest.spyOn(Animated, 'timing');

    // `mood="neutral"` (the default) keeps the onTarget-only sparkle loop —
    // which is intentionally NOT gated by reduce motion — out of the count.
    await render(<FoxCompanion mood="neutral" />);

    // The bob loop and the ear-wiggle loop each construct one Animated.loop
    // synchronously on mount when not gated off.
    expect(loopSpy).toHaveBeenCalled();
    expect(timingSpy).toHaveBeenCalled();
  });

  test('does not start the bob/blink/ear-wiggle Animated.loop/timing calls when reduce motion is on', async () => {
    mockedUseReduceMotion.mockReturnValue(true);
    const loopSpy = jest.spyOn(Animated, 'loop');
    const timingSpy = jest.spyOn(Animated, 'timing');

    // `mood="neutral"` keeps the sparkle loop (unrelated to this guard) out
    // of the count — see the "off" test above for why.
    await render(<FoxCompanion mood="neutral" />);

    // Each of the three effects' `if (reduceMotion) return;` guard should
    // fire before any Animated.loop/Animated.timing call is constructed —
    // proving the gating actually runs, not just that the rendered tree
    // looks the same (react-native's Animated with useNativeDriver never
    // shows up in `toJSON()` either way, so a before/after tree comparison
    // can't distinguish "loop started" from "loop never started").
    expect(loopSpy).not.toHaveBeenCalled();
    expect(timingSpy).not.toHaveBeenCalled();
  });

  test('resets bob/blink/ear-wiggle to their resting values when reduce motion toggles on mid-session', async () => {
    // `useReduceMotion()` starts `false` and only flips `true` once
    // `AccessibilityInfo.isReduceMotionEnabled()` resolves (or the OS
    // setting is toggled mid-session, via the hook's `reduceMotionChanged`
    // subscription) — so the guard has to handle the loops already being
    // mid-flight, not just never having started. Simulate that here by
    // mocking the hook `false` for the first render, then flipping it to
    // `true` and re-rendering, exactly like the hook would report a
    // mid-session OS toggle.
    mockedUseReduceMotion.mockReturnValue(false);
    const setValueSpy = jest.spyOn(Animated.Value.prototype, 'setValue');

    const { rerender } = await render(<FoxCompanion />);
    setValueSpy.mockClear(); // ignore whatever setValue traffic mounting itself causes

    mockedUseReduceMotion.mockReturnValue(true);
    await rerender(<FoxCompanion />);

    // Each of the three effects' guard should explicitly snap its
    // Animated.Value back to its resting frame — bob and ear-wiggle to 0,
    // blink to 1 (eyes open) — rather than leaving it wherever the loop
    // happened to be stopped (which for blink, left uncorrected, could
    // freeze the eyes squinted at 0.08).
    const resetTo = setValueSpy.mock.calls.map((call) => call[0]);
    expect(resetTo.filter((value) => value === 0)).toHaveLength(2); // bob + ear-wiggle
    expect(resetTo.filter((value) => value === 1)).toHaveLength(1); // blink
  });
});
