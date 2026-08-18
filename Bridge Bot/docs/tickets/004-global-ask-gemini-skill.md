# Ticket 004: Global `ask-gemini` Skill wrapping the CLI, with optional per-call API key override

## Status

Done

## Background

Ticket 003 exposed `askGemini()` as an MCP tool (`ask_gemini`, `--scope
user`, reads `GEMINI_API_KEY` from the persistent environment) — a native
tool call Claude invokes automatically. The user now wants a second,
complementary path: a global Claude Code **Skill** (distinct mechanism —
loaded instructions Claude follows via Bash, not a native tool call,
per existing skills at `~/.claude/skills/*/SKILL.md`) that drives
`src/cli.ts` directly. This is useful when explicit, inspectable
instruction-following is wanted over an opaque native tool call, and
specifically to support supplying a **one-off API key** for a single
invocation without touching the MCP server's persistent env var.

Clarified with the user:
- This is additive, not a replacement for the ticket-003 MCP tool.
- The API key is an **optional override** — if omitted, the skill falls
  back to the already-configured persistent `GEMINI_API_KEY`. It is never
  required on every call (avoiding the same secrets-in-history exposure
  risk already hit once in this project).

## Goal

A global Skill (`~/.claude/skills/ask-gemini/SKILL.md`) that documents how
Claude should invoke `src/cli.ts` for chat/codebase/document workloads,
with instructions for handling an optional one-off API key override
safely (process-scoped only, never written to a file, never echoed).

## Scope

- `~/.claude/skills/ask-gemini/SKILL.md` — frontmatter (`name`,
  `description` matching this repo's other skills' style/trigger-phrase
  convention) + body documenting:
  - The three modes and their `cli.ts` flags (`--mode`, `--dir`, `--file`,
    `--timeout-ms`, `--model`), mirroring the real flags in
    `src/cli.ts` (read the file, don't guess).
  - How to parse an optional `api_key` out of the skill's free-text `args`
    input (Skills receive a plain string, not structured params).
  - **Safety rule**: when an override key is supplied, it is set only as
    a process-scoped env var for that one Bash invocation (e.g. `GEMINI_API_KEY=<key>
    npx tsx .../src/cli.ts ...` in a single command), never persisted via
    `setx`/`SetEnvironmentVariable`, never written to any file, and the
    skill instructs Claude not to echo the key value back in its own
    response text.
  - When no override is supplied, no key handling is needed at all — the
    already-configured persistent env var covers it.
  - A pointer to the ticket-003 MCP tool as the preferred default path for
    routine use, with this skill positioned as the explicit/manual
    alternative.
- No changes to `src/cli.ts`, `src/bridge.ts`, `src/mcp-server.ts`, or any
  other existing Bridge Bot code — this ticket is a new documentation/
  instruction artifact only, installed outside this repo (global
  `~/.claude/skills/`), not shipped code.

## Non-goals

- No new CLI flag on `cli.ts` for the API key (the override is handled by
  setting the env var for that one process invocation, which `cli.ts`
  already respects via `process.env.GEMINI_API_KEY` inside
  `spawnGemini.ts` — no code change needed).
- No change to the MCP tool's key-handling (still env-var-only, per ticket
  003 — out of scope here).
- No mechanism for persisting a supplied override key — that remains a
  manual, explicit action the user takes themselves (as established in
  tickets 001-003), not something this skill automates.

## Acceptance criteria

- The skill file exists at the correct global path and follows this
  workspace's existing skill frontmatter/style conventions closely enough
  to trigger appropriately (a short manual check against 1-2 existing
  skills' phrasing, not a new convention invented from scratch).
- Skill instructions correctly reflect `cli.ts`'s actual current flags —
  verified by reading the file, not assumed from memory of ticket 002/003.
- The optional-override safety rule (process-scoped only, never
  persisted, never echoed) is explicit and unambiguous in the skill text.
- A real manual invocation (via the `Skill` tool, with and without an
  `api_key` override) demonstrates the skill correctly drives `cli.ts` and
  returns a real Gemini response.
