# Ticket 001: Benchmark Gemini CLI stdin payload limits and confirm invocation flags

## Status

Closed — plan, implementation, and outcome all reviewer-approved. See
`docs/outcomes/stdin-limit-spike-findings.md` and
`docs/outcomes/gemini-cli-stdin-spike-outcome.md`.

## Background

The Bridge Bot spec (`claude_gemini_bridge_bot_spec.md`) calls for a local
Node.js wrapper that spawns the installed Gemini CLI (`@google/gemini-cli`)
as a child process, pipes prompts/payloads via stdin, and captures stdout,
with resilience controls (timeouts, retry/backoff, stream buffering for
multi-megabyte payloads). Building that resilience layer requires knowing,
empirically, how the real installed CLI actually behaves under load —
practical stdin size limits, real invocation flags for directory/file-context
ingestion, and what rate-limit/transient-error output actually looks like.
None of this should be assumed or invented; the spec itself flags these as
open questions the implementation must verify rather than guess.

## Goal

Produce a findings document that gives ticket 002 (full implementation)
concrete, verified numbers and flag names to design against, instead of
placeholder assumptions.

## Scope

- Scaffold this project's doc structure (`docs/tickets/`, `docs/plans/`,
  `docs/outcomes/`) and root `CLAUDE.md` (already created).
- Write `spikes/stdin-limit-spike.ts`: a Node/TS script that spawns the
  installed `gemini` CLI (via `child_process.spawn`, not `exec`/`execFile`,
  to avoid Node's default `maxBuffer` ceiling) with synthetic text payloads
  of increasing size (e.g. 10KB, 100KB, 1MB, 5MB, 20MB, 50MB) piped over
  stdin, recording for each size: success/failure, latency, exit code, and
  exact stderr output on failure.
- Run `gemini --help` (and any relevant subcommand help) and record the
  actual flag names available for prompt input, directory/file-context
  ingestion, and non-interactive/headless invocation — do not assume flags
  like `--include-directories` or `-p` in advance.
- Write `docs/outcomes/stdin-limit-spike-findings.md` documenting: the
  max practical stdin payload size found, the confirmed CLI flags for each
  intended mode (chat/codebase/document), and any observed rate-limit or
  transient-error output patterns worth matching on in a future retry layer.

## Non-goals

- No `askGemini()` API, no retry/backoff/timeout implementation, no CLI
  wrapper entrypoint — that is ticket 002's scope entirely. This ticket only
  produces the spike script and its findings doc.
- No changes to any other project in the monorepo (FoxBite, claude-skills,
  Claude Agents).

## Acceptance criteria

- `spikes/stdin-limit-spike.ts` runs against the real installed `gemini`
  CLI and produces a recorded result (success/fail/latency/error) for each
  tested payload size.
- `docs/outcomes/stdin-limit-spike-findings.md` exists and states a
  concrete max-practical-payload figure and the real, verified CLI flags
  for prompt/codebase/document invocation modes, sourced from actual
  `gemini --help` output and spike runs, not assumption.
- Project scaffold (`CLAUDE.md`, `docs/tickets/`, `docs/plans/`,
  `docs/outcomes/`) exists and follows the conventions documented in this
  project's `CLAUDE.md`.
