import { render } from '@testing-library/react-native';
import { FoxMoment } from '../fox-moment';
import { FOX_MOMENT_DURATIONS } from '@/lib/fox-moments';

describe('FoxMoment', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('renders without throwing for every moment kind', async () => {
    for (const kind of Object.keys(FOX_MOMENT_DURATIONS) as (keyof typeof FOX_MOMENT_DURATIONS)[]) {
      await render(<FoxMoment kind={kind} onDone={jest.fn()} />);
    }
  });

  test('does not call onDone before the moment\'s measured duration elapses', async () => {
    const onDone = jest.fn();
    await render(<FoxMoment kind="celebrate" onDone={onDone} />);

    jest.advanceTimersByTime(FOX_MOMENT_DURATIONS.celebrate - 1);

    expect(onDone).not.toHaveBeenCalled();
  });

  test('calls onDone once the moment\'s measured duration elapses', async () => {
    const onDone = jest.fn();
    await render(<FoxMoment kind="celebrate" onDone={onDone} />);

    jest.advanceTimersByTime(FOX_MOMENT_DURATIONS.celebrate);

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('clears its timer on unmount so onDone never fires late', async () => {
    const onDone = jest.fn();
    const { unmount } = await render(<FoxMoment kind="order" onDone={onDone} />);

    await unmount();
    jest.advanceTimersByTime(FOX_MOMENT_DURATIONS.order);

    expect(onDone).not.toHaveBeenCalled();
  });
});
