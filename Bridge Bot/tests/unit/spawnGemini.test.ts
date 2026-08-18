import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeChildProcess } from "./testUtils.js";

const crossSpawnMock = vi.fn();
const execFileMock = vi.fn((_cmd: string, _args: string[], cb?: (err: unknown) => void) => {
  cb?.(null);
});
const whichSyncMock = vi.fn(() => "C:\\fake\\npm\\gemini.cmd");
const existsSyncMock = vi.fn((_p: string) => true);

vi.mock("cross-spawn", () => ({
  default: (cmd: string, args: string[], opts?: unknown) => crossSpawnMock(cmd, args, opts),
}));
vi.mock("node:child_process", () => ({
  execFile: (cmd: string, args: string[], cb?: (err: unknown) => void) =>
    execFileMock(cmd, args, cb),
}));
vi.mock("which", () => ({ default: { sync: () => whichSyncMock() } }));
vi.mock("node:fs", () => ({ existsSync: (p: string) => existsSyncMock(p) }));

const { spawnGeminiOnce } = await import("../../src/process/spawnGemini.js");

const EXPECTED_SCRIPT_PATH = "C:\\fake\\npm\\node_modules\\@google\\gemini-cli\\bundle\\gemini.js";

describe("spawnGeminiOnce", () => {
  let fake: FakeChildProcess;

  beforeEach(() => {
    vi.useFakeTimers();
    fake = new FakeChildProcess();
    crossSpawnMock.mockReset().mockReturnValue(fake);
    execFileMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // MUST run before any test that lets resolveGeminiInvocation() succeed —
  // it memoizes the resolved path after the first successful call, and a
  // stale cache would silently skip the existsSync check this test exists
  // to verify (see resolveGeminiInvocation in spawnGemini.ts).
  it("throws a clear error if the resolved gemini.js script path does not exist", async () => {
    existsSyncMock.mockReturnValueOnce(false);
    await expect(spawnGeminiOnce(["-p", "hi"], null, 5000)).rejects.toThrow(
      /Could not resolve Gemini CLI's script entrypoint/
    );
  });

  it("resolves gemini.cmd's underlying node.exe + script path and spawns node directly (bypasses cmd.exe/the .cmd shim entirely)", async () => {
    const promise = spawnGeminiOnce(["-p", "hi"], null, 5000);
    fake.emitClose(0);
    await promise;

    expect(crossSpawnMock).toHaveBeenCalledTimes(1);
    const [command, args] = crossSpawnMock.mock.calls[0];
    // command is our own running node.exe (process.execPath) — always a
    // .exe, so cross-spawn never routes this through cmd.exe at all.
    expect(command).toBe(process.execPath);
    expect(args).toEqual([EXPECTED_SCRIPT_PATH, "-p", "hi"]);
  });

  it("never passes shell:true to crossSpawn (regression test for the shell:true footgun)", async () => {
    const promise = spawnGeminiOnce(["-p", "hi"], null, 5000);
    fake.emitClose(0);
    await promise;

    const optionsArg = crossSpawnMock.mock.calls[0][2] as Record<string, unknown> | undefined;
    expect(optionsArg?.shell).toBeFalsy();
  });

  it("resolves with collected stdout/stderr and exit code on normal close", async () => {
    const promise = spawnGeminiOnce(["-p", "hi"], null, 5000);
    fake.emitStdout("hello ");
    fake.emitStdout("world");
    fake.emitClose(0);

    const result = await promise;
    expect(result).toEqual({ stdout: "hello world", stderr: "", exitCode: 0, timedOut: false });
  });

  it("kills the process tree via taskkill (not bare child.kill()) on timeout", async () => {
    const promise = spawnGeminiOnce(["-p", "hi"], null, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    // Simulate the killed process actually closing afterwards.
    fake.emitClose(null);

    const result = await promise;
    expect(result.timedOut).toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      "taskkill",
      ["/pid", String(fake.pid), "/t", "/f"],
      expect.any(Function)
    );
    // Bare .kill() must never be relied on for teardown.
    expect((fake as unknown as { kill?: unknown }).kill).toBeUndefined();
  });

  it("writes stdin respecting backpressure (waits for drain before continuing)", async () => {
    fake.stdin.forceNextWriteToBlock();
    const promise = spawnGeminiOnce(["-p", "hi"], "a".repeat(200_000), 5000);

    // First chunk was attempted; end() must not have been called yet since
    // write() returned false and no 'drain' has fired.
    expect(fake.stdin.ended).toBe(false);

    fake.stdin.emit("drain");
    fake.emitClose(0);

    await promise;
    expect(fake.stdin.ended).toBe(true);
    expect(fake.stdin.writes.length).toBeGreaterThan(1);
  });
});
