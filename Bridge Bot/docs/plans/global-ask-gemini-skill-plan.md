# Plan: Ticket 004 — global `ask-gemini` Skill

## Approach

Write one new file, `~/.claude/skills/ask-gemini/SKILL.md`, outside this
repo (global skills directory) — no code in this repo changes. `cli.ts`'s
real flags (confirmed by reading `src/cli.ts`) are: `--mode
<chat|codebase|document>`, `--dir <path>` (repeatable), `--file <path>`,
`--timeout-ms <n>`, `--model <name>`, plus a trailing free-text prompt.
No code anywhere in `src/` explicitly reads `GEMINI_API_KEY` — `gemini`
picks it up via `child_process`'s default full-environment inheritance,
since `spawnGemini.ts` calls `crossSpawn(command, args, { windowsHide:
true })` with no `env` override, so whatever is in the invoking process's
environment passes through implicitly to the spawned `gemini` process.

**Round-1 review finding, redesigned before implementation:** the
original version of this plan had Claude set an override key inline on
the Bash command itself (`GEMINI_API_KEY=<key> npx tsx ...`). The reviewer
correctly identified this as unsafe — it puts the raw key into the Bash
tool invocation, which is a fully user-visible transcript surface
independent of Claude's response text (recreating the same exposure class
as this project's earlier plaintext-key-in-chat incident), and by default
gets written to shell history files (`~/.bash_history`, PSReadLine
history), directly violating the ticket's "never written to any file"
requirement. **Fixed by removing Claude's handling of the literal key
value entirely**: the skill never accepts, types, or passes a raw key
string anywhere. If the user wants a one-off override, they set it
themselves in their own terminal (outside any Claude tool call) before
asking Claude to invoke the skill — Claude just runs `cli.ts` normally,
relying on whatever `GEMINI_API_KEY` is already present in its own
process environment at invocation time. Claude never sees, types, echoes,
or logs the value at any point.

## `SKILL.md` frontmatter

Match the style of existing skills' `description` fields (a trigger-phrase
list plus a one-line summary, per `gated-build`/`ticketed-change`):

```yaml
---
name: ask-gemini
description: Delegate a prompt, codebase directory, or large document to
  the local Gemini CLI via Bridge Bot's cli.ts, for large-context work the
  MCP ask_gemini tool doesn't cover (e.g. a one-off different API key).
  Trigger on "ask gemini", "delegate to gemini", "use bridge bot", or when
  the user explicitly wants the CLI path instead of the ask_gemini MCP
  tool.
---
```

## Body content

1. **When to use this vs. the MCP tool**: the `ask_gemini` MCP tool
   (ticket 003, global, `GEMINI_API_KEY` from the persistent environment)
   is the default/preferred path for routine use. This skill is the
   explicit/manual alternative — use it when the user asks for the CLI
   path specifically, or needs a one-off different API key without
   touching the MCP server's persistent environment.
2. **Invocation**: `npx tsx "<Bridge Bot repo path>/src/cli.ts" --mode
   <chat|codebase|document> [--dir <path>]... [--file <path>]
   [--timeout-ms <n>] [--model <name>] "<prompt>"`, run via the Bash tool
   from any directory (absolute path to `cli.ts`, no cwd dependency).
3. **Optional API key override — safety rule (verbatim, non-negotiable)**:
   - Claude must **never** accept, type, echo, or pass a raw API key
     value anywhere — not in a Bash command, not in its own response
     text, not in any file. This is a hard rule, not a best-effort one:
     the earlier design (setting the key inline on the Bash command that
     invokes `cli.ts`) was reviewed and rejected specifically because the
     Bash tool invocation is itself a visible transcript surface and by
     default persists to shell history files — functionally the same
     exposure as pasting a key into chat.
   - If the user wants a one-off different key for this call, the skill
     instructs Claude to tell the user: *"Set `GEMINI_API_KEY` to the
     override value yourself in your own terminal (outside this
     conversation), then let me know it's set — I'll run the command
     without touching the key value."* Claude then simply invokes `cli.ts`
     normally; whatever is in the ambient environment at that point
     (override or the existing persistent default) is what `gemini` picks
     up via normal environment inheritance — Claude never sees or handles
     the literal value either way.
   - If no override is mentioned, do nothing key-related — the already-
     configured persistent `GEMINI_API_KEY` (set during tickets 001-003)
     already covers it.
4. **Examples**: one example per mode (chat, codebase with `--dir`,
   document with `--file`), plus one example showing the optional-override
   form.

## Verification

- Read `src/cli.ts` one more time at write-time to confirm flags didn't
  drift since this plan was drafted (cheap, avoids stale-flag drift).
- Real manual invocation via the `Skill` tool using the already-configured
  persistent `GEMINI_API_KEY` (no override path to test, since Claude
  never handles a literal key value at all now — there's nothing left to
  verify about override plumbing beyond "the skill correctly tells the
  user to set it themselves and then proceeds normally," which is a
  read-the-instructions check, not a code path to exercise).
- **Do not** deliberately trigger an auth-error path as a verification
  step — the round-1 review correctly flagged that `cli.ts` prints
  `result.stderr` verbatim on failure (`src/cli.ts:65`), and some CLIs
  echo the attempted credential in their own auth-error output, which
  would leak into the Bash tool's visible output. Since the redesigned
  approach removes Claude's key-handling entirely, this risk no longer
  applies, but the instruction not to intentionally provoke auth errors
  for testing purposes is kept as an explicit note for future maintainers
  of this skill.
- Confirm via `ls ~/.claude/skills/` that the skill is discoverable
  alongside the existing skills.

## Critical files

- `~/.claude/skills/ask-gemini/SKILL.md` (new, outside this repo)
- `src/cli.ts` (read-only reference, confirms real flags)
