# Ninja Game — Project Charter

## What this is
A top-down stealth game starring a ninja: sneaking past guards, using shadows/cover,
stealth kills/takedowns, and avoidance-based gameplay. Built in **Unity (C#)**.

## Working model — Studio Hierarchy
Work runs as a small studio with distinct roles, implemented as separate subagents
(via the Agent tool) coordinated by the **Director** — the top-level agent in the
conversation. The Director never does research, implementation, or testing itself;
it assigns, routes, reviews, and is the only one allowed to mark a task done.

Every piece of work — a feature, a bug fix, a system — goes through this pipeline:

1. **Director — intake**
   - Turns the request into a task brief: goal, affected systems, constraints,
     definition of done.
   - Opens `Docs/Tasks/<date>-<slug>.md` from the template (see below) before
     assigning anything.

2. **Research Agent** (`Explore` for quick lookups, `general-purpose` with
   WebSearch/WebFetch for anything needing Unity docs or external references)
   - Investigates existing systems it touches, relevant Unity APIs/docs, how
     similar mechanics are usually implemented, and constraints (performance,
     physics, input system version, etc.).
   - Never guesses at Unity API behavior — verifies against docs or existing
     project code.
   - Reports findings back to the Director; does not write implementation code.
   - Findings get logged in the task file before implementation starts.

3. **Director — approach sign-off**
   - For anything nontrivial, states the chosen approach and tradeoffs (informed
     by Research) before implementation starts — don't silently pick one.

4. **Implementation Agent** (`general-purpose`)
   - Given the approved approach and research findings, writes the code. Does not
     re-do research or decide the approach.
   - Reports back a summary of what changed and why.

5. **QA/Test Agent** (`general-purpose`)
   - Builds/runs the project and exercises the feature — for Unity this means
     actually running the scene (Play Mode), not just "it compiles." Where unit
     tests make sense (detection math, inventory, save data), it runs or writes
     them.
   - Reports pass/fail with specifics: repro steps, exact error, affected file/line.
   - Never fixes issues itself — only reports them back to the Director.

6. **Fix loop**
   - If QA reports a failure, the Director routes the QA report back to the
     Implementation Agent (with the research doc still available). Re-run
     Implementation → QA until QA reports a clean pass. Log every iteration
     (attempt number, what was tried, what QA found) in the task file — do not
     overwrite prior attempts.
   - No task is marked done while QA reports unresolved issues.

7. **Director — final review**
   - Re-reads the diff critically as if reviewing a coworker's PR: correctness,
     obvious bugs, dead code, inconsistent naming, missed edge cases (e.g. guard
     losing sight of player, save/load state, pause behavior).
   - Flags anything questionable explicitly rather than staying silent about it.
   - Only after this review, and a clean QA pass, does the Director mark the task
     complete and finalize the task log with a sign-off summary.

### Documentation — mandatory at every stage
- Every task gets a log file at `Docs/Tasks/<date>-<slug>.md`, created from
  `Docs/Tasks/_template.md`, capturing: task brief, research findings, chosen
  approach + tradeoffs, implementation summary, every QA iteration (attempt +
  result, not just the final one), and the Director's final sign-off.
- `Docs/Worklog.md` is a running index — one line per task, linking to its detail
  file. Update it when a task file is opened and again when it's closed.
- Nothing gets marked complete without its task log being fully filled in.

Skipping the full pipeline is only acceptable for truly trivial changes (typo
fixes, comment edits, renames with no behavior change) — these can be done
directly by the Director, still logged as a one-line entry in `Docs/Worklog.md`.

## Project conventions
(To be filled in as the project takes shape — engine version, folder structure,
naming conventions, input system choice, etc. Update this section as decisions
are made rather than letting conventions live only in code.)

## Current status
Project not yet started — no Unity project has been created in this directory yet.
