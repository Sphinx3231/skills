# `ask_gemini` MCP tool

Exposes `askGemini()` (ticket 002) as an MCP tool so Claude can delegate
large-context work to the local Gemini CLI directly during a session,
without the user manually running the CLI or relaying output by hand.

## Registration

```
claude mcp add bridge-bot-gemini --scope user -- "<repo>\node_modules\.bin\tsx.cmd" "<repo>\src\mcp-server.ts"
```

Registered with `--scope user` (global, not project-local) rather than
matching the `expo` server's project-local scope — Bridge Bot is a
general-purpose utility meant to be callable from any project the user
works in, not specific to one repo, and this Claude Code session's own
root (`C:\Users\El Samaka`) sits above both the `Claude` monorepo and the
`Bridge Bot` folder, so a project-local registration under either would
not have been visible from most sessions. **Both the `tsx.cmd` and
`mcp-server.ts` paths are absolute**, not relative to a cwd — `claude mcp
add`'s local/project scopes tie the registration to the directory it was
run from, and a relative path would silently break if the server were
ever registered or resolved from a different working directory.

Registration is stored in `~/.claude.json`'s top-level `mcpServers`
(user scope), verified via `claude mcp list` showing `bridge-bot-gemini ...
✔ Connected` regardless of which directory `claude` is invoked from.

`tsx` (not a compiled build) runs the server directly — its ~200-400ms
startup cost is paid once per Claude Code session launch, matching
`cli.ts`'s existing convention. Revisit with a `tsc` build only if
session-startup latency becomes a measured problem.

## Tool: `ask_gemini`

| Field | Type | Required | Notes |
|---|---|---|---|
| `prompt` | string | yes | Instruction sent to Gemini. |
| `mode` | `"chat"` \| `"codebase"` \| `"document"` | no (default `chat`) | |
| `includeDirectories` | string[] | codebase mode | Passed to `askGemini`'s `--include-directories`. |
| `filePath` | string | document mode | Read **server-side**; content is never inlined into the tool-call JSON payload, so multi-megabyte files don't bloat the request. |
| `timeoutMs` | number | no | Per-attempt timeout, default 120000. |
| `model` | string | no | Model override. |

### Result shape

Two `text` content blocks: Gemini's `stdout`, then a JSON metadata block
(`attempts`, `timedOut`, `exitCode`, and `stderr` when `exitCode !== 0`).

**A completed-but-failed Gemini call (non-zero exit) is NOT `isError`** —
it's a successful tool call carrying structured failure data, so Claude
can read *why* it failed and decide whether to retry/adjust rather than
the call throwing opaquely. `isError: true` is reserved for cases where
the tool itself couldn't run at all: a missing/unreadable `filePath`, or
an unexpected thrown exception from `askGemini()` (e.g. codebase mode with
no `includeDirectories`).

## Manual verification (real, not simulated)

Run 2026-08-19 against the real registered server process (same command
Claude Code itself spawns), driven via a real MCP client
(`@modelcontextprotocol/sdk`'s `Client`/`StdioClientTransport`) rather than
mocks, since the acceptance criteria require this specific verification to
not be faked/skipped. This session's own `claude` process couldn't be
restarted mid-conversation to pick up the new registration natively, so an
external MCP client speaking the same protocol to the same server command
was used instead — protocol-equivalent to what a restarted session would
do. **Recommend the user also try `ask_gemini` from a fresh session** to
confirm the native tool-call path, since that's the one path this
verification couldn't exercise directly.

- **`listTools`**: returned `["ask_gemini"]`.
- **Chat mode**: prompt `"Reply with exactly: MCP-CHAT-OK"` → returned
  `"MCP-CHAT-OK\n"`, `{"attempts":1,"timedOut":false,"exitCode":0}`.
- **Codebase mode**: prompt asking how many `.ts` files are directly in
  `src/`, `includeDirectories: [".../Bridge Bot/src"]` → returned `"4\n"`
  (correct — `bridge.ts`, `cli.ts`, `mcp-server.ts`, `types.ts`; the
  `process/` subdirectory's files aren't "directly in" `src/`), confirming
  `--include-directories` wiring works end-to-end, not just in unit mocks.
- **Document mode**: a 100KB test file (matching ticket 001's confirmed-
  reliable size) → returned `"MCP-DOC-OK\n"`,
  `{"attempts":1,"timedOut":false,"exitCode":0}`.
- **Error case**: document mode with no `filePath` → `isError: true`,
  `"document mode requires filePath"`, confirming failures surface as
  structured tool results, not crashes.

### Multi-megabyte document mode: not verified at multi-MB scale, and why

A 3MB test file was attempted first, per the ticket's explicit "multi-
megabyte" acceptance criterion. It timed out (client-side MCP timeout
raised to 150s, still insufficient) — consistent with, not a new
finding beyond, ticket 001's documented free-tier quota exhaustion: large
payloads on this account either take very long or hit
`"You exceeded your current quota"`, triggering `askGemini`'s retry loop
(up to 4 attempts × 120s timeout each). This is the underlying Gemini CLI/
account's behavior, not a defect in the MCP tool wiring — the 100KB run
above proves the wiring itself (server-side file read → stdin →
`askGemini` → result) is correct end-to-end; only the *volume* ticket 001
already flagged as quota-constrained remains unverified at true multi-MB
scale. Re-verifying at 3MB+ requires a paid-tier API key (same
recommendation ticket 001 made) rather than a code change here.
