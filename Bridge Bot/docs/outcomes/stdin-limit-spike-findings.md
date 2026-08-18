# Findings: Gemini CLI stdin-limit spike (Ticket 001)

## Environment

- `gemini --version`: `0.54.4`
- Auth: `gemini-api-key` (via `GEMINI_API_KEY` env var, Google AI Studio key).
  Originally blocked entirely under `oauth-personal` (free-tier "Gemini Code
  Assist for individuals") — see "Auth blocker" below.
- Model: default (no `-m` override used).
- Platform: Windows 10, invoked via `spawn(command, [], { shell: true, windowsHide: true })`
  with the full command manually quoted (see "Windows invocation gotchas").

## Headline result: the real ceiling hit was API quota, not stdin transport

The size ladder (10KB → 100KB → 1MB → 5MB → 20MB → 50MB) stopped at **1MB**,
but the failure was **not** evidence of a stdin/transport payload limit. The
CLI's own stderr for the 1MB attempt says explicitly:

```
Attempt 1 failed: You exceeded your current quota, please check your plan
and billing details. For more information on this error, head to:
https://ai.google.dev/gemini-api/doc
```

This attempt then ran for the full 120s timeout and was killed by our
`taskkill` teardown — the CLI appears to have its own internal retry loop on
quota errors that outlasted our external timeout window. So this result is
really two findings, not one:

1. **10KB and 100KB payloads succeeded** (latency ~50-51s each — slow, but
   that's this account's free-tier API latency, not a transport issue).
2. **The free-tier `gemini-api-key` quota was exhausted after ~2 real calls**,
   at which point every subsequent call (including the 1MB one) fails with
   `"You exceeded your current quota"` regardless of payload size.

**We do not have a confirmed real max-stdin-payload figure.** The ladder
never got a clean, quota-independent failure at any size — it went straight
from "succeeds" to "blocked by quota." Re-running this spike on a paid-tier
API key (or with a longer cooldown between calls to let free-tier quota
reset) is needed to actually find a transport-level ceiling, if one exists
below what a paid tier would allow. Recommend ticket 002 treat "true stdin
payload ceiling" as **still unknown**, and design defensively (chunking /
streaming rather than assuming any specific MB figure is safe) rather than
hardcoding a number from this spike.

## Confirmed CLI flags (from real `gemini --help` output)

Non-interactive/headless invocation:
- `-p, --prompt <string>` — "Run in non-interactive (headless) mode with the
  given prompt. **Appended to input on stdin (if any).**" This is the
  correct headless entrypoint — the prompt is a flag value, not a
  purely-stdin-only interface. Content piped via stdin is combined with the
  `-p` prompt text, not replaced by it.
- `-o, --output-format <text|json|stream-json>` — output format control;
  spike used `text`.
- `-m, --model <string>` — model override (not used in this spike; default
  model was used throughout).
- `--include-directories <dir,...>` — the real flag for codebase/directory
  context ingestion (comma-separated or repeated flag). This is what
  ticket 002's "codebase mode" should use instead of manually reading and
  concatenating files.
- `--approval-mode <default|auto_edit|yolo|plan>` and `-y/--yolo` — relevant
  if ticket 002 ever needs the CLI to take non-read-only actions; for a pure
  ingestion/query bridge, these should stay at the safe default.

No flag names were assumed — every name above was read directly from
`gemini --help` output captured during this ticket.

## Rate-limit / transient-error pattern (confirmed, verbatim)

```
You exceeded your current quota, please check your plan and billing details.
```

This is the real, observed text to match on for ticket 002's retry/backoff
layer — matching against the invented placeholder pattern from the original
spec (`/429|rate.?limit|RESOURCE_EXHAUSTED|ECONNRESET/i`) would have **missed
this exact real-world case**, since the message contains none of those
substrings. Recommend the retry matcher include (case-insensitive):
`/exceeded your current quota|rate.?limit|429|RESOURCE_EXHAUSTED|ECONNRESET/i`.

Also notable: the CLI appears to retry internally on quota errors before
giving up, which took long enough to collide with our 120s external timeout.
Ticket 002 should decide whether to rely on the CLI's own internal retry
(simpler) or disable/out-time it and own retry/backoff entirely (more
control, but needs to find if the CLI has a flag to disable its own retries
— not discovered in this spike; check `gemini --help` subcommands or docs
if this matters for ticket 002).

## Auth blocker (found before any payload testing could start)

The account's original auth (`oauth-personal`, the free "Gemini Code Assist
for individuals" tier) is **no longer supported at all** by Google — every
invocation failed immediately with:

```
IneligibleTierError: This client is no longer supported for Gemini Code
Assist for individuals. To continue using Gemini, please migrate to the
Antigravity suite of products: https://antigravity.google
```

Resolved by switching `~/.gemini/settings.json`'s `security.auth.selectedType`
to `"gemini-api-key"` and setting a `GEMINI_API_KEY` env var (Google AI
Studio key). This is a hard prerequisite for the bridge bot to function at
all on this machine and should be documented as a setup step, not an
implementation detail — if this key/auth ever needs rotating, the same
settings.json edit will be needed again.

## Windows invocation gotchas (found empirically, not in any doc)

1. **`gemini` resolves to a `.cmd` shim** (npm global install on Windows),
   so `child_process.spawn` requires `shell: true` to invoke it at all
   (direct `.cmd` exec without a shell has been blocked in Node since the
   CVE-2024-27980 fix).
2. **`shell: true` does not escape an args array for you.** Passing
   `spawn('gemini', ['-p', 'multi word prompt'], { shell: true })` silently
   space-splits the prompt into separate shell words — this produced a real
   failure in this spike (`"Cannot use both a positional prompt and the
   --prompt (-p) flag together"`) before it was fixed by manually quoting
   each argument and passing the whole thing as one command string. Ticket
   002 must build its command string with explicit quoting, not rely on
   spawn's args array under `shell: true`.
3. **`taskkill /pid <pid> /t /f` is required for teardown**, not plain
   `child.kill()` — `shell: true` spawns a `cmd.exe` wrapper, so a bare
   `.kill()` only kills the wrapper, not the actual `gemini` process
   underneath. Confirmed working via a `killTree()` helper in the spike
   script.

## What ticket 002 should NOT assume from this spike

- **No confirmed max-payload figure** — see "Headline result" above. Do not
  hardcode e.g. "5MB limit" anywhere; the real ceiling is unknown and may be
  quota-bound rather than transport-bound.
- Do not assume the CLI is a pure-stdin interface — `-p` carries the actual
  instruction/prompt text, with stdin content appended to it.
