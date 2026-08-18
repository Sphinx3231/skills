# Outcome: Ticket 003 — `ask_gemini` MCP tool

## What was built

- `src/mcp-server.ts` — MCP stdio server (`McpServer` +
  `StdioServerTransport`) exposing one tool, `ask_gemini`, with a Zod input
  schema matching `AskGeminiOptions`/`AskGeminiInput` (`prompt`, `mode`,
  `includeDirectories`, `filePath`, `timeoutMs`, `model`). Thin adapter
  only — `askGemini()` (ticket 002, injection-safety-hardened) is called
  unchanged; no new process/spawn logic anywhere in this ticket. Guarded so
  the stdio transport only connects when the file is run directly (`tsx
  src/mcp-server.ts`), not when imported by tests.
- `handleAskGemini()` — exported separately from tool registration so unit
  tests can call it directly. Per the round-1 review finding (see below),
  the **entire body** (file read + `askGemini()` call) is wrapped in one
  try/catch, since this is a long-lived server process where an unhandled
  rejection would crash every subsequent tool call for the rest of the
  session — not just the `readFileSync` step.
- `tests/unit/mcp-server.test.ts` — 8 tests, mocked `askGemini`/`readFileSync`.
- `docs/mcp-tool.md` — schema table, registration command, real manual
  verification transcript.
- `package.json` — `@modelcontextprotocol/sdk@^1.30.0`, `zod@^3.25.0` (SDK
  supports `^3.25 || ^4.0`; chose the more broadly-compatible v3 line).
- Registered via `claude mcp add bridge-bot-gemini --scope user -- <absolute
  tsx.cmd path> <absolute mcp-server.ts path>`.

## Round-1 review finding, addressed before implementation

The plan reviewer caught that the original plan only wrapped the file-read
step in try/catch, not the `askGemini()` call itself — which throws
synchronously for realistic cases (codebase mode with missing
`includeDirectories`, document mode with an empty file passing the read
but failing `askGemini`'s own content check). Fixed at the plan stage
before any code was written; implementation follows the corrected plan
directly (whole-body try/catch), verified by two dedicated regression
tests (`does not throw/reject when askGemini() itself throws...`).

## A registration-scope issue found and fixed during implementation

Initially registered with the default `--scope local`, run from inside
`Bridge Bot/` — this scopes the registration to that exact project
directory in `.claude.json`. Verified via `claude mcp list` run from
`C:\Users\El Samaka` (this session's actual root) that the server was
**not visible** from there — confirming the round-1 reviewer's non-blocking
cwd/scope concern was a real, live issue, not theoretical. Re-registered
with `--scope user` (global) instead, matching the tool's actual intent
(callable from any project, not just from within Bridge Bot itself) —
verified visible and `✔ Connected` via `claude mcp list` from the home
directory afterward.

## Manual verification (mandatory per acceptance criteria — see docs/mcp-tool.md for full transcript)

Performed via a real MCP client (`@modelcontextprotocol/sdk`'s
`Client`/`StdioClientTransport`) driving the actual registered server
process — this session couldn't be restarted mid-conversation to exercise
the native Claude Code tool-call path directly, so an external client
speaking the identical protocol to the identical server command was used
instead. This is protocol-equivalent verification, not a mock — flagged in
`docs/mcp-tool.md` with a recommendation that the user also try it from a
fresh session to confirm the native path.

- `listTools` → `["ask_gemini"]`.
- Chat mode: real call, correct output, `exitCode: 0`.
- Codebase mode: real call against `src/`, Gemini correctly counted 4
  `.ts` files directly in that directory — confirms `--include-directories`
  wiring works end-to-end, not just in unit mocks.
- Document mode: real call with a 100KB file (matching ticket 001's
  confirmed-reliable size) → succeeded.
- Error case: document mode with no `filePath` → `isError: true`,
  no crash.

**Multi-megabyte document mode was attempted (3MB) but not successfully
verified at that scale** — it hit the same free-tier API quota exhaustion
ticket 001 already documented (large payloads trigger `askGemini`'s
retry loop, each attempt waiting out a 120s timeout), not a defect in this
ticket's code. The 100KB run proves the wiring is correct; true multi-MB
verification needs a paid-tier key, same as ticket 001 already flagged.
Documented explicitly in `docs/mcp-tool.md` rather than silently
downgrading the test size without explanation.

## Deploy-time / environment carryovers

- `bridge-bot-gemini` is now a **user-scoped** (global) MCP server
  registration on this machine — visible to every Claude Code session
  regardless of project, not just Bridge Bot.
- No changes to `askGemini()`, `spawnGemini.ts`, or `retry.ts` — ticket
  002's injection-safety fix is unmodified and unbypassed.

## Scope check against ticket 003 acceptance criteria

- ✅ A real (external-client-driven, protocol-equivalent to native)
  invocation returns a real Gemini response for chat mode.
- ✅ Codebase mode's `includeDirectories` verified against a real
  directory, not just unit-mocked.
- ⚠️ Document mode verified end-to-end for real, but only at 100KB, not
  multi-MB — blocked by the same free-tier quota ticket 001 documented,
  not a code defect. Explicitly flagged rather than silently claimed done.
- ✅ Server registered for this workspace (user scope) and confirmed via
  `claude mcp list`.
- ✅ No injection-safety regression — `askGemini()` consumed unchanged.
