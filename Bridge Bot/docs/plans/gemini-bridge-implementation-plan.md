# Plan: Ticket 002 — Gemini bridge implementation

## Central design decision: use `cross-spawn`, not hand-rolled shell escaping

Ticket 001 found that `gemini` resolves to an npm `.cmd` shim on Windows,
which forces `spawn()` into `shell: true` to invoke it at all — but
`shell: true` hands Node's args array to `cmd.exe` completely unescaped
(ticket 001's own spike bug: an unquoted multi-word `-p` value silently
split into separate shell words). Ticket 001's fix — a hand-written
`winQuoteArg` — only covered spaces/quotes/newlines, explicitly not
cmd.exe metacharacters (`&`, `|`, `^`, `%`, `<`, `>`), and its own review
flagged it as unsafe to reuse once payload content stops being a fixed set
of internal strings.

Ticket 002 pipes real, less-controlled content (codebase dumps, free-form
prompts) through this same invocation path, so hand-rolling cmd.exe
escaping correctly is the wrong call — this is exactly the problem
`cross-spawn` exists to solve (it's what npm, ESLint, and Jest use
internally for spawning `.cmd`/`.bat` shims safely on Windows). Adding it
as a dependency means `spawnGemini.ts` calls `crossSpawn(cmd, argsArray,
opts)` with a normal array of arguments — no manual command-string
building, no custom escaping function anywhere in the codebase.

**Caveat carried forward:** `cross-spawn` still resolves `.cmd` shims via a
`cmd.exe`-wrapped invocation under the hood (Windows doesn't allow direct
exec of `.cmd` files any other way) — so teardown still cannot assume plain
`child.kill()` reaches the real `gemini` process. Keep ticket 001's
`taskkill /pid <pid> /t /f` teardown, but verify empirically during
implementation (confirm via `tasklist` that a bare `.kill()` would leave
`gemini` running, same as ticket 001 found) rather than assuming
`cross-spawn` changes this.

## File-by-file plan

1. **`package.json`** — add `cross-spawn@>=7.0.5` (pinned floor — earlier
   versions carry a known ReDoS/escaping CVE, GHSA-3xgq-45jj-v275, in the
   argument-escaping regex that is the sole load-bearing mechanism for this
   ticket's injection-safety requirement, so an unpinned/stale-lockfile
   resolution must not be allowed to silently downgrade it) + `@types/cross-spawn`,
   `vitest` for unit tests (fake timers support), scripts `test:unit`,
   `test:integration`, `test:functional`, `cli`.
2. **`src/types.ts`** — `GeminiMode = 'chat' | 'codebase' | 'document'`;
   `AskGeminiOptions { mode, timeoutMs?, maxRetries?, model?, includeDirectories?: string[], outputFormat? }`;
   `GeminiResult { stdout, stderr, exitCode, attempts, timedOut }`.
3. **`src/process/spawnGemini.ts`** — wraps `crossSpawn(...)`, args always
   passed as an array (never a concatenated string). **The options object
   passed to `crossSpawn` must never set `shell: true`** — cross-spawn's own
   docs state that `shell: true` bypasses its internal escaping entirely,
   which would silently reintroduce ticket 001's exact unescaped-args bug
   while still "working" for well-behaved input. Only benign options
   (`windowsHide`, `cwd`, etc.) are allowed. Backpressure-aware
   stdin writes (64KB chunks, `drain` event — port ticket 001's spike
   pattern, minus its dead-code duplicate branch). stdout/stderr collected
   into arrays joined once at `close` (avoid O(n²) concat). Timeout timer
   → `killTree(pid)` helper (`execFile('taskkill', ['/pid', pid, '/t', '/f'])`)
   on fire, result marked `timedOut`. Resolves with a typed result
   (including raw stderr) on both success and failure rather than throwing
   on non-zero exit, so `retry.ts` can inspect stderr text.
4. **`src/process/retry.ts`** — `isTransientError(stderr): boolean` using
   `/exceeded your current quota|rate.?limit|429|RESOURCE_EXHAUSTED|ECONNRESET/i`
   (the first branch is ticket 001's real verbatim quota error text; the
   rest are defensive generic patterns). `withRetry(fn, { maxAttempts, baseDelayMs })`
   — exponential backoff with full jitter, capped attempts, only retries
   matched-transient failures; non-matching failures fail fast on attempt 1.
5. **`src/bridge.ts`** — `askGemini(payload, opts)`. Builds args by mode:
   `chat` → `['-p', prompt, '-o', 'text']`; `codebase` → adds
   `['--include-directories', dirs.join(',')]` (confirmed real flag from
   ticket 001 — no manual file concatenation); `document` → payload piped
   via stdin, appended to the `-p` prompt per ticket 001's finding that
   stdin is appended to `-p`, not a separate channel. Never hardcodes a
   payload-size ceiling anywhere. Wires `withRetry(() => spawnGemini(...))`.
6. **`src/cli.ts`** — thin argv wrapper (mode/prompt/dirs/timeout flags)
   calling `askGemini`, printing stdout, non-zero exit on failure.
7. **`tests/unit/`** (cross-spawn mocked — verifies spawnGemini.ts's own
   logic, not cross-spawn's escaping):
   - `spawnGemini.test.ts` — mock `cross-spawn`'s module (inject a fake
     ChildProcess-like EventEmitter); assert timeout triggers the
     `taskkill` execFile call (not bare `.kill()`); assert backpressure
     write path respects `drain`; **assert the options object passed to
     the mocked `crossSpawn` call never has `shell` set truthy** — this is
     the regression test for the shell:true footgun called out above.
   - `retry.test.ts` — fake timers; assert the real quota-text string
     triggers retry with exponential+jitter delays; assert non-matching
     stderr fails immediately without retry.
   - `bridge.test.ts` — assert per-mode arg-array construction, especially
     `--include-directories` presence for codebase mode and stdin-appended-
     to-`-p` behavior for document mode.
8. **`tests/functional/cross-spawn-escaping.test.ts`** (NOT mocked, but no
   network/API call needed — this is what actually proves the ticket's
   hard injection-safety requirement, which mocked unit tests structurally
   cannot verify since mocking cross-spawn only checks that spawnGemini.ts
   *calls* it correctly, not that escaping happens): spawn a trivial local
   fixture (e.g. `cmd.exe /c echo` or a tiny throwaway `.cmd` file) via the
   real `cross-spawn` module with argument strings containing `&`, `|`,
   `^`, `%`, `<`, `>`, embedded double quotes, and newlines; assert each
   argument arrives at the child process byte-for-byte rather than being
   split/interpreted by the shell. Runs in CI (no external dependency),
   offline-safe.
9. **`tests/integration/gemini.smoke.test.ts`** — one real `askGemini`
   chat-mode call against the installed CLI, gated behind an env var (e.g.
   `RUN_INTEGRATION=1`) so `test:unit`/`test:functional` stay offline-safe.
   This is the acceptance-criteria smoke test.

## Sequencing

types → spawnGemini (+ unit tests + the unmocked functional escaping test —
highest-risk/security-relevant piece, built and verified first) → retry
(+ tests) → bridge (+ tests) → cli → integration smoke test last (needs the
real `GEMINI_API_KEY` env already configured per this project's `CLAUDE.md`).

## Open decision to record explicitly (not blocking, but must not stay implicit)

Ticket 001 observed the Gemini CLI appears to have its own internal
retry-on-quota-error loop, which collided with the spike's external 120s
timeout. Ticket 002's `withRetry` adds a second, external retry/backoff
layer on top of whatever the CLI does internally. Implementation must
decide — and record the decision in the outcome doc, not leave it
implicit — whether to: (a) accept possible compounding delay (CLI retries
internally, then askGemini retries again externally on top), (b) look for
a CLI flag to disable its internal retry (not discovered in ticket 001;
check `gemini --help` subcommands), or (c) size `timeoutMs` deliberately
short enough that the external layer takes over quickly rather than
waiting out the CLI's own retry loop.

## Verification

- Full unit suite (`test:unit`) runs offline, no real API calls, covers
  timeout→taskkill, retry-on-real-quota-text, fail-fast-on-other-errors,
  and per-mode arg construction.
- Mutation check on `retry.ts`'s matcher: temporarily break the regex (e.g.
  drop the quota-text branch) and confirm the corresponding test goes red,
  then restore — proves the test actually exercises the real string, not
  just any error path.
- Integration smoke test actually invoked once against the real CLI before
  closing the ticket, output captured in the outcome doc.
- No payload-size number hardcoded anywhere — grep the diff for magic byte
  constants before closing.
