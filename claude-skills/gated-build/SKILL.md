---
name: gated-build
description: Execute an implementation plan/tasks through a model-tiered gated build — Sonnet implements, Sonnet QA verifies, an Opus tech-lead reviews the code AND the outcome document, then an Opus (or Fable, if available) CTO reviews everything and authors a comprehensive verdict document with the merge decision. Runs on an isolated branch/worktree so main is never touched; review loops are capped. Use to run a Spec Kit (specs/<id>/tasks.md) plan, or any implementation task, when the user wants tiered-model review gates before merge. Trigger on "gated build", "run the gated workflow", "implement with the tech-lead/CTO gates", or after /speckit-tasks when the chosen executor is the gated build.
---

# Gated Build (model-tiered review workflow)

A reusable implementation workflow with a strict model→role mapping. The user
established this mapping and it is the point of the skill — **do not deviate**.

## Model → role mapping (MANDATORY)

| Role | Agent type | Model | Responsibility |
|------|-----------|-------|----------------|
| Implementer | `fullstack-engineer` | **Sonnet** | Writes all code + regression tests + the outcome document. NEVER Opus. |
| QA | `qa-tester` | **Sonnet** | Runs suites, verifies acceptance/success criteria, files reproducible bugs. |
| Tech-lead reviewer | `tech-lead` | **Opus** | Reviews the code diff **and** the outcome document rigorously; blocking + non-blocking findings. |
| CTO | `cto` | **Fable** if the plan tier has it, else **Opus** | After tech-lead approval, reviews EVERYTHING (code, tests, outcome doc, constitution compliance) and authors a comprehensive **verdict document**, then gives the merge decision. |

Hard rule: **the implementer is Sonnet, never Opus.** The tech-lead is Opus. The CTO is
Fable when available (a Claude Max/Fable-enabled account); on plans without Fable access
(e.g. Pro), fall back to **Opus** for the CTO role too. This collapses the review chain
from three distinct models to two (Sonnet build/QA, Opus for both review stages) — still
worth running, since the CTO stage is a separately-scoped pass (full verdict doc against
the constitution, not just a diff review), but note the loss of a truly independent
third opinion when reporting the verdict. Don't downgrade the CTO to Sonnet to "restore"
three tiers — Sonnet is already the implementer/QA model, so using it for the final
review removes the separation-of-duties this skill exists for. The orchestrator (main
loop) may be any model — it only coordinates; it must still pin these per-agent
overrides.

## Sequence

1. **Isolation** — create a feature branch from the current local `HEAD` (NOT
   origin/main, which may be behind on repos with unpushed local commits). A git
   worktree is acceptable only if it branches from `HEAD` and has the toolchain deps
   available; otherwise a branch in the existing working tree is more reliable for
   monorepos with hoisted `node_modules` / a shared venv. Main is never touched.
2. **Build** — `fullstack-engineer` @ **Sonnet** implements the plan/tasks: tests-first
   where the plan requires it, then the fixes, then writes an **outcome document**
   (`docs/tasks/<feature>/outcome.md` or the feature's `specs/<id>/outcome.md`)
   describing what changed, why, test results (red-before/green-after), and any
   deferred/blocked items (e.g. steps needing the user's local stack).
3. **QA** — `qa-tester` @ **Sonnet** runs the suites and verifies each acceptance /
   success criterion; returns a bug list. If bugs → implementer (Sonnet) fixes; loop
   **cap 3**.
4. **Tech-lead review** — `tech-lead` @ **Opus** reviews the code diff and the outcome
   document. Blocking findings → implementer (Sonnet) fixes → tech-lead re-review; loop
   **cap 3**. Tech-lead must explicitly approve before the CTO stage.
5. **CTO review + verdict** — `cto` @ **Fable** (or **Opus** if Fable isn't available on
   the account), only after tech-lead approval, reviews
   everything against the constitution and plan, then WRITES a comprehensive verdict
   document (`specs/<id>/verdict.md` or `docs/tasks/<feature>/verdict.md`) covering:
   scope vs plan, per-principle constitution compliance, code quality, test adequacy
   (red-before/green-after proof), risk assessment, and a clear **MERGE / NO-MERGE**
   decision with rationale. The CTO produces this document itself (Fable), not the
   orchestrator.
6. **Report** — relay the CTO verdict + merge decision to the user. Merge to main ONLY
   when the user asks (or when a full-auto policy is in effect for the session).

## Launching it (Workflow tool)

Use the `Workflow` tool. Set `opts.agentType` + `opts.model` on every `agent()` call per
the table. Null-guard every agent result (a dead agent returns null). Skeleton:

```js
export const meta = {
  name: 'gated-build',
  description: 'Model-tiered gated build: Sonnet build/QA, Opus tech-lead, Fable (or Opus) CTO verdict',
  phases: [
    { title: 'Build',   detail: 'fullstack-engineer @ sonnet', model: 'sonnet' },
    { title: 'QA',      detail: 'qa-tester @ sonnet',          model: 'sonnet' },
    { title: 'TechLead',detail: 'tech-lead @ opus',            model: 'opus'   },
    { title: 'CTO',     detail: 'cto @ fable/opus — verdict doc', model: 'fable' },
  ],
}

const FEATURE = args?.feature ?? 'specs/<id>'   // pass via Workflow args
// cto: 'fable' if the account has Fable access, else 'opus' (e.g. Pro plans)
const M = { impl: 'sonnet', qa: 'sonnet', lead: 'opus', cto: 'fable' }

phase('Build')
let build = await agent(`Implement ${FEATURE}/tasks.md ... write ${FEATURE}/outcome.md`,
  { agentType: 'fullstack-engineer', model: M.impl, phase: 'Build' })

phase('QA')
let qa = await agent(`QA ${FEATURE} against spec.md success criteria; report bugs`,
  { agentType: 'qa-tester', model: M.qa, phase: 'QA', schema: BUGS })
// fix loop (cap 3) if qa?.bugs?.length ...

phase('TechLead')
let lead = await agent(`Review the diff + ${FEATURE}/outcome.md against ${FEATURE}/plan.md
  and the constitution; blocking + non-blocking`, { agentType: 'tech-lead', model: M.lead,
  phase: 'TechLead', schema: REVIEW })
// fix loop (cap 3) until lead approves

phase('CTO')
let verdict = await agent(`Tech-lead approved. Review EVERYTHING; WRITE ${FEATURE}/verdict.md
  (comprehensive: scope, per-principle constitution compliance, quality, test adequacy,
  risk, MERGE/NO-MERGE + rationale). Return the decision.`,
  { agentType: 'cto', model: M.cto, phase: 'CTO', schema: VERDICT })

return { qa, lead, verdict }
```

Define `BUGS` / `REVIEW` / `VERDICT` JSON schemas so results are structured. Keep the
loop caps at 3. If a step needs an environment the agents can't reach (a running local
stack, real fixtures), the implementer records it as deferred in the outcome doc and the
CTO notes it in the verdict rather than blocking the whole run.

## Notes

- This skill is model-mapping + sequencing; the WHAT-to-build comes from the plan/tasks
  (Spec Kit `specs/<id>/` or an equivalent PRD).
- Constitution compliance (if `.specify/memory/constitution.md` exists) is a first-class
  gate the tech-lead and CTO must check.
- Global skill: available in every project.
