// Ticket 001 spike: benchmark practical stdin payload limits for the
// locally installed Gemini CLI, and confirm real invocation behavior.
// Throwaway script — findings get written up in
// docs/outcomes/stdin-limit-spike-findings.md; this file is not production
// code and is not covered by ticket 002's implementation.

import { spawn, execFileSync } from "node:child_process";

const ATTEMPT_TIMEOUT_MS = 120_000;
const SIZES_BYTES = [
  10 * 1024, // 10KB
  100 * 1024, // 100KB
  1 * 1024 * 1024, // 1MB
  5 * 1024 * 1024, // 5MB
  20 * 1024 * 1024, // 20MB
  50 * 1024 * 1024, // 50MB
];

interface AttemptResult {
  sizeBytes: number;
  success: boolean;
  latencyMs: number;
  exitCode: number | null;
  stderrExcerpt: string;
  timedOut: boolean;
}

// Node's shell:true does NOT escape args for us on Windows (it just
// space-joins them into a raw cmd.exe command line) — an unquoted arg
// containing spaces silently splits into multiple shell words. Our prompt
// strings are simple fixed sentences with no embedded quotes, so wrapping
// each in double quotes is sufficient here (not a general-purpose escaper).
function winQuoteArg(arg: string): string {
  if (/["\r\n]/.test(arg)) {
    throw new Error(`Refusing to naively quote arg containing quotes/newlines: ${arg}`);
  }
  return /[\s]/.test(arg) ? `"${arg}"` : arg;
}

function killTree(pid: number) {
  try {
    // shell:true spawns a cmd.exe wrapper around the real gemini process;
    // plain child.kill() only kills the wrapper. taskkill /t kills the
    // whole process tree.
    execFileSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
    });
  } catch {
    // Process may have already exited on its own — not an error for us.
  }
}

function makeSyntheticPayload(sizeBytes: number): string {
  const line =
    "The quick brown fox jumps over the lazy dog. Bridge Bot stdin spike synthetic payload line.\n";
  const repeats = Math.ceil(sizeBytes / line.length);
  return line.repeat(repeats).slice(0, sizeBytes);
}

function runGemini(args: string[], stdinPayload: string | null): Promise<AttemptResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const quotedCommand = ["gemini", ...args.map(winQuoteArg)].join(" ");
    const child = spawn(quotedCommand, [], { shell: true, windowsHide: true });

    let stdout = "";
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killTree(child.pid);
    }, ATTEMPT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk.toString()));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk.toString()));

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdout = stdoutChunks.join("");
      const stderr = stderrChunks.join("");
      resolve({
        sizeBytes: stdinPayload ? Buffer.byteLength(stdinPayload) : 0,
        success: !timedOut && exitCode === 0,
        latencyMs: Date.now() - start,
        exitCode,
        stderrExcerpt: (stderr || stdout).slice(0, 500),
        timedOut,
      });
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        sizeBytes: stdinPayload ? Buffer.byteLength(stdinPayload) : 0,
        success: false,
        latencyMs: Date.now() - start,
        exitCode: null,
        stderrExcerpt: String(err).slice(0, 500),
        timedOut: false,
      });
    });

    if (stdinPayload !== null) {
      writeWithBackpressure(child.stdin, stdinPayload, () => child.stdin.end());
    } else {
      child.stdin.end();
    }
  });
}

function writeWithBackpressure(
  stream: NodeJS.WritableStream,
  payload: string,
  onDone: () => void
) {
  const CHUNK_SIZE = 64 * 1024;
  let offset = 0;

  function writeNext() {
    let ok = true;
    while (offset < payload.length && ok) {
      const chunk = payload.slice(offset, offset + CHUNK_SIZE);
      offset += chunk.length;
      if (offset >= payload.length) {
        ok = stream.write(chunk);
      } else {
        ok = stream.write(chunk);
      }
    }
    if (offset >= payload.length) {
      onDone();
    } else {
      stream.once("drain", writeNext);
    }
  }

  writeNext();
}

async function attemptWithRetry(sizeBytes: number): Promise<AttemptResult> {
  const payload = makeSyntheticPayload(sizeBytes);
  const instruction =
    "Reply with exactly: RECEIVED <n> where <n> is the character count of the text above.";
  const args = ["-p", instruction, "-o", "text"];

  const first = await runGemini(args, payload);
  if (first.success) return first;

  console.log(
    `  [${(sizeBytes / 1024).toFixed(0)}KB] first attempt failed (exit=${first.exitCode}, timedOut=${first.timedOut}) — retrying once before recording as ceiling`
  );
  const retry = await runGemini(args, payload);
  return retry;
}

async function main() {
  console.log("=== Bridge Bot Ticket 001: Gemini CLI stdin-limit spike ===\n");

  const version = execFileSync("gemini", ["--version"], { shell: true })
    .toString()
    .trim();
  console.log(`gemini --version: ${version}`);

  console.log("\nRunning auth/quota precheck...");
  const precheck = await runGemini(["-p", "Reply with exactly: OK", "-o", "text"], null);
  if (!precheck.success) {
    console.error(
      `Precheck FAILED (exit=${precheck.exitCode}). Aborting spike — this would otherwise be misread as a payload-size ceiling.\n` +
        `stderr/stdout: ${precheck.stderrExcerpt}`
    );
    process.exit(1);
  }
  console.log(`Precheck OK (latency=${precheck.latencyMs}ms)\n`);

  console.log("size,success,latencyMs,exitCode,timedOut,stderrExcerpt");
  const results: AttemptResult[] = [];
  for (const size of SIZES_BYTES) {
    const result = await attemptWithRetry(size);
    results.push(result);
    console.log(
      `${size},${result.success},${result.latencyMs},${result.exitCode},${result.timedOut},"${result.stderrExcerpt.replace(/\s+/g, " ").slice(0, 200)}"`
    );
    if (!result.success) {
      console.log(`\nStopping size ladder — ${size} bytes failed after retry.`);
      break;
    }
  }

  console.log("\n=== Done. Raw results: ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("Spike crashed:", err);
  process.exit(1);
});
