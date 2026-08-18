# Outcome: Ticket 002 — Gemini bridge implementation

## Round 1 review finding: a real, exploitable command-injection gap (found and fixed post-review)

The round-1 reviewer scrutinized the injection-safety functional test and
correctly identified it as invalid: it used `process.execPath` (`node.exe`)
as its fixture, but cross-spawn only engages its cmd.exe-escaping logic for
targets that are **not** `.exe`/`.com` (`lib/parse.js`:
`needsShell = !isExecutableRegExp.test(commandFile)`). Since `node.exe`
matches `.exe`, the original test exercised cross-spawn's plain non-shell
path — cmd.exe was never involved, and the test proved nothing about the
real `gemini.cmd` invocation.

While fixing that test to use a real `.cmd` fixture (per the plan's own
original prescription), a genuine, exploitable vulnerability was found and
confirmed against **the real installed `gemini.cmd`**, not just the test
fixture: the shim's own body forwards its arguments to node via `%*`
(confirmed by reading its actual contents) — a **second, independent
batch-parsing pass** that cross-spawn's escaping does not reach, because
cross-spawn only controls the *first* cmd.exe invocation (the one that
runs the shim itself). An argument containing `'" & echo INJECTED & "'`
caused `echo INJECTED` to actually execute, despite cross-spawn's escaping
of the outer invocation being correct. This means the original design
(spawn `gemini`, resolving to the `.cmd` shim, via cross-spawn) was
genuinely unsafe for adversarial content — exactly the codebase-dump /
free-form-prompt content this ticket's workloads consist of.

**Fix**: `spawnGemini.ts`'s `resolveGeminiInvocation()` now reads
`gemini.cmd`'s own resolution logic (visible in its contents —
`"%dp0%\node_modules\@google\gemini-cli\bundle\gemini.js"` run via node)
and replicates it in JS: resolves the shim's directory via `which.sync`,
locates the bundled `gemini.js` script, and spawns `process.execPath`
(our own running node.exe) directly on that script path — bypassing the
`.cmd` shim, and therefore cmd.exe, entirely. `node.exe` matches
cross-spawn's `.exe` fast path, so no shell is ever invoked for the real
code path, closing this injection class completely rather than trying to
out-escape it.

This was caught before commit because the round-1 reviewer's scrutiny of
the "load-bearing" safety test forced a closer look at what it actually
proved — worth noting since it demonstrates why the injection-safety test
being unmocked/real mattered as much as the plan insisted.

## What was built

- `src/types.ts` — `GeminiMode`, `AskGeminiOptions`, `GeminiResult`,
  `GeminiInvocationError`.
- `src/process/spawnGemini.ts` — `resolveGeminiInvocation()` (resolves and
  caches the real node.exe + gemini.js script path, bypassing the `.cmd`
  shim — see finding above) + single-attempt process invocation via
  `cross-spawn` (never `shell: true`), backpressure-aware chunked stdin
  writes, array-join stdout/stderr collection, timeout → `taskkill /pid
  <pid> /t /f` teardown (never bare `child.kill()`).
- `src/process/retry.ts` — `isTransientFailure()` matching the real
  verbatim quota text from ticket 001 plus generic transient patterns;
  `withRetry()` with exponential backoff + full jitter, capped attempts,
  fail-fast on non-transient errors.
- `src/bridge.ts` — `askGemini(input, opts)`: builds per-mode args
  (`chat`/`codebase`/`document`), uses `--include-directories` for codebase
  mode (no manual file concatenation), pipes document content via stdin
  appended to `-p` per ticket 001's finding. No hardcoded payload-size
  ceiling anywhere.
- `src/cli.ts` — thin argv wrapper over `askGemini`.
- `tests/unit/` — `spawnGemini.test.ts` (now also asserts the resolved
  invocation is `process.execPath` + script path, not `gemini` directly),
  `retry.test.ts`, `bridge.test.ts` (all mock `cross-spawn`/`which`/`fs` —
  verify this module's own logic, not cross-spawn's internals).
- `tests/functional/cross-spawn-escaping.test.ts` — **unmocked**, two
  suites: (1) proves the current node.exe-direct path is safe against 5
  adversarial cmd.exe-metacharacter cases plus the confirmed injection
  payload; (2) a locked-in regression guard proving the old `.cmd`-shim
  path is genuinely unsafe for that same payload, so a future
  "simplification" back to spawning `gemini` directly gets caught
  immediately by a failing test.
- `tests/integration/gemini.smoke.test.ts` — gated behind
  `RUN_INTEGRATION=1`, calls the real installed CLI via the new resolution
  path.
- `package.json` / `tsconfig.json` — `cross-spawn@^7.0.6` (confirmed
  installed version, above the `>=7.0.5` CVE floor from GHSA-3xgq-45jj-v275),
  `which@^2.0.2` (+ `@types/which`), `vitest`, `typescript`, `tsx`.

## Verification performed

- **Unit tests**: 22 passing (`spawnGemini` 6, `retry` 8, `bridge` 8) —
  mocked `cross-spawn`/`which`/`fs`, no real API calls. Includes a
  regression test asserting the options object passed to `crossSpawn`
  never sets `shell` truthy, and a new test asserting the resolved
  command/args are `process.execPath` + the script path (not `gemini`
  directly), plus a test for the missing-script-path error path.
- **Functional injection-safety tests**: 8 passing (6 proving the current
  safe path, 2 documenting the old unsafe path as a regression guard), all
  real `cross-spawn`, no mocks, no network call.
- **Mutation check on `retry.ts`'s matcher**: temporarily removed the
  `exceeded your current quota` branch from `TRANSIENT_ERROR_PATTERN` →
  2 tests went red as expected (`isTransientFailure` quota-text test, and
  `withRetry`'s retry-then-succeed test) → pattern restored → full suite
  green again. Confirms the tests genuinely exercise the real string, not
  just any error path.
- **Integration smoke test**: run for real (`RUN_INTEGRATION=1 npm run
  test:integration`) against the installed CLI with `GEMINI_API_KEY` set,
  through the redesigned node.exe-direct invocation — passed, ~10.6s round
  trip, chat mode returned a real non-empty response.
- **CLI entrypoint smoke test**: `npx tsx src/cli.ts --mode chat "Reply
  with exactly: CLI-OK-2"` → returned `CLI-OK-2` for real, post-redesign.
- **Type-check**: `npx tsc --noEmit` clean across `src/`, `tests/`,
  `spikes/`.
- **No hardcoded payload-size figure**: grepped the diff — none present;
  `bridge.test.ts` includes an explicit assertion that constructed args
  never contain a `\d+(KB|MB|bytes)`-shaped string.

## Open decision recorded (per plan's requirement not to leave it implicit)

Checked for a Gemini CLI flag to disable its own internal retry-on-quota
loop (grepped the bundled CLI for retry/no-retry-shaped option names) —
**none found**. Given that, and given ticket 001 showed 10KB/100KB payloads
legitimately taking ~50s each, chose to **accept possible compounding
delay** (CLI retries internally, `askGemini`'s `withRetry` retries again on
top) rather than shrink the default 120s timeout aggressively, which would
risk killing legitimate slow-but-succeeding calls. The 120s default now
serves as the outer ceiling on any single attempt including the CLI's own
internal retries. Documented inline at `src/bridge.ts`'s
`DEFAULT_TIMEOUT_MS`.

## Deploy-time / environment carryovers

- No new environment changes beyond ticket 001's (persistent
  `GEMINI_API_KEY`, `~/.gemini/settings.json` auth type) — this ticket adds
  no new system-level state.
- `cross-spawn` and `which` are now runtime `dependencies` (not just dev)
  — anything consuming this package needs them installed via `npm install`.
- `resolveGeminiInvocation()` assumes the installed `@google/gemini-cli`
  package's on-disk layout (`node_modules/@google/gemini-cli/bundle/
  gemini.js` relative to the shim's directory) stays stable across
  versions. If a future `gemini-cli` upgrade changes this layout, the
  resolution throws a clear, actionable error rather than failing
  silently — but this is a real coupling to worth flagging for whoever
  upgrades that dependency later.

## Scope check against ticket 002 acceptance criteria

- ✅ `askGemini()` successfully invokes the real installed CLI end-to-end
  (integration smoke test + manual CLI smoke test both passed for real,
  post-redesign).
- ✅ Command construction is injection-safe against cmd.exe metacharacters
  for arbitrary content — proven by the unmocked functional test against
  the actual production code path (not the originally-flawed node.exe
  fixture), with the old unsafe path locked in as a regression guard.
- ✅ Retry/backoff is unit-tested against the real observed quota error
  text with mocked `spawn`.
- ✅ Timeout enforcement is unit-tested to confirm `taskkill`-based
  teardown, not bare `child.kill()`.
- ✅ No max-payload number hardcoded anywhere.
