import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { DEFAULT_SETTINGS, SettingsProvider, useUserSettings } from '@/lib/settings-context';
import * as api from '@/lib/api';
import { isSyncPending, readCachedSettings, writeCachedSettings, __resetForTests } from '@/lib/settings-db';
import type { UserSettings } from '@/lib/api';

jest.mock('@/lib/api');
const mockedApi = api as jest.Mocked<typeof api>;

// Plain `require` (not `jest.requireMock`) — matches how settings-db.test.ts
// resolves the same manual mock, so both end up sharing the identical
// module instance (and its `rows` store) that settings-db.ts's own
// `import * as SQLite from 'expo-sqlite'` resolves to. Using
// `jest.requireMock` here previously caused test pollution across cases
// (a *second*, separately-instantiated copy of the mock's in-memory store)
// because it resolves through Jest's dedicated mock registry rather than
// the normal module registry every other import in this file goes through.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __resetMockDb } = require('expo-sqlite') as { __resetMockDb: () => void };

function fullSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

// Real time, not fake timers: @testing-library/react-native's `waitFor`
// polls using real timers under the hood, which doesn't advance under fake
// timers without extra wiring. Since the debounce window is only 500ms,
// waiting for real time is simple and fast enough here.
async function waitOutDebounce() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 600));
  });
}

describe('SettingsProvider / useUserSettings', () => {
  // Each test mounts its own SettingsProvider instance via renderHook; none
  // of them ever resolve their mocked API promises inside a test that keeps
  // it pending (e.g. the "never resolves" cases). Unmounting between tests
  // avoids leaving multiple concurrently-mounted provider trees with live
  // effects/timers, which was otherwise observed to make a later test's
  // fresh mount's own effects silently fail to flush within `waitFor`'s
  // window — an interaction with the test renderer's `act()` queue across
  // still-mounted trees, not a bug in the component itself.
  let activeUnmount: (() => Promise<void>) | null = null;

  async function mountProvider() {
    const rendered = await renderHook(() => useUserSettings(), { wrapper: SettingsProvider });
    activeUnmount = rendered.unmount;
    return rendered;
  }

  beforeEach(() => {
    __resetMockDb();
    __resetForTests();
  });

  afterEach(async () => {
    if (activeUnmount) {
      await activeUnmount();
      activeUnmount = null;
    }
    jest.clearAllMocks();
  });

  test('useUserSettings outside any provider falls back to defaults with a no-op updater', async () => {
    const { result } = await renderHook(() => useUserSettings());
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    expect(result.current.syncFailed).toBe(false);
    expect(() => result.current.updateSettings({ dailyCalorieGoal: 1 })).not.toThrow();
  });

  test('hydrates instantly from the local cache before the initial GET resolves', async () => {
    mockedApi.getUserSettings.mockImplementation(() => new Promise(() => {})); // never resolves
    writeCachedSettings(fullSettings({ themeMode: 'dark' }), false);

    const { result } = await mountProvider();
    // No await/waitFor for the network call — this must already reflect the
    // cache synchronously on first render.
    expect(result.current.settings.themeMode).toBe('dark');
  });

  test('falls back to DEFAULT_SETTINGS when there is no cache yet (fresh install)', async () => {
    mockedApi.getUserSettings.mockImplementation(() => new Promise(() => {}));
    const { result } = await mountProvider();
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  test('reconciles with the server response once GET /user/settings resolves', async () => {
    mockedApi.getUserSettings.mockResolvedValue(fullSettings({ dailyCalorieGoal: 2400 }));

    const { result } = await mountProvider();
    await waitFor(() => expect(result.current.settings.dailyCalorieGoal).toBe(2400));
  });

  test('updateSettings applies the patch optimistically and immediately', async () => {
    mockedApi.getUserSettings.mockResolvedValue(fullSettings());
    mockedApi.updateUserSettings.mockResolvedValue(fullSettings({ dailyCalorieGoal: 1800 }));

    const { result } = await mountProvider();
    await waitFor(() => expect(mockedApi.getUserSettings).toHaveBeenCalled());

    await act(() => result.current.updateSettings({ dailyCalorieGoal: 1800 }));
    expect(result.current.settings.dailyCalorieGoal).toBe(1800);
    // The PATCH itself is debounced — not called yet.
    expect(mockedApi.updateUserSettings).not.toHaveBeenCalled();

    // Let the debounced PATCH actually fire and settle before the test ends
    // — otherwise its pending timer (a plain JS setTimeout, unaffected by
    // unmounting the component) fires during a *later* test and pollutes
    // its call count instead.
    await waitOutDebounce();
  });

  test('updateSettings debounces the PATCH call by 500ms, collapsing rapid updates into one call', async () => {
    mockedApi.getUserSettings.mockResolvedValue(fullSettings());
    mockedApi.updateUserSettings.mockResolvedValue(fullSettings({ dailyCalorieGoal: 1900 }));

    const { result } = await mountProvider();
    await waitFor(() => expect(mockedApi.getUserSettings).toHaveBeenCalled());

    await act(() => result.current.updateSettings({ dailyCalorieGoal: 1700 }));
    await act(() => result.current.updateSettings({ dailyCalorieGoal: 1800 }));
    await act(() => result.current.updateSettings({ dailyCalorieGoal: 1900 }));
    expect(mockedApi.updateUserSettings).not.toHaveBeenCalled();

    await waitOutDebounce();
    expect(mockedApi.updateUserSettings).toHaveBeenCalledTimes(1);
    expect(mockedApi.updateUserSettings).toHaveBeenCalledWith({ dailyCalorieGoal: 1900 });
  });

  test('writes the optimistic value to the local cache immediately (survives before the PATCH resolves)', async () => {
    mockedApi.getUserSettings.mockResolvedValue(fullSettings());
    mockedApi.updateUserSettings.mockImplementation(() => new Promise(() => {})); // never resolves

    const { result } = await mountProvider();
    await waitFor(() => expect(mockedApi.getUserSettings).toHaveBeenCalled());

    await act(() => result.current.updateSettings({ themeMode: 'dark' }));

    expect(readCachedSettings()?.themeMode).toBe('dark');
    expect(isSyncPending()).toBe(true);
  });

  test('a successful debounced PATCH clears the pending-sync flag and reconciles with the server response', async () => {
    mockedApi.getUserSettings.mockResolvedValue(fullSettings());
    mockedApi.updateUserSettings.mockResolvedValue(fullSettings({ themeMode: 'dark' }));

    const { result } = await mountProvider();
    await waitFor(() => expect(mockedApi.getUserSettings).toHaveBeenCalled());

    await act(() => result.current.updateSettings({ themeMode: 'dark' }));
    await waitOutDebounce();

    expect(isSyncPending()).toBe(false);
    expect(result.current.syncFailed).toBe(false);
  });

  test('a failed PATCH sets syncFailed without discarding the optimistic local value', async () => {
    mockedApi.getUserSettings.mockResolvedValue(fullSettings());
    mockedApi.updateUserSettings.mockRejectedValue(new Error('network down'));

    const { result } = await mountProvider();
    await waitFor(() => expect(mockedApi.getUserSettings).toHaveBeenCalled());

    await act(() => result.current.updateSettings({ dailyCalorieGoal: 2600 }));
    await waitOutDebounce();

    expect(result.current.syncFailed).toBe(true);
    // The optimistic value is not silently reverted.
    expect(result.current.settings.dailyCalorieGoal).toBe(2600);
    expect(isSyncPending()).toBe(true);
  });

  test('an app-foreground event retries a pending failed sync, and success clears syncFailed', async () => {
    const addEventListenerSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as any);
    mockedApi.getUserSettings.mockResolvedValue(fullSettings());
    mockedApi.updateUserSettings.mockRejectedValueOnce(new Error('network down'));

    const { result } = await mountProvider();
    await waitFor(() => expect(mockedApi.getUserSettings).toHaveBeenCalled());

    await act(() => result.current.updateSettings({ dailyCalorieGoal: 2600 }));
    await waitOutDebounce();
    expect(result.current.syncFailed).toBe(true);

    mockedApi.updateUserSettings.mockResolvedValueOnce(fullSettings({ dailyCalorieGoal: 2600 }));

    // Invoke the registered AppState 'change' listener directly — the most
    // reliable way to simulate a foreground transition in this environment.
    const handler = addEventListenerSpy.mock.calls.at(-1)?.[1];
    await act(async () => {
      handler?.('active');
    });

    await waitFor(() => expect(result.current.syncFailed).toBe(false));
  });

  test('an app-foreground event with nothing pending does not call updateUserSettings at all', async () => {
    const addEventListenerSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as any);
    mockedApi.getUserSettings.mockResolvedValue(fullSettings());

    await mountProvider();
    await waitFor(() => expect(mockedApi.getUserSettings).toHaveBeenCalled());

    const handler = addEventListenerSpy.mock.calls.at(-1)?.[1];
    await act(async () => {
      handler?.('active');
    });

    expect(mockedApi.updateUserSettings).not.toHaveBeenCalled();
  });

  test('a failed retry leaves syncFailed set', async () => {
    const addEventListenerSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as any);
    mockedApi.getUserSettings.mockResolvedValue(fullSettings());
    mockedApi.updateUserSettings.mockRejectedValue(new Error('network down'));

    const { result } = await mountProvider();
    await waitFor(() => expect(mockedApi.getUserSettings).toHaveBeenCalled());

    await act(() => result.current.updateSettings({ dailyCalorieGoal: 2600 }));
    await waitOutDebounce();
    expect(result.current.syncFailed).toBe(true);

    const handler = addEventListenerSpy.mock.calls.at(-1)?.[1];
    await act(async () => {
      handler?.('active');
    });

    // The retry also failed (mock always rejects) — still flagged, and the
    // change is still safely on-device via the local cache, not lost. This
    // test only exercises one foreground event; see the next test for proof
    // that a *later* foreground event tries again rather than giving up.
    await waitFor(() => expect(result.current.syncFailed).toBe(true));
    expect(isSyncPending()).toBe(true);
  });

  test('a second, later foreground event retries again after the first retry failed, and can succeed', async () => {
    const addEventListenerSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as any);
    mockedApi.getUserSettings.mockResolvedValue(fullSettings());
    mockedApi.updateUserSettings.mockRejectedValue(new Error('network down'));

    const { result } = await mountProvider();
    await waitFor(() => expect(mockedApi.getUserSettings).toHaveBeenCalled());

    await act(() => result.current.updateSettings({ dailyCalorieGoal: 2600 }));
    await waitOutDebounce();
    expect(result.current.syncFailed).toBe(true);

    const handler = addEventListenerSpy.mock.calls.at(-1)?.[1];

    // First foreground event: retry fails again (mock still rejects).
    await act(async () => {
      handler?.('active');
    });
    await waitFor(() => expect(result.current.syncFailed).toBe(true));
    expect(isSyncPending()).toBe(true);

    // Second, later foreground event: this time the retry succeeds — proving
    // the provider keeps trying on every subsequent foreground event while a
    // write stays pending, rather than giving up after a single retry.
    mockedApi.updateUserSettings.mockResolvedValueOnce(fullSettings({ dailyCalorieGoal: 2600 }));
    await act(async () => {
      handler?.('active');
    });

    await waitFor(() => expect(result.current.syncFailed).toBe(false));
    expect(isSyncPending()).toBe(false);
  });
});
