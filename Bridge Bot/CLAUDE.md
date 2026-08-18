# Bridge Bot — Claude-to-Gemini CLI Bridge

A local Node/TS tool that lets Claude delegate large-context work (whole
codebase ingestion, big document dumps) to Google's Gemini CLI by spawning
`gemini` as a child process, piping input via stdin, and capturing stdout.
See `claude_gemini_bridge_bot_spec.md` for the original mission brief.

## Project conventions

This project lives inside the shared `Claude` monorepo (sibling to
`first game test 4` / FoxBite, `claude-skills`, `Claude Agents`) but keeps
its own independent doc/ticket numbering, starting at 001.

- **Tickets**: `docs/tickets/NNN-slug.md`
- **Plans**: `docs/plans/slug-plan.md`
- **Outcomes**: `docs/outcomes/slug-outcome.md` (+ `slug-verdict.md` from
  the reviewer)
- **Spikes**: `spikes/` — throwaway benchmarking scripts, findings written
  up under `docs/outcomes/`

All work goes through the standing ticketed-change pipeline: file ticket →
plan → reviewer approval → implement → reviewer approval → outcome doc →
reviewer approval → commit. This project has no dedicated reviewer agent of
its own — the `cto` / `tech-lead` agent types (originally written for a
different project, Clique) are reused as generic senior-engineer reviewers;
ignore any Clique-specific framing in their output.

## Environment facts

- Gemini CLI is installed globally on this machine: `@google/gemini-cli`,
  on PATH as `gemini` / `gemini.cmd` (Windows).
- Do not assume Gemini CLI flag names — verify against `gemini --help`
  empirically (see ticket 001's spike findings once written).
