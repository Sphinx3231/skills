---
name: ticketed-change
description: Run one unit of work through a standing 9-step gated pipeline — file a ticket, move it In progress, write a plan doc, get a CTO/reviewer agent to approve the plan, implement, get it to approve the implementation, write an outcome doc, get that approved, then commit. Use for any bug fix, tech-debt item, or feature in any project unless the user explicitly says to skip the gates. Trigger on "file a ticket and...", "as always plan it and review with the CTO", "next ticket", or any non-trivial request to change code in a project that uses this pipeline.
---

# Ticketed change (the standing gated pipeline)

The user has stated this sequence enough times that it is the default across
all their projects, not just one codebase. Do not ask them to restate it. Do
not skip a gate because the change looks small — the gates exist because small
changes are where unverified claims survive.

This skill is project-agnostic. The *shape* of the pipeline (ticket → plan →
review → build → review → outcome → review → commit) is fixed; the *specifics*
(where tickets live, where docs live, what "CTO" means, whether migrations
exist) are discovered per-project, first from that project's CLAUDE.md /
AGENTS.md, then by asking the user if it's genuinely undocumented. Don't
assume Clique's conventions apply elsewhere — a new project may use GitHub
Issues instead of a Project board, a `docs/` folder instead of a submodule, or
no `cto` agent at all.

## The nine steps

1. **File a ticket** in whatever tracker the project uses (GitHub Issues/
   Projects, Linear, etc. — check the project's CLAUDE.md/AGENTS.md for
   "issue tracker" / "board" conventions; ask once if none is documented, then
   remember the answer for that project). If the project keeps a docs repo/
   submodule separate from the code repo, tickets go there, not in the code
   repo — again, check docs before assuming.
2. **Move it to `In progress`** before any code is written.
3. **Write a plan document** — a real file, not chat output.
4. **Reviewer agent reviews the plan.** Use the project's designated
   reviewer/tech-lead/CTO-style agent if one exists (check available agent
   types); otherwise ask the user who/what should review. Address every
   finding; re-review until approved.
5. **Implement**, only after plan approval.
6. **Reviewer agent reviews the implementation** (diff + tests). Loop until
   approved.
7. **Write an outcome document.**
8. **Reviewer agent reviews the outcome document.** Loop until approved.
9. **Commit.** Then move the ticket to `In review`.

`Done` is the user's call, never yours.

## Hard gates (these are what the user actually checks)

- **Explicit green light to start.** Filing the ticket and writing the plan is
  fine unprompted; *building* is not. Wait for the word.
- **Explicit green light to commit.** Never `git add`/`git commit` until told.
  A one-off "just commit it" is scoped to that task and does not generalise.
- **Stage only this task's files.** Never `git add -A` — the working tree
  routinely holds the user's unrelated WIP. A reviewer calling that WIP "scope
  creep" is a false positive; leave it alone.
- **Respect each project's untracked/ignored conventions** (e.g. a
  `temp_docs/`-style scratch folder, `.env` files) — check `.gitignore` rather
  than assuming Clique's specific paths apply.
- **Step-by-step gating on multi-step work**: build a todo list, do one step,
  stop for a green light before the next.

## Where documents live

- Plans and outcomes go wherever the project documents this kind of thing —
  look for a `docs/` directory, a docs submodule, or a `specs/<id>/` Spec Kit
  layout, and follow its existing structure/naming. If nothing exists yet,
  ask the user where they want plans/outcomes to live for this project, then
  treat that as the convention going forward.
- Plans are **files, not chat messages**. The user has said so repeatedly.
- If docs live in a separate repo/submodule from the code, that's a second,
  independent commit — don't conflate the two.

## Invoking the reviewer

Use the `Agent` tool with whatever reviewer-type agent the project defines
(e.g. `subagent_type: "cto"` on Clique; another project may have a different
name or none, in which case ask the user how they want review handled). Give
it the plan/diff/outcome path, the ticket, and the acceptance criteria. Ask
for blocking vs non-blocking findings.

**Reviewers are a source of defects too.** Verify each blocking finding
against the code before acting on it. If a finding is wrong, say so with the
evidence and do not write a fabricated defect into the permanent record — a
plausible story plus a "blocking" label plus a diff already written is
exactly how a fiction gets committed. If the finding is right, reproduce the
failure independently before fixing it.

## Verification discipline

- **A green test is evidence of nothing until something has made it red.**
  Mutate the code, watch the test fail, restore. Record the mutation gates in
  the outcome doc.
- **Run the full suite, not just the targeted one** — targeted runs can hide
  regressions in sibling test/mock sets. Use the project's full-suite command
  (e.g. `npx jest`, `pytest`, `go test ./...`) whenever a shared primitive is
  touched.
- **Re-run after the last edit.** A change made after the last green run is
  unverified, including a docstring-only one.
- **Never write a measurement you have not taken.** No "final: N passed"
  before the run finishes.
- **Know the project's concurrency/infra quirks before you hit them** — e.g.
  some backends can't run concurrent DB-touching tests without contending on
  a shared instance and will look like a hang. If a project's CLAUDE.md notes
  a quirk like this, honor it; otherwise treat unexplained hangs as suspect
  rather than assuming it's fine to parallelize.
- If infrastructure blocks a run (service down, network, missing dep):
  **stop and ask the user**. Never fabricate, never silently
  `npm install`/`pip install` around it.

## Migrations (when the project has a database)

Only applies to projects with a migration system. Confirm the project's own
convention rather than assuming one:

- A new migration file needs to be registered wherever that project's
  migration runner expects it (check for a manifest/registry file — Clique
  used `scripts/apply_migrations.py`'s `MIGRATION_FILES`), and check whether
  any test asserts on that list's last element (an assertion like that
  self-expires and needs updating).
- Some projects gate local migration apply behind the user running it
  themselves — ask before applying rather than assuming it's safe.
- Prefer the project's own migration tool over talking to the database
  directly (e.g. `psql`), if one exists.
- For SQL databases with named constraints, give every CHECK/UNIQUE
  constraint an explicit name, and use an existence-guard for
  add-if-not-exists semantics if the database lacks that syntax natively
  (e.g. Postgres has no `ADD CONSTRAINT IF NOT EXISTS` — wrap in a
  `DO $$ ... pg_constraint` check).

## Claims

A completeness claim is only as wide as the search that produced it, so
**state the search space inside the claim** (this is Clique's engineering
rule #9; apply the same discipline everywhere even if a project doesn't
number its rules). When a search comes back thin, vary the axis before
concluding absence — then verify each hit before acting on it.

## Closing

Report actual pass/fail numbers. Name anything left out and why. Flag
deploy-time carryovers (unapplied remote migrations, features shipping ON
with no kill switch) in the outcome doc *and* in the closing message.
</content>
