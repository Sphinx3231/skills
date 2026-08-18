# Plan: Ticket 003 — `ask_gemini` MCP tool

## API confirmed via research

Current `@modelcontextprotocol/sdk` uses `McpServer` from
`@modelcontextprotocol/sdk/server/mcp.js`, `StdioServerTransport` from
`@modelcontextprotocol/sdk/server/stdio.js`, and
`server.registerTool(name, { title, description, inputSchema: <zod object>,
annotations }, handler)`. Zod is a required peer dependency, not currently
in `package.json` — must be added alongside the SDK.

## 1. Dependencies

Add to `package.json` as runtime `dependencies` (they run in the shipped
server process, not just at build time): `@modelcontextprotocol/sdk`,
`zod`.

## 2. `src/mcp-server.ts`

- `new McpServer({ name: "bridge-bot", version: "0.0.0" })`.
- Zod input schema mirroring `AskGeminiOptions`/`AskGeminiInput` 1:1 — no
  renamed/derived fields: `prompt` (required string), `mode`
  (`z.enum(["chat","codebase","document"])`, default `"chat"`),
  `includeDirectories` (optional string array), `filePath` (optional
  string, document mode), `timeoutMs` (optional number), `model` (optional
  string). No `content` field is exposed directly — document mode always
  reads from `filePath` server-side, matching `cli.ts`'s existing
  `readFileSync(parsed.file, "utf-8")` pattern, specifically to avoid
  requiring multi-megabyte content to be inlined into the tool-call JSON
  payload (the ticket's explicit reasoning).
- Handler logic, extracted as a named exported function
  (`handleAskGemini(params)`) so it can be unit-tested directly without
  going through the stdio transport. **The entire body (file read +
  `askGemini()` call) is wrapped in one try/catch** — not just the file
  read. This matters specifically because `mcp-server.ts` is a
  *long-lived* stdio server process, unlike `cli.ts`'s one-shot run: an
  unhandled rejection here doesn't just fail one tool call, it risks
  crashing the whole server and silently breaking every subsequent
  `ask_gemini` call for the rest of the session. `askGemini()` throws
  synchronously (rejecting its promise) in realistic, Claude-triggerable
  cases beyond CLI failure — `mode: "codebase"` with `includeDirectories`
  omitted/empty (`buildArgs` in `bridge.ts` throws), and `mode: "document"`
  where a successfully-read file is empty (`content` is falsy, `askGemini`
  throws its own `!input.content` check *after* the read already
  succeeded). Both must be caught here, not assumed rare:
  - `document` mode: `readFileSync(filePath, "utf-8")` — a bad path is a
    genuine "tool couldn't execute" failure (`isError: true`, no
    `askGemini()` call ever happened), not a Gemini failure.
  - Otherwise (and after a successful read): call `askGemini({ prompt,
    content }, { mode, includeDirectories, model, timeoutMs })` unchanged
    — zero new business logic, a thin adapter over ticket 002's
    already-reviewed core. Any throw from this call (missing
    `includeDirectories`, empty document content, or a genuine unexpected
    bug) is caught by the same outer try/catch and converted to a
    structured `isError: true` result — never left to propagate as an
    unhandled rejection.
- Result shape: primary content block is `result.stdout` (`type: "text"`).
  A second `type: "text"` JSON block carries `{ attempts, timedOut,
  exitCode, stderr: exitCode !== 0 ? result.stderr : undefined }` so Claude
  can reason about partial failures structurally, not by parsing prose.
  **`isError` is NOT set when `askGemini()` returns normally with a
  non-zero exit code** — a completed-but-failed Gemini invocation is a
  successful tool call carrying failure data (lets Claude retry/adjust
  rather than the call throwing opaquely). `isError: true` is reserved for
  cases where the tool itself couldn't run at all: bad `filePath`, or an
  unexpected thrown exception (rare, since `bridge.ts` already returns a
  `GeminiResult` even on CLI failure).
- `main()`: `new StdioServerTransport()`, `await server.connect(transport)`,
  readiness log to **stderr only** (stdout is the MCP protocol channel —
  writing anything else there would corrupt it). `.catch()` →
  `process.exit(1)`, matching `cli.ts`'s existing pattern.

## 3. Registration

**Decision: register via `npx tsx src/mcp-server.ts`, not a compiled
`dist/` build.** tsx's ~200–400ms startup cost is paid once per Claude
Code session launch, not per tool call — negligible against Gemini CLI
invocations that already take 10–50s+. This also matches the project's
existing convention (`cli.ts` already runs via `tsx`; no build step exists
yet). Revisit with a `tsc` build only if session-startup latency becomes a
measured problem.

Run from `Bridge Bot/` so the registration scopes to this project
directory, matching how the existing `expo` server is scoped:

```
claude mcp add bridge-bot-gemini -- npx tsx src/mcp-server.ts
```

This writes into `.claude.json`'s `projects["...Bridge Bot"].mcpServers`
via the supported CLI path — no hand-editing that file directly.

## 4. Testing

- **Unit** (`tests/unit/mcp-server.test.ts`): import `handleAskGemini`
  directly, mock `askGemini` (`vi.mock("../../src/bridge.js")`) and
  `readFileSync`; assert schema validation, `filePath`-read wiring for
  document mode, and the error-vs-success content-shaping rule above
  (bad path → `isError: true`; non-zero `askGemini()` exit → normal
  success result carrying failure metadata). **Also assert the handler
  does not throw/reject** for: `mode: "codebase"` with no
  `includeDirectories` (mocked `askGemini` throwing, to simulate
  `bridge.ts`'s real behavior), and `mode: "document"` with an empty file
  (mocked `readFileSync` returning `""`) — both must resolve to a
  structured `isError: true` result, confirmed by directly calling
  `handleAskGemini` and asserting on its return value, not just that no
  exception escapes the test. Fully offline, no real Gemini call, no real
  MCP transport.
- **Manual verification** (acceptance-criteria-mandated, cannot be
  faked/skipped): after `claude mcp add` and a session restart, invoke
  `ask_gemini` for real in a live session for: (a) chat mode, (b) codebase
  mode against a real small directory, (c) document mode against a real
  multi-megabyte test file (the ticket's actual "multi-megabyte codebase
  checks" goal — a small file wouldn't verify this). Transcript captured
  into `docs/mcp-tool.md`.

## 5. Documentation

`docs/mcp-tool.md`: tool name, schema table, example result shape (success
and failure cases), the exact `claude mcp add` command used, and the
manual verification transcript from step 4.

## Critical files

- `src/mcp-server.ts` (new)
- `src/bridge.ts` (consumed unchanged)
- `src/types.ts` (consumed unchanged)
- `package.json` (new deps)
- `docs/mcp-tool.md` (new)
- `tests/unit/mcp-server.test.ts` (new)
