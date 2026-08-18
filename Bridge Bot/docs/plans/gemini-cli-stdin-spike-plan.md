# Plan: Gemini CLI stdin limit + flag-discovery spike (Ticket 001)

## Objective

Empirically determine (a) the practical max stdin payload size the locally
installed Gemini CLI can accept in a single invocation, and (b) the real
flag names for prompt / directory-context / headless invocation, so ticket
002's implementation is built against verified facts, not assumptions.

## Approach

### 1. Project scaffold (done)
`CLAUDE.md`, `docs/tickets/`, `docs/plans/`, `docs/outcomes/`, `spikes/`
created directly under `Bridge Bot/`.

### 2. Discover real CLI surface
Run, capture, and save raw output of:
- `gemini --help`
- `gemini <likely-subcommand> --help` for any subcommand `--help` reveals
  that looks relevant to non-interactive/headless prompt execution or
  directory/file context (e.g. if help output shows something like `chat`,
  `run`, or a `-p`/`--prompt` flag — exact names TBD from real output).

No flag name is written into the findings doc unless it was seen verbatim
in `gemini --help` output.

### 3. `spikes/stdin-limit-spike.ts`
A standalone TS script (run via `tsx` or `ts-node`, no build step needed
for a throwaway spike):

- Generates synthetic text payloads at sizes: 10KB, 100KB, 1MB, 5MB, 20MB,
  50MB (stop early if a size fails — no need to test larger sizes once a
  ceiling is found).
- For each size: `child_process.spawn('gemini', [...headless-flags-from-step-2], { stdio: ['pipe','pipe','pipe'] })`,
  write payload to `child.stdin` in chunks respecting backpressure
  (`write()` return value + `'drain'` event), end stdin, collect stdout/
  stderr via `'data'` listeners into arrays (joined once at the end — avoid
  O(n²) string concatenation), and record wall-clock latency from spawn to
  `'close'`.
- **Spawn strategy (committed, not conditional):** `gemini` resolves to a
  `.cmd` shim on this Windows install (`AppData\Roaming\npm\gemini.cmd`).
  Node's `spawn` cannot exec `.cmd` files directly without `shell: true`
  (blocked since Node's CVE-2024-27980 fix), so this script always calls
  `spawn('gemini', args, { shell: true, windowsHide: true })`. Because
  `shell: true` on Windows spawns a `cmd.exe` wrapper around the real
  process, plain `child.kill()` only kills the wrapper and can leave the
  actual `gemini` process running. Teardown therefore always uses
  `taskkill /pid <child.pid> /t /f` (via a small `killTree()` helper), both
  on the 120s per-attempt timeout path and in any early-abort/cleanup path
  — never `child.kill()` alone.
- Uses whatever real prompt-input mechanism step 2 discovers — if the CLI
  expects the prompt as a positional arg / `-p` flag rather than pure
  stdin, the script adapts to that reality rather than forcing stdin-only
  transport (the spec's "stdin/stdout transport" intent is about not using
  REST, not about ignoring the CLI's actual documented interface). If a
  positional/flag argv value ends up carrying payload bytes (rather than
  pure stdin), note the ~8191-character Windows command-line length limit
  as a possible silent-truncation hazard in the findings doc.
- Before the size ladder, runs one trivial low-token invocation as an
  auth/quota precheck, so a missing API key or auth failure isn't
  misread as a payload-size ceiling.
- If a given size fails, retries once before recording it as the ceiling,
  so a transient network/rate-limit blip isn't mistaken for a true limit.
- Writes a per-size result table (size, success/fail, latency, exit code,
  stderr excerpt) to stdout as it runs, for live visibility.

### 4. Findings doc
`docs/outcomes/stdin-limit-spike-findings.md`:
- Table of tested sizes with outcomes.
- Stated max practical payload size (largest that succeeded reliably).
- Confirmed flags for: single prompt/chat invocation, directory/codebase
  context ingestion, non-interactive/headless mode.
- Any rate-limit or transient-error text actually observed (verbatim), or
  an explicit note if none was triggered during this spike (in which case
  ticket 002's retry-pattern matching will need to be designed defensively
  rather than against a confirmed sample).
- `gemini --version` and any active model-selection config, recorded
  alongside the results, since payload/latency behavior may be
  model-dependent and this context matters if numbers are ever re-verified.

## Out of scope

No `askGemini()` API, no production wrapper module, no retry/backoff logic,
no tests beyond the spike script itself running and producing output. All
of that is ticket 002.

## Verification

- The spike script actually runs against the real installed `gemini` CLI
  (not mocked) and produces recorded output for at least the smaller
  payload sizes (10KB–1MB should always succeed on any working install;
  larger sizes may legitimately fail — that's a valid finding, not a bug).
- `docs/outcomes/stdin-limit-spike-findings.md` contains only flag names
  and figures actually observed in this run, not carried over from the
  original spec doc's assumptions.
