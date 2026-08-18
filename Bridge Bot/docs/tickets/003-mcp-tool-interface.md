# Ticket 003: Expose askGemini() as a Claude-callable MCP tool

## Status

In progress

## Background

Tickets 001 and 002 built and verified `askGemini()` — a safe, tested
Node/TS function that delegates prompts/codebase/document workloads to the
local Gemini CLI, with retry/backoff and injection-safe process invocation
(the shell-injection vulnerability found and fixed in ticket 002 is the
reason "safe" matters here specifically — this ticket routes arbitrary,
Claude/user-influenced content through the same invocation path, so ticket
002's fix is a hard prerequisite, not incidental).

The original spec envisioned Claude "invoking" this bridge "without human
intervention." This workspace already has a working example of exactly
that mechanism: `.claude.json`'s `projects["C:/Users/El
Samaka/OneDrive/Desktop/Claude"].mcpServers` currently registers an `expo`
MCP server (`{"type": "http", "url": "https://mcp.expo.dev/mcp"}`). An MCP
server is the correct mechanism for "Claude can invoke dynamically" — it
gives Claude a real, typed tool call (name, input schema, structured
result), unlike a Skill (which loads instructions for Claude to follow via
Bash, not a native tool call). This ticket builds a local MCP server
wrapping `askGemini()`, not a Skill.

## Goal

Register an MCP tool (working name: `ask_gemini`) that Claude can call
directly during a session to delegate large-context work to Gemini,
without the user manually running the CLI or copy-pasting output.

## Scope

- `src/mcp-server.ts` — an MCP server (using `@modelcontextprotocol/sdk`,
  stdio transport) exposing one tool, `ask_gemini`, with an input schema
  covering: `prompt` (string, required), `mode` (`chat`/`codebase`/
  `document`), `includeDirectories` (string array, codebase mode),
  `filePath` (string, document mode — read from disk rather than requiring
  the caller to inline multi-megabyte content into the tool-call payload
  itself, mirroring `cli.ts`'s existing `--file` flag), `timeoutMs`,
  `model`. Wraps `askGemini()` from ticket 002 directly — no reimplementation
  of process/retry logic.
- Tool result: structured MCP content — the Gemini response text as the
  primary content block, plus `attempts`/`timedOut`/`exitCode` as
  structured metadata so Claude can reason about partial failures rather
  than only seeing raw stdout.
- Registration: add this server to `.claude.json`'s project-scoped
  `mcpServers` for this workspace, via `claude mcp add` (the supported CLI
  path) rather than hand-editing the JSON directly.
- A short `docs/mcp-tool.md` (or similar) documenting the tool's schema and
  a manual verification transcript (an actual Claude session invoking it).

## Non-goals

- No changes to `askGemini()`, `spawnGemini.ts`, or `retry.ts` themselves —
  this ticket is purely an interface layer on top of ticket 002's already-
  reviewed, already-injection-safety-hardened core.
- No true token-level streaming of Gemini's response back into Claude's
  context mid-generation — MCP's stdio tool-call model is
  request/response, not a streaming primitive suited to this. "Streams back
  cleanly" is interpreted as: the full response arrives as a normal tool
  result Claude can read and act on immediately, without the user manually
  relaying it — not literal token-by-token streaming. If genuine streaming
  is wanted later, that's a separate ticket investigating MCP's
  notification-based progress APIs.
- No multi-server / remote-hosting concerns — this is a local stdio server
  for this one workspace, matching the `expo` server's pattern.

## Acceptance criteria

- A real Claude Code session (this one, or a fresh one after registration)
  can invoke the `ask_gemini` tool and get back a real Gemini response for
  at least a `chat`-mode call.
- `codebase` mode correctly passes `includeDirectories` through to
  `askGemini()`'s existing `--include-directories` handling — verified
  against a real small directory, not just unit-mocked.
- `document` mode reads `filePath` from disk and pipes it through
  `askGemini()`'s existing stdin/backpressure path — verified with a
  multi-megabyte test file, not just a small one, since this is the
  ticket's actual "delegate multi-megabyte codebase checks" goal.
- The MCP server is registered for this workspace and appears in Claude
  Code's tool list after a session restart.
- No new injection-safety regressions — the MCP tool's input fields
  (`prompt`, `filePath` contents, `includeDirectories`) must flow through
  ticket 002's already-safe `askGemini()` path unchanged, not through any
  new spawn/shell logic introduced by this ticket.
