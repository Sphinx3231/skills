import { act, renderHook } from '@testing-library/react-native';
import { useFoxMomentQueue } from '../use-fox-moment-queue';

describe('useFoxMomentQueue', () => {
  test('starts with no active moment', async () => {
    const { result } = await renderHook(() => useFoxMomentQueue(false));
    expect(result.current.active).toBeNull();
  });

  test('an enqueued moment becomes active immediately when nothing is playing', async () => {
    const { result } = await renderHook(() => useFoxMomentQueue(false));

    await act(() => result.current.enqueue('wave'));

    expect(result.current.active).toBe('wave');
  });

  test('enqueuing while one is active queues it instead of replacing it', async () => {
    const { result } = await renderHook(() => useFoxMomentQueue(false));

    await act(() => result.current.enqueue('wave'));
    await act(() => result.current.enqueue('celebrate'));

    expect(result.current.active).toBe('wave');
  });

  test('handleDone advances to the next queued moment', async () => {
    const { result } = await renderHook(() => useFoxMomentQueue(false));

    await act(() => result.current.enqueue('wave'));
    await act(() => result.current.enqueue('celebrate'));
    await act(() => result.current.handleDone());

    expect(result.current.active).toBe('celebrate');
  });

  test('handleDone clears the active moment once the queue is empty', async () => {
    const { result } = await renderHook(() => useFoxMomentQueue(false));

    await act(() => result.current.enqueue('order'));
    await act(() => result.current.handleDone());

    expect(result.current.active).toBeNull();
  });

  test('reduce motion enabled drops enqueues entirely', async () => {
    const { result } = await renderHook(() => useFoxMomentQueue(true));

    await act(() => result.current.enqueue('wave'));

    expect(result.current.active).toBeNull();
  });
});
