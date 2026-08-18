# CTO Architectural Verdict: Ticket 019 — Engine reconciliation and platform-parity

**Round:** 1
**Verdict:** APPROVED

## Independent verification performed

- Read the real diff (`git diff` against `main`): only `backend/src/lib/local-food-analysis.js`
  and `backend/src/lib/local-food-recognition.js` changed, +37 lines, both pure
  doc-comment additions above existing `import` statements. No logic, exports,
  or tests touched. Matches the outcome doc's "files changed" section exactly.
- Re-ran the backend suite myself: `node --test --experimental-test-coverage
  --experimental-test-module-mocks` → **124/124 passing, 5 suites, 0 failed**,
  including `local-food-analysis.test.js` and `local-food-recognition.test.js`
  untouched and green. Matches the outcome doc's claimed numbers exactly —
  no fabricated or stale test claim.
- Verified `backend/src/index.js`'s existing ticket-017 comment (lines 51-60)
  independently — it does say what the outcome doc and the new file-level
  comments claim (warm-up removed, no route calls the local CLIP path,
  files left in place uncalled). The new per-file comments are consistent
  with, not contradictory to, this existing comment.
- Verified `backend/src/routes/food.js` directly: `POST /food/analyze` calls
  `analyzeFoodPhotoMultiItem` unconditionally (Claude vision) — confirms
  the outcome doc's claim that the route is live, wired infrastructure with
  zero client caller, not merely "dead code," and that ticket 018 genuinely
  depends on it staying callable.
- Confirmed both `food-recognition-shared.ts` (web) and
  `food-classifier-shared.ts` (native) exist as separate shared modules that
  both feed the same `log.tsx` review-items rendering — the platform-parity
  claim that both platforms get identical low-confidence/caveat treatment is
  a real code fact, not an assertion dressed up as evidence.

No test run was blocked; no infrastructure gaps encountered. All claims made
in the outcome doc checked out against the real repository state.

## 1. Does this actually resolve my own round-1 notes from ticket 016?

Yes, on both counts I raised.

- **Explicit decision record per engine**: the outcome doc's Section 3 gives
  a genuine keep/deprecate/no-decision-needed call for all three legacy-or-
  live engines, each with reasoning, not just a restated inventory. The
  "safe-to-delete condition" written into the local-CLIP files' own
  doc-comments is exactly the kind of durable, actionable criterion I was
  asking for instead of "leave it, don't delete it" compounding forever —
  a future engineer now has a concrete trigger condition to check, in the
  file itself, not buried in an outcome doc they'd have to know to go find.
- **Platform-parity gap named explicitly**: Section 4 names the gap in
  specific, falsifiable terms (model, taxonomy size, confidence semantics,
  measured accuracy range from ticket 016) rather than a vague "the two
  platforms differ somewhat." That is what I asked for.

## 2. Tech-lead's reasoning on Claude vision — no comment added

I agree with the tech-lead's conclusion, and largely for the same reason,
but I want to be precise about *why*, because "no comment" and "no action"
are not quite the same thing here and it matters for future readers.

The distinguishing fact is real: Claude vision's route is fully wired,
`requireAuth`/`requireActiveAccess`-gated, production-shaped code with a
close, live dependent (ticket 018) whose entire acceptance criteria assume
it stays callable and unmarked-as-suspect. A "DEPRECATED-IN-PLACE" comment
on `anthropic.js`/`food.js` would misrepresent its actual status — it isn't
deprecated, it's *unconsumed by any current client*, which is a materially
different, much weaker claim. Slapping deprecation language on infrastructure
that ticket 018 is explicitly waiting to exercise live would be actively
misleading to whoever picks that ticket up next, exactly the tech-lead's
point.

That said, I don't think "leave `food.js`'s existing ticket-014 comment
as sufficient" is the strongest close available, and I'd flag this as a
non-blocking improvement rather than override the decision: neither
`food.js`'s existing comment nor anything else in-source states the fact
that's actually new and useful as of *this* ticket — that this route
currently has zero client callers on any platform. That's a fact this
ticket's own audit discovered and is otherwise only recorded in an outcome
doc (matching QA's P3 finding, which I agree is real but correctly scoped
as non-blocking). A single neutral, non-deprecating sentence appended to
the existing comment — something like "as of ticket 019's audit, no client
currently calls this route; ticket 018 tracks closing that gap" — would cost
nothing, wouldn't discourage building on it, and would give the same
in-source completeness the local-CLIP files just got. I'm noting this as an
optional fast-follow, not a requirement — consistent with the tech-lead's
call that it isn't required for this ticket's closure, but I'd push back if
a future ticket lets this fact drift out of sync with `food.js` (e.g. once
ticket 018 actually adds a caller, the comment needs to be recognized as
stale, and there's currently no marker there prompting anyone to check).

## 3. Is the platform-parity "documentation-only" decision a real closure, not a deferral?

Yes — this is a genuine decision, not a status-quo restatement wearing a
decision's clothes. Three things convince me:

- It commits to a specific, checkable claim: the review screen's
  confirm-before-log discipline (universal, per-item, both platforms) is
  the mitigating control for the accuracy-gap harm, and that claim was
  verified against the actual `log.tsx` review-items code and the actual
  shared caveat/confidence strings on both platforms — not asserted from
  memory.
  Verified independently: this checks out.
- It closes the acceptance criterion explicitly permitted by the ticket
  itself — the ticket's own scope section lists "(d) explicitly deciding
  parity is acceptable as-is and closing the question" as a legitimate
  outcome, so "documentation-only, no UI change" is not a scope dodge, it's
  one of the ticket's own enumerated valid endings.
  Note: the outcome doc's Section 4 heading text is (a), and its reasoning
  is closer to the ticket's (d) framing (deciding it's acceptable, not
  merely "no action") — a naming footnote, not a substance issue.
- It's falsifiable and revisitable, not hand-waved: it names the exact
  smallest future change (a single additive `ThemedText` line, existing
  theme tokens) if product/UX later wants a disclosure, rather than leaving
  "maybe later" open-ended with no shape.

This is the correct type of "no build" decision for a documentation ticket:
it reasons from actual code (the review screen's existing safeguards), not
just from the absence of user complaints, and it draws a line under the
question rather than leaving it re-litigable next sprint without new
information.

## Scope discipline check

- No engine-unification work was done or planned as build (correctly
  respects the ticket's non-goal and the project's stated precedent that
  012/013's unification attempt was abandoned as genuinely hard).
- No behavior change to either live engine — confirmed via test run and
  diff review.
- Ticket 018's dependency was checked before any Claude-vision decision,
  as the ticket's non-goals required, and the check is substantively
  correct — verified directly against `food.js`.
- No scope creep into ticket 018's actual live-verification work (API key
  provisioning, native runtime access) — correctly left untouched as a
  separate ticket.

## Summary

This is exactly what a decision-recording ticket should look like: minimal,
reversible code change (two comment blocks), a real audit re-run rather than
trusting a stale table, an outcome doc whose factual claims survive
independent re-verification against the actual source and a live test run,
and decisions that commit to something checkable rather than deferring
under cover of "documentation only." The one open item (an optional neutral
marker on the Claude-vision route noting its current zero-caller status) is
a fast-follow suggestion, not a blocker — I agree with the tech-lead that
adding it now, in deprecation-adjacent language, would risk exactly the
signal-to-ticket-018 problem both of us want to avoid.

Approving round 1.
