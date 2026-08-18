# Ticket 019: Engine reconciliation and native/web scan-quality parity

## Status

Not started — drafted from the CTO's round-1 architectural notes on ticket
016, not yet reviewed or scoped for build.

## Background

Across tickets 010, 011, 014, and 016, FoxBite has accumulated three
distinct food-recognition engines, each superseding the previous one for
its platform without deleting it — a deliberate, individually-reasonable
"leave it in place, uncalled" precedent each ticket set to avoid destroying
working code mid-pipeline. The cumulative result, as of ticket 016's
CTO review:

| Engine | File(s) | Platform | Called by any route/screen today? |
|---|---|---|---|
| Claude vision (multi-item, open-vocabulary) | `backend/src/lib/anthropic.js` (`analyzeFoodPhotoMultiItem`) | Backend, was native's path | **No** — superseded by ticket 016 for native; nothing calls `POST /food/analyze`'s photo-scan handler anymore |
| Local CLIP zero-shot (single-item, ~36-label vocabulary) | `backend/src/lib/local-food-analysis.js`, `app/src/lib/food-recognition-shared.ts`, `food-candidate-labels.ts` | Was backend-callable, ticket 010/011 | Backend copy: no (ticket 017 removes its dead warm-up). Web copy (`food-recognition.web.ts`) still runs in-browser via transformers.js/WASM — **yes**, this one is live, on web only |
| On-device MobileNet classifier (single-item, 2,023-class closed taxonomy) | `app/src/lib/food-recognition.ts`, `food-classifier-shared.ts`, `food-classifier-labelmap.ts` | Native only | **Yes** — ticket 016, live on native |

So today: **two** engines are actually live (web CLIP, native MobileNet),
and **one** (Claude vision) is fully dead code with no caller on any
platform, plus the *backend* half of the CLIP engine is also dead once
ticket 017 removes its warm-up (the web client runs its own in-browser copy
independently — `local-food-analysis.js` was always a separate, unrelated
implementation from `food-recognition.web.ts`, not the same code path).

Separately, and independently of the dead-code question: the two engines
that ARE live give genuinely different user experiences by platform —
different models, different taxonomies (36 hand-picked candidates on web
vs. 2,023 classes on native), different confidence-threshold semantics, and
different accuracy/failure profiles (documented for native in ticket 016:
real accuracy 67-98% on correct photos, with a reproduced non-food
hallucination at 51.56% confidence; web's CLIP profile was separately
characterized in ticket 010/011's spikes). A user could reasonably notice
their photo-scan behaves differently switching between the phone app and
the web app, with no in-product explanation of why.

## Goal

Two related but separable outcomes — this ticket's plan phase should decide
whether to split them into two tickets or keep them together, since they
have different stakeholders (engineering cleanup vs. product/UX decision):

1. **Engine reconciliation**: make an explicit, documented keep/delete/freeze
   decision for each of the three engines, rather than letting "leave it,
   don't delete it" compound indefinitely across future tickets. This is
   not a default-to-delete ticket — Claude vision in particular may be worth
   keeping as a documented fallback/future option (e.g. if ticket 016's
   on-device model needs to be reconsidered) rather than deleted outright.
   The point is a *decision*, recorded somewhere durable, not a default.
2. **Platform-parity disclosure**: name the native/web scan-quality gap
   explicitly as a known, documented product characteristic — at minimum in
   project docs (this ticket's outcome doc, and/or a user-facing note if the
   product side wants one), and decide whether any in-app messaging should
   acknowledge it (e.g. does the review screen already surface enough
   context per-scan that a user isn't confused, or is an explicit "scan
   quality varies by device" note warranted somewhere).

## Scope (tentative — plan phase should firm this up)

- Audit all three engines' actual call sites (repeat the grep-based
  verification tickets 014/016's reviewers already did, to get a current,
  authoritative snapshot as of whenever this ticket is built, not relying
  on this doc's table staying accurate).
- For each engine with zero live callers, produce an explicit decision:
  keep-as-reference (status quo), formally deprecate (add a doc comment
  stating so, still no deletion), or delete (only if a strong case exists —
  deleting Claude vision would foreclose ticket 018's still-open live-
  verification work, so that dependency must be checked first).
- Decide whether native/web parity is addressed via: (a) documentation only,
  (b) an in-app UI hint, (c) a future ticket to unify the two engines (out
  of scope for this ticket to actually build — a unification project would
  be its own large ticket, likely as involved as 013/014/016 combined), or
  (d) explicitly deciding parity is acceptable as-is and closing the
  question.

## Non-goals

- Do not unify native and web onto a single engine as part of this ticket —
  that's a much larger undertaking (this session's history with tickets
  012/013 shows on-device model unification across platforms is a genuinely
  hard, previously-abandoned problem) and would need its own ticket if ever
  pursued.
- Do not delete Claude vision without first checking ticket 018's status
  (the live-verification gap ticket depends on Claude vision still existing
  and being callable, even if currently uncalled from any route).
- Do not change either live engine's actual recognition behavior — this
  ticket is about documentation/decision-recording and dead-code hygiene,
  not model quality.

## Acceptance criteria

- A durable, dated decision record exists (in this ticket's outcome doc at
  minimum) stating what happened to each of the three engines: kept,
  deprecated-in-place, or deleted, with reasoning for each.
- The native/web scan-quality gap is named explicitly in project
  documentation, with an explicit decision on whether any in-app UI changes
  follow (even if that decision is "no UI change, documentation only").
- No live engine's behavior changes as a side effect of this ticket.
- If anything is deleted, its own existing tests are removed alongside it
  (not left dangling), and the deletion is confirmed not to break any other
  ticket's stated dependencies (check ticket 018 specifically).
