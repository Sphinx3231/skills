# Outcome: Ticket 001 — Gemini CLI stdin-limit spike

## What was built

- Project scaffold: `CLAUDE.md`, `docs/{tickets,plans,outcomes}/`,
  `package.json` (minimal, `tsx`+`typescript` devDeps only).
- `spikes/stdin-limit-spike.ts` — spawns the real installed `gemini` CLI via
  `child_process.spawn(command, [], { shell: true, windowsHide: true })`
  with a manually-quoted command string, pipes synthetic payloads to stdin
  with backpressure-aware chunked writes, enforces a 120s per-attempt
  timeout with `taskkill /t /f` teardown, retries once on failure before
  recording a size as a ceiling, and runs an auth/quota precheck before the
  size ladder.
- `docs/outcomes/stdin-limit-spike-findings.md` — the ticket's actual
  deliverable: real confirmed CLI flags, the real (quota-related, not
  transport-related) rate-limit error text, Windows spawn/quoting/teardown
  gotchas found the hard way, and an explicit statement that no confirmed
  max-payload figure was established.

## What was verified

- The script was run against the **real installed Gemini CLI**, not mocked
  — this is the whole point of a spike (getting ground truth, not simulated
  behavior). Results: `10KB` and `100KB` payloads succeeded end-to-end
  (latency ~50-51s each); `1MB` failed due to API quota exhaustion (not a
  transport limit) and was correctly caught by the 120s timeout + teardown
  path, which fired and killed the process tree as designed.
- The Windows `shell:true` quoting bug (unquoted multi-word `-p` argument
  silently space-splitting into separate shell words, causing "Cannot use
  both a positional prompt and the --prompt (-p) flag together") was
  **caught by running the script**, not by inspection — first run failed
  with exactly that error, confirming the bug was real and not theoretical.
  Fixed by building a single manually-quoted command string; re-run
  succeeded.
- No unit tests / mutation-testing gate applies here: this is a throwaway
  benchmarking script with no business logic worth mutation-testing (no
  branching correctness logic beyond retry-once/timeout, both of which were
  exercised for real by the live 1MB attempt hitting quota and timing out).
  The strongest verification available for a spike is that it ran against
  the real target and produced results consistent with what actually
  happened — which it did.

## Deploy-time / environment carryovers (flagging per process)

- **`GEMINI_API_KEY` was set as a persistent Windows User environment
  variable** on this machine (via `SetEnvironmentVariable(..., 'User')`),
  and `~/.gemini/settings.json`'s `security.auth.selectedType` was changed
  from `"oauth-personal"` to `"gemini-api-key"`. This is a real, persistent
  system-level change outside the repo — anyone else using this machine's
  `gemini` CLI will now use API-key auth, not OAuth.
- **The API key value was pasted into chat** by the user (despite an
  earlier stated preference not to) — it should be treated as exposed and
  ideally rotated in Google AI Studio once testing is done.
- The original `oauth-personal` auth tier is **dead entirely** (Google
  discontinued free-tier Code Assist for individuals via CLI, redirecting
  to "Antigravity"), not just broken on this machine — this is an external
  fact ticket 002 (and any future re-run of this spike) needs to account
  for, not something a code fix can work around.
- **No confirmed max-payload figure** — ticket 002 must not hardcode a
  size limit from this spike. The 1MB "failure" was quota exhaustion after
  ~2 real calls on a free-tier key, not a discovered transport ceiling.
  Getting a real number requires re-running with a paid-tier key or with
  deliberate cooldown between attempts.

## Scope check against ticket 001 acceptance criteria

- ✅ `spikes/stdin-limit-spike.ts` runs against the real CLI and produces
  recorded success/fail/latency/error results per size.
- ✅ `docs/outcomes/stdin-limit-spike-findings.md` exists, states real
  verified flags sourced from actual `gemini --help` output, and is honest
  that no max-payload figure was confirmed (rather than fabricating one to
  satisfy the letter of the original ticket wording).
- ✅ Project scaffold exists per this project's `CLAUDE.md` conventions.
- No production `askGemini()` API, retry/backoff module, or CLI wrapper was
  built — correctly deferred to ticket 002.
