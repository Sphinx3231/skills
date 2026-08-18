import crossSpawn from "cross-spawn";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Writable } from "node:stream";
import which from "which";

export interface SingleAttemptResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const STDIN_CHUNK_SIZE = 64 * 1024;

interface ResolvedInvocation {
  command: string;
  prefixArgs: string[];
}

let cachedInvocation: ResolvedInvocation | null = null;

/**
 * On Windows, `gemini` resolves to an npm-installed `.cmd` shim. Spawning
 * that shim via cross-spawn still routes through cmd.exe (cross-spawn only
 * takes its plain non-shell path for .exe/.com targets), and the shim's
 * own body forwards its arguments to node via `%*` — a SECOND, independent
 * batch-parsing pass that cross-spawn has no control over. This was
 * empirically confirmed exploitable: an argument like `'" & echo INJECTED
 * & "'` executed the injected command despite cross-spawn's escaping of
 * the outer cmd.exe invocation (see docs/outcomes for the finding).
 *
 * Fix: read the shim's own resolution logic (visible in gemini.cmd itself
 * — `"%dp0%\node_modules\@google\gemini-cli\bundle\gemini.js"` run via
 * node) and replicate it in JS, then spawn node.exe *directly* on that
 * script path. node.exe matches cross-spawn's `.exe` fast path, so no
 * cmd.exe is ever involved — closing this injection class entirely rather
 * than trying to out-escape it.
 */
function resolveGeminiInvocation(): ResolvedInvocation {
  if (cachedInvocation) return cachedInvocation;

  if (process.platform !== "win32") {
    cachedInvocation = { command: "gemini", prefixArgs: [] };
    return cachedInvocation;
  }

  const shimPath = which.sync("gemini");
  const dp0 = dirname(shimPath);
  const scriptPath = join(dp0, "node_modules", "@google", "gemini-cli", "bundle", "gemini.js");

  if (!existsSync(scriptPath)) {
    throw new Error(
      `Could not resolve Gemini CLI's script entrypoint at expected path: ${scriptPath}. ` +
        `The installed @google/gemini-cli version may have changed its on-disk layout — ` +
        `re-check gemini.cmd's own contents (${shimPath}) and update this resolution logic.`
    );
  }

  // Use our own running Node interpreter rather than re-resolving "node"
  // through PATH — it's already a known-good, always-available .exe.
  cachedInvocation = { command: process.execPath, prefixArgs: [scriptPath] };
  return cachedInvocation;
}

/**
 * cross-spawn still shells out via cmd.exe for non-.exe/.com targets on
 * Windows (unavoidable for anything that isn't resolved directly, per
 * resolveGeminiInvocation above), so a bare child.kill() can leave a
 * wrapped process running. taskkill /t kills the whole tree. Never call
 * child.kill() alone here.
 */
function killTree(pid: number): void {
  execFile("taskkill", ["/pid", String(pid), "/t", "/f"], () => {
    // Process may have already exited on its own — not an error for us.
  });
}

function writeWithBackpressure(stream: Writable, payload: string, onDone: () => void): void {
  let offset = 0;

  function writeNext() {
    let ok = true;
    while (offset < payload.length && ok) {
      const chunk = payload.slice(offset, offset + STDIN_CHUNK_SIZE);
      offset += chunk.length;
      ok = stream.write(chunk);
    }
    if (offset >= payload.length) {
      onDone();
    } else {
      stream.once("drain", writeNext);
    }
  }

  writeNext();
}

/**
 * Spawns `gemini` for a single attempt. Does not throw on non-zero exit —
 * callers (retry.ts) need the raw stderr text to decide whether to retry.
 *
 * IMPORTANT: the options object passed to crossSpawn must never set
 * `shell: true` — cross-spawn's own docs state this bypasses its internal
 * argument escaping entirely, silently reintroducing command-injection risk
 * for well-formed-looking input.
 */
export function spawnGeminiOnce(
  args: string[],
  stdinPayload: string | null,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<SingleAttemptResult> {
  return new Promise((resolve) => {
    const { command, prefixArgs } = resolveGeminiInvocation();
    const child = crossSpawn(command, [...prefixArgs, ...args], { windowsHide: true });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killTree(child.pid);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk.toString()));

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
        exitCode,
        timedOut,
      });
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: stdoutChunks.join(""),
        stderr: String(err),
        exitCode: null,
        timedOut: false,
      });
    });

    if (stdinPayload !== null && child.stdin) {
      writeWithBackpressure(child.stdin, stdinPayload, () => child.stdin!.end());
    } else {
      child.stdin?.end();
    }
  });
}
