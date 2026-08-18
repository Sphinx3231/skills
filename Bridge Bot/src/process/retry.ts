import type { SingleAttemptResult } from "./spawnGemini.js";

/**
 * The first branch is the real, verbatim quota error text found empirically
 * in ticket 001 ("You exceeded your current quota, please check your plan
 * and billing details.") — an invented pattern like /429|RESOURCE_EXHAUSTED/
 * alone would have missed this exact real-world case. The remaining
 * branches are defensive generic transient-error patterns.
 */
const TRANSIENT_ERROR_PATTERN =
  /exceeded your current quota|rate.?limit|429|RESOURCE_EXHAUSTED|ECONNRESET/i;

export function isTransientFailure(result: SingleAttemptResult): boolean {
  if (result.timedOut) return true;
  if (result.exitCode === 0) return false;
  return TRANSIENT_ERROR_PATTERN.test(result.stderr) || TRANSIENT_ERROR_PATTERN.test(result.stdout);
}

export interface WithRetryOptions {
  maxAttempts: number;
  baseDelayMs?: number;
  /** Injectable for tests; defaults to a real setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries `attempt()` with exponential backoff + full jitter, but only for
 * results isTransientFailure() flags as transient. Non-matching failures
 * (e.g. auth errors, bad flags) fail fast on the first attempt — retrying
 * those would just waste quota on an error that will never resolve itself.
 */
export async function withRetry(
  attempt: () => Promise<SingleAttemptResult>,
  opts: WithRetryOptions
): Promise<{ result: SingleAttemptResult; attempts: number }> {
  const { maxAttempts, baseDelayMs = 1000, sleep = defaultSleep } = opts;

  let lastResult: SingleAttemptResult | null = null;
  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
    const result = await attempt();
    lastResult = result;

    const isLastAttempt = attemptNumber === maxAttempts;
    if (result.exitCode === 0 || isLastAttempt || !isTransientFailure(result)) {
      return { result, attempts: attemptNumber };
    }

    const maxDelay = baseDelayMs * 2 ** (attemptNumber - 1);
    const jitteredDelay = Math.random() * maxDelay;
    await sleep(jitteredDelay);
  }

  // Unreachable given maxAttempts >= 1, but keeps TypeScript satisfied.
  return { result: lastResult!, attempts: maxAttempts };
}
