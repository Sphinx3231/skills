import { spawnGeminiOnce } from "./process/spawnGemini.js";
import { withRetry } from "./process/retry.js";
import type { AskGeminiOptions, GeminiResult } from "./types.js";

// Decision (ticket 002 plan, "open decision" section): the gemini CLI
// appears to run its own internal retry loop on quota errors (ticket 001
// observed this collide with a 120s external timeout). No CLI flag to
// disable it was found (checked --help / bundled option names). Rather
// than shrink the timeout aggressively — which risks killing legitimate
// slow-but-succeeding calls (10KB/100KB payloads took ~50s each in ticket
// 001) — we accept possible compounding delay (CLI retries internally,
// then askGemini retries again externally on top) and keep this timeout as
// the outer ceiling on how long any single attempt (including the CLI's
// own internal retries) is allowed to run before we intervene.
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 4;

export interface AskGeminiInput {
  /** Always sent as the -p/--prompt value. */
  prompt: string;
  /**
   * Document content to pipe via stdin (document mode only). Per ticket
   * 001's finding, stdin is appended to the -p prompt by the CLI, not a
   * separate channel — content here is *appended to*, not a replacement
   * for, `prompt`.
   */
  content?: string;
}

function buildArgs(input: AskGeminiInput, opts: AskGeminiOptions): string[] {
  const args = ["-p", input.prompt, "-o", opts.outputFormat ?? "text"];

  if (opts.model) {
    args.push("-m", opts.model);
  }

  if (opts.mode === "codebase") {
    if (!opts.includeDirectories || opts.includeDirectories.length === 0) {
      throw new Error("codebase mode requires opts.includeDirectories to be non-empty");
    }
    // Confirmed real flag from ticket 001's spike (gemini --help), used
    // instead of manually reading and concatenating files.
    args.push("--include-directories", opts.includeDirectories.join(","));
  }

  return args;
}

/**
 * Delegates a prompt (optionally with large document content, or directory
 * context) to the locally installed Gemini CLI. Never hardcodes a
 * payload-size ceiling — ticket 001 found no confirmed real limit, only a
 * free-tier quota wall, so resilience here is defensive (retry/backoff on
 * transient failures) rather than size-gated.
 */
export async function askGemini(
  input: AskGeminiInput,
  opts: AskGeminiOptions
): Promise<GeminiResult> {
  if (opts.mode === "document" && !input.content) {
    throw new Error("document mode requires input.content");
  }

  const args = buildArgs(input, opts);
  const stdinPayload = opts.mode === "document" ? input.content! : null;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = opts.maxRetries ?? DEFAULT_MAX_RETRIES;

  const { result, attempts } = await withRetry(
    () => spawnGeminiOnce(args, stdinPayload, timeoutMs),
    { maxAttempts }
  );

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    attempts,
    timedOut: result.timedOut,
  };
}
