# FoxBite — Claude Code skill bundle

## Install

Unzip at the FoxBite repo root:

```bash
unzip foxbite-claude-skills.zip -d .
```

That produces `.claude/skills/` — rename `skills/` to `.claude/skills/` if your
unzip tool doesn't preserve the dot:

```bash
mkdir -p .claude && mv skills .claude/skills
```

Restart the Claude Code session. Confirm with `/plugin` → Installed.

Project scope on purpose. These encode FoxBite conventions and should travel
with the repo in version control, not follow you into unrelated work.

## What's in here

| Skill | Source | Status |
|---|---|---|
| `frontend-design` | Anthropic official | Complete, unmodified |
| `skill-creator` | Anthropic official | Complete, `eval-viewer/` stripped (~180KB of tooling you won't use) |
| `foxbite` | Written for you | **Scaffold — needs filling in** |

Both official skills include their `LICENSE.txt`. Left intact.

## What is NOT in here, and why

**`pr-review-toolkit` and `commit-commands`** — these are marketplace *plugins*,
not loose skill folders. They don't install from a zip. Run this in Claude Code:

```
/plugin marketplace add anthropics/claude-code
/plugin
```

Then pick them from the Discover tab at Project scope.

**Everything else from that top-50 list** — see the audit artifact. Short
version: no documents in this project, palette already settled, no web surface,
and four of the Tier 1 entries couldn't be verified to exist.

## The one that needs your input

`skills/foxbite/SKILL.md` is a scaffold with TODO markers. It is the highest-value
item in this bundle and currently the least useful, because the knowledge it needs
lives only in your head and your repo.

Fill it by opening the relevant files and pasting real values — the token file,
the mood thresholds, the vision prompt, the streak logic. Descriptions of the
rules are worth much less than the rules themselves.

Once filled, it stops Claude Code re-reading source files every session to
rediscover conventions you already decided.
