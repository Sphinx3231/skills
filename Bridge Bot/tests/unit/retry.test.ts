import { describe, it, expect, vi } from "vitest";
import { isTransientFailure, withRetry } from "../../src/process/retry.js";
import type { SingleAttemptResult } from "../../src/process/spawnGemini.js";

function result(overrides: Partial<SingleAttemptResult>): SingleAttemptResult {
  return { stdout: "", stderr: "", exitCode: 1, timedOut: false, ...overrides };
}

describe("isTransientFailure", () => {
  it("matches the real verbatim quota error text found in ticket 001", () => {
    expect(
      isTransientFailure(
        result({
          stderr:
            "Attempt 1 failed: You exceeded your current quota, please check your plan and billing details.",
        })
      )
    ).toBe(true);
  });

  it("matches generic transient patterns (429, rate limit, RESOURCE_EXHAUSTED, ECONNRESET)", () => {
    expect(isTransientFailure(result({ stderr: "HTTP 429 Too Many Requests" }))).toBe(true);
    expect(isTransientFailure(result({ stderr: "rate limit exceeded" }))).toBe(true);
    expect(isTransientFailure(result({ stderr: "RESOURCE_EXHAUSTED" }))).toBe(true);
    expect(isTransientFailure(result({ stderr: "ECONNRESET" }))).toBe(true);
  });

  it("treats a timeout as transient regardless of stderr content", () => {
    expect(isTransientFailure(result({ timedOut: true, stderr: "" }))).toBe(true);
  });

  it("does not treat a successful result as a failure", () => {
    expect(isTransientFailure(result({ exitCode: 0, stderr: "quota" }))).toBe(false);
  });

  it("does not match unrelated errors (e.g. bad flag, auth failure)", () => {
    expect(isTransientFailure(result({ stderr: "Unknown argument: --bogus-flag" }))).toBe(false);
    expect(isTransientFailure(result({ stderr: "Error authenticating: IneligibleTierError" }))).toBe(
      false
    );
  });
});

describe("withRetry", () => {
  it("retries on transient failure with exponential+jitter backoff, then succeeds", async () => {
    const attempt = vi
      .fn<() => Promise<SingleAttemptResult>>()
      .mockResolvedValueOnce(result({ stderr: "You exceeded your current quota, please check your plan" }))
      .mockResolvedValueOnce(result({ exitCode: 0, stdout: "ok" }));

    const sleep = vi.fn().mockResolvedValue(undefined);

    const { result: finalResult, attempts } = await withRetry(attempt, {
      maxAttempts: 4,
      baseDelayMs: 1000,
      sleep,
    });

    expect(attempts).toBe(2);
    expect(finalResult.exitCode).toBe(0);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    // baseDelayMs * 2^(1-1) = 1000 is the max for the first retry's jitter window.
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(0);
    expect(sleep.mock.calls[0][0]).toBeLessThanOrEqual(1000);
  });

  it("fails fast on the first attempt for a non-transient error (no retry, no sleep)", async () => {
    const attempt = vi
      .fn<() => Promise<SingleAttemptResult>>()
      .mockResolvedValue(result({ stderr: "Unknown argument: --bogus-flag" }));
    const sleep = vi.fn();

    const { attempts } = await withRetry(attempt, { maxAttempts: 4, sleep });

    expect(attempts).toBe(1);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after maxAttempts even if every failure is transient", async () => {
    const attempt = vi
      .fn<() => Promise<SingleAttemptResult>>()
      .mockResolvedValue(result({ stderr: "rate limit exceeded" }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const { attempts, result: finalResult } = await withRetry(attempt, { maxAttempts: 3, sleep });

    expect(attempts).toBe(3);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(finalResult.exitCode).not.toBe(0);
  });
});
