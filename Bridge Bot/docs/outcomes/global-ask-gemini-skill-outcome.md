# Outcome: Ticket 004 — global `ask-gemini` Skill

## What was built

- `~/.claude/skills/ask-gemini/SKILL.md` (global, outside this repo) —
  documents driving `src/cli.ts` for chat/codebase/document modes, with
  the redesigned API-key-override safety rule (see below). No changes to
  any file inside this repo.

## Round-1 review finding, redesigned before implementation

The original plan had Claude set an override key inline on the Bash
command invoking `cli.ts` (`GEMINI_API_KEY=<key> npx tsx ...`). Review
correctly identified this as unsafe on two independent grounds: the Bash
tool invocation is itself a visible transcript surface distinct from
Claude's response text (recreating this project's earlier plaintext-key-
in-chat incident, just moved to a different visible channel), and it would
by default persist to shell history files, violating the ticket's own
"never written to any file" requirement. A third finding caught that the
plan's own verification step (deliberately triggering an auth error to
confirm an override took effect) risked leaking the key via `cli.ts`'s
verbatim `stderr` printing on failure.

**Fixed by removing the root cause, not patching around it**: Claude never
accepts, types, echoes, or handles a raw key value anywhere in this
skill's design. A one-off override is set persistently by the user in
their own environment (`setx`, not a transient session export — the
skill explicitly explains why a transient export wouldn't be inherited by
Claude's separately-spawned shell process, a correctness note the round-2
reviewer added), and Claude simply runs `cli.ts` normally, relying on
whatever's already in the ambient environment. There is no key-handling
code path left to secure.

## Round-1 and round-2 implementation review findings, fixed

**Round 1** caught a technical-accuracy defect: the safety-rule text
claimed a persistent (`setx`) env var change is "guaranteed to be picked
up by a freshly spawned process." False when Claude Code's own Bash-tool
shell was already running before `setx` — a persistent change only takes
effect for processes started *after* it. First fix attempt: instruct the
user to "restart the Claude Code session."

**Round 2** found that first fix was still insufficiently precise: a
Claude Code process relaunched *inside the same already-open terminal
window* can still inherit that terminal's stale cached environment
(Windows processes inherit their immediate parent's environment block,
not a live registry read), so "restart the session" alone doesn't
reliably work either — same silent-failure symptom, one layer deeper.
Both rounds matter for the same underlying reason: an inaccurate "this
should work" claim in the safe path's own instructions is exactly what
could push a confused user back toward the rejected unsafe inline-key
workaround. Fixed by tightening the instruction to the only reliably
correct one: close every terminal/window entirely and open a genuinely
new one (or sign out/in) before starting a new Claude Code session — not
merely exiting and relaunching inside the same window — with an explicit
reiteration to never fall back to inlining the key regardless.

## Verification performed

- `SKILL.md`'s documented flags (`--mode`, `--dir`, `--file`,
  `--timeout-ms`, `--model`) cross-checked against the real `src/cli.ts`
  at write time.
- **Real invocation via Bash**, matching the skill's documented command
  exactly: `npx tsx ".../src/cli.ts" --mode chat "Reply with exactly:
  SKILL-CLI-OK"` → returned `SKILL-CLI-OK` for real.
- **Real invocation via the actual `Skill` tool** (not simulated) — the
  skill became visible in this session's tool list immediately after the
  file was written (no restart needed, unlike the MCP registration in
  ticket 003), was invoked with `args: "chat mode: Reply with exactly:
  SKILL-TOOL-OK"`, its instructions loaded correctly, and following them
  (no override mentioned → ran the plain invocation) produced
  `SKILL-TOOL-OK` for real. This is the acceptance criteria's mandated
  "real manual invocation" and was performed through the actual mechanism
  end-users will use, not a proxy for it.
- Did **not** perform the deliberate-auth-error verification originally
  planned — correctly dropped per the round-1 finding, since there is no
  override plumbing left that needs that kind of test.
- `~/.claude/skills/ask-gemini/` confirmed discoverable alongside the
  workspace's other skills.

## Deploy-time / environment carryovers

- New global skill file at `~/.claude/skills/ask-gemini/SKILL.md` —
  available to every Claude Code session on this machine, not scoped to
  Bridge Bot or the Claude monorepo.
- No code changes anywhere in the Bridge Bot repo.

## Scope check against ticket 004 acceptance criteria

- ✅ Skill file exists at the correct global path, frontmatter/style
  matches existing skills' conventions (verified against `gated-build`'s
  frontmatter shape during plan review).
- ✅ Instructions reflect `cli.ts`'s actual current flags, verified by
  reading the file directly, not assumed from memory.
- ✅ The override safety rule is explicit and unambiguous — and, after the
  redesign, structurally impossible to violate rather than merely
  instructed against, since Claude has no code path in this skill that
  handles a raw key value at all.
- ✅ Real manual invocation via the `Skill` tool (both with and without
  attempting an override — no override was tested since the redesign
  removed that as something Claude does at all) demonstrates the skill
  correctly drives `cli.ts` and returns a real Gemini response.
