# Ticket 002: Build the Claude-to-Gemini CLI bridge (askGemini API + resilience)

## Status

In progress

## Background

Ticket 001's spike (`docs/outcomes/stdin-limit-spike-findings.md`) confirmed
the real Gemini CLI invocation surface and surfaced several facts the
implementation must design around rather than assume:

- `-p/--prompt` is the headless entrypoint; stdin content is **appended to**
  the `-p` prompt, not a replacement for it.
- `--include-directories` is the real flag for codebase/directory context —
  ticket 002 should use it rather than reinventing file concatenation.
- No confirmed max-stdin-payload figure exists (free-tier quota exhaustion
  confounded ticket 001's size ladder at 1MB) — resilience code must not
  hardcode a specific size ceiling.
- The real, verbatim rate-limit/quota error text is
  `"You exceeded your current quota, please check your plan and billing details."`
  — this, not the originally-assumed `/429|rate.?limit|RESOURCE_EXHAUSTED/i`
  pattern alone, is what a retry matcher must catch (the assumed pattern
  would have missed this real case entirely).
- On Windows, `gemini` resolves to a `.cmd` shim requiring `shell: true` to
  spawn at all, `shell: true` does not escape an args array (must build a
  manually-quoted command string), and teardown requires
  `taskkill /pid <pid> /t /f` rather than bare `child.kill()`.
- Ticket 001's own quoting helper (`winQuoteArg`) is explicitly **not**
  injection-safe against cmd.exe metacharacters (`&`, `|`, `^`, `%`, `<`,
  `>`) and was only safe there because it quoted a fixed set of internal
  instruction strings. Ticket 002 will pipe far less controlled content
  (codebase dumps, arbitrary prompts) through the same kind of invocation,
  so it needs a real solution here — not a copy-paste of ticket 001's
  helper.

## Goal

A reusable Node/TS module (`askGemini()`) plus a thin CLI entrypoint that
Claude (or a human) can use to delegate large-context work to the local
Gemini CLI, with real resilience: safe process invocation, timeout
handling, retry/backoff on genuine transient/quota errors, and safe
handling of multi-megabyte payloads.

## Scope

- `src/types.ts` — shared types (`GeminiMode`, `AskGeminiOptions`,
  `GeminiResult`, etc).
- `src/process/spawnGemini.ts` — safe process invocation: solves the
  shell:true + injection-safety problem properly (either a real
  cmd.exe-safe escaping function covering metacharacters, or resolving and
  invoking the actual `gemini.cmd` path directly to avoid needing
  `shell: true` for arbitrary content — plan phase must decide which and
  justify it), backpressure-aware stdin writes, stream collection avoiding
  O(n²) concatenation, and `taskkill`-based teardown on timeout/abort.
- `src/process/retry.ts` — exponential backoff + jitter retry, matching on
  the real observed quota/rate-limit error text (plus generic transient
  patterns), capped attempt count, only retrying matched-transient
  failures.
- `src/bridge.ts` — `askGemini(payload, opts)`: builds the right
  `gemini` invocation per mode (`chat` | `codebase` | `document`), using
  `--include-directories` for codebase mode rather than manual file
  concatenation, wires together spawn + retry + timeout.
- `src/cli.ts` — thin CLI wrapper for manual/Claude-driven invocation.
- `tests/unit/` — mocked-`spawn` tests for timeout→kill, retry-on-matched-
  error, no-retry-on-other-errors, backoff timing (fake timers), stream
  chunking/backpressure. No real Gemini calls.
- `tests/integration/` — one real smoke test against the installed `gemini`
  CLI, tagged/separated so it doesn't block offline/CI runs.

## Non-goals

- No UI, no ticketed-change/gated-build skill wiring beyond what's needed
  to build and test this module — this ticket is the bridge tool itself,
  not tooling to invoke it from Claude's session automatically.
- No attempt to solve the "confirmed max payload size" question left open
  by ticket 001 — resilience code should be defensive (chunking/streaming
  posture) rather than block on getting that number first.
- No changes to `spikes/stdin-limit-spike.ts` (ticket 001's artifact stays
  as-is; this ticket may reuse its *lessons*, not its code, per the
  injection-safety note above).

## Acceptance criteria

- `askGemini()` successfully invokes the real installed Gemini CLI end to
  end for at least a `chat`-mode smoke test.
- The command-construction approach is injection-safe against cmd.exe
  metacharacters for arbitrary prompt/payload content, not just the fixed
  strings ticket 001 used — this is a hard requirement given codebase
  dumps and free-form prompts are the actual target workload.
- Retry/backoff is unit-tested against the real observed quota error text
  from ticket 001, with mocked `spawn` (no real API calls in the unit
  suite).
- Timeout enforcement is unit-tested to confirm it triggers `taskkill`-based
  teardown, not bare `child.kill()`.
- No max-payload number is hardcoded anywhere in the implementation.
