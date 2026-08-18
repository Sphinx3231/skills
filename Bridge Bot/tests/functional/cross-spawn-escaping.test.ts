// Deliberately does NOT mock cross-spawn. Mocked unit tests only prove
// spawnGemini.ts *calls* crossSpawn correctly — they cannot prove the
// actual escaping/invocation strategy is safe against real cmd.exe
// behavior.
//
// History (do not "simplify" this file without reading this first):
// spawnGemini.ts originally spawned `gemini` directly (resolving to the
// npm .cmd shim on Windows). cross-spawn escapes the outer cmd.exe
// invocation correctly, but the .cmd shim's own body forwards its
// arguments to node via `%*` — a SECOND, independent batch-parsing pass
// cross-spawn has no control over. This was empirically confirmed
// exploitable: the argument `'" & echo INJECTED & "'` executed the
// injected command despite cross-spawn's escaping. Fixed by having
// spawnGemini.ts resolve gemini.cmd's underlying node.exe + script path
// and spawn node.exe *directly* — node.exe matches cross-spawn's `.exe`
// fast path, so cmd.exe is never involved at all for the real invocation.
//
// This file has two suites: one proving the CURRENT (safe) path is safe,
// and one proving the OLD (.cmd-shim) path is genuinely unsafe — kept as a
// locked-in regression guard so a future "simplification" back to
// spawning `gemini` directly gets caught immediately.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crossSpawn from "cross-spawn";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ADVERSARIAL_ARGS = [
  "plain text with spaces",
  "ampersand & pipe | caret ^ percent %PATH%",
  "redirects < > and && chaining",
  'embedded "double quotes" inside',
  "quote-then-metachar \"a\" & echo INJECTED",
];
const INJECTION_ATTEMPT = '" & echo INJECTED & "';

function runNodeEcho(arg: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // This mirrors exactly what spawnGemini.ts's resolveGeminiInvocation
    // does for the real invocation: spawn node.exe (a .exe — cross-spawn's
    // non-shell fast path) with a script-path-shaped first arg, then the
    // real args after it.
    const child = crossSpawn(
      process.execPath,
      ["-e", "process.stdout.write(process.argv[1])", arg],
      { windowsHide: true }
    );

    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`node echo exited ${code}`));
      resolve(stdout);
    });
  });
}

describe("current production path: node.exe spawned directly (no cmd.exe involved)", () => {
  for (const arg of ADVERSARIAL_ARGS) {
    it(`round-trips byte-for-byte: ${JSON.stringify(arg)}`, async () => {
      expect(await runNodeEcho(arg)).toBe(arg);
    });
  }

  it("does not allow the previously-confirmed injection payload to execute a second command", async () => {
    const received = await runNodeEcho(INJECTION_ATTEMPT);
    expect(received).toBe(INJECTION_ATTEMPT);
    expect(received).not.toContain("INJECTED\n");
  });
});

describe("regression guard: the OLD .cmd-shim path is genuinely unsafe (do not reintroduce it)", () => {
  let fixtureDir: string;
  let fixtureCmdPath: string;

  beforeAll(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), "bridge-bot-cmd-shim-regression-"));
    fixtureCmdPath = join(fixtureDir, "echo-fixture.cmd");
    // Mirrors the real gemini.cmd shim's shape (confirmed by reading its
    // actual contents): forwards all args to node via %*.
    writeFileSync(fixtureCmdPath, `@node -e "process.stdout.write(process.argv[1])" %*\r\n`);
  });

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  function runViaCmdShim(arg: string): Promise<{ stdout: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
      const child = crossSpawn(fixtureCmdPath, [arg], { windowsHide: true });
      let stdout = "";
      child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.on("error", reject);
      child.on("close", (exitCode) => resolve({ stdout, exitCode }));
    });
  }

  it("simple metacharacters still round-trip through the .cmd shim (the gap is narrow, not total)", async () => {
    const { stdout, exitCode } = await runViaCmdShim("ampersand & pipe | caret ^ percent %PATH%");
    expect(exitCode).toBe(0);
    expect(stdout).toBe("ampersand & pipe | caret ^ percent %PATH%");
  });

  it("CONFIRMED GAP: the quote+ampersand injection payload breaks through the .cmd shim's own %* re-parsing", async () => {
    const { stdout } = await runViaCmdShim(INJECTION_ATTEMPT);
    // This is the actual, confirmed-exploitable behavior — asserting it
    // stays broken is intentional: if this ever starts passing (returning
    // INJECTION_ATTEMPT unchanged), it means either cross-spawn or cmd.exe
    // behavior changed upstream, which would be worth knowing, but it does
    // NOT mean spawning gemini.cmd directly becomes safe to reintroduce —
    // that decision requires re-auditing this whole file, not just this
    // one assertion.
    expect(stdout).toContain("INJECTED");
  });
});
