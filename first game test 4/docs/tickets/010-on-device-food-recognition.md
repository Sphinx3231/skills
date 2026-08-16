# Ticket 010: Replace paid AI photo-scan with a free, self-hosted model + mandatory confirm-before-log

Status: **Rewritten (architecture attempt 3, revision 2) — plan not yet reviewed by tech-lead. Do not build.**

**Revision note**: the tech-lead's first review of attempt 3 returned DO
NOT APPROVE, primarily because that draft wrongly assumed FoxBite had no
confirm-before-log screen and needed one built from scratch. In fact
`log.tsx` already has a mandatory `review` step with editable fields and a
`confirmSave()` gate — nothing writes to the log on an unconfirmed
suggestion today. This revision corrects that premise (see the plan doc's
"What already exists" section) and fixes six other blocking findings: a
label-leakage bug (a raw model prompt string like "a photo of waffles"
could have reached the food-name field), a confidence-threshold gap that
would have let the tech-lead's flagged worst case (a dog photo scoring
"medium" confidence for waffles) through with no warning, a missing test-
injection seam for the classifier pipeline, restoration of several items
from attempt 2's approved plan that had silently vanished (persistent
model-cache location, `caveat` doc-comment fix, lazy-singleton coverage
strategy), and copying the two spike outcome docs into this working
directory so they're actually citable (they were only present in a
different git worktree).

## Summary

FoxBite's meal-photo scan (`POST /food/analyze`) currently uploads the photo
to Claude vision per scan — real per-call cost to the business, and
currently broken outright because `backend/.env`'s `ANTHROPIC_API_KEY` is
unset. The goal is to make the AI itself cost the business nothing, ever,
while the existing paywall (30-day trial → Stripe subscription) keeps
gating the feature for users exactly as it does today.

## Architecture history (why this doc looks different a third time)

Two prior free-model attempts were spiked and both hit the same wall:

- **Attempt 1** (on-device, native TFLite) — rejected by tech-lead review
  before it was ever built: no web fallback, an obsolete asset-bundling API,
  Metro config gaps. See git history for the original draft.
- **Attempt 2** (server-side, `onnx-community/swin-finetuned-food101-ONNX`,
  a closed 101-class Food-101 classifier) — plan was tech-lead approved, but
  its own mandatory Step 0 accuracy spike found the model unsuitable: 67%
  in-vocabulary accuracy, and out-of-vocabulary photos (a banana, oatmeal,
  plain chicken breast) landed **confidently wrong** 3 times out of 5 (worst
  case: a grilled chicken photo scored 99.1% for "grilled_salmon"). A closed
  softmax has no "none of these" option. Findings:
  `docs/outcomes/on-device-food-recognition-outcome.md`.
- **Attempt 3 spike** (server-side, `Xenova/clip-vit-base-patch32`,
  zero-shot classification against an open, developer-supplied label list)
  — chosen because an open vocabulary can include everyday foods (not just
  101 restaurant dishes) and can carry explicit negative/reject anchor
  labels. Result: **better but still not clean**. In-vocabulary accuracy
  rose to 91.7% (11/12), and 4/5 out-of-vocabulary foods were now correctly
  labeled (trivially — they were added to the candidate list, not "detected
  as unknown"). But non-food rejection got **worse**: only 2/4 non-food
  photos were correctly rejected — a dog photo scored 56.4% for "a photo of
  waffles," a cat photo scored 41.5% for the same label, both beating
  several genuinely-correct food predictions in the same run. Findings:
  `docs/outcomes/clip-zero-shot-spike-findings.md`.

**The common failure**: neither model's confidence score can be trusted to
gate silently. A threshold that accepts real food rejects too little
garbage; a threshold that rejects garbage also rejects real, correct
answers. This is not a tuning problem — it's inherent to asking either
architecture to self-certify its own correctness with no ground truth.

**The user's chosen resolution**: stop trying to make the model
self-certify. **Every scan result — high or low confidence, food or
not-food-shaped — goes through a mandatory review/confirm screen before
anything is logged.** The model's guess becomes a *prefill*, not an
*answer*. A wrong guess costs the user one tap to fix instead of silently
corrupting their food log. This resolves the OOD-threshold problem at the
product-design level rather than the model level, and it directly
addresses a real, previously-raised concern (the standing "confirm before
logging" follow-up idea) rather than introducing a new one.

**Model choice for this attempt**: CLIP zero-shot
(`Xenova/clip-vit-base-patch32`), not the closed Food-101 classifier. Reasons:
- Open, developer-controlled label vocabulary — can include everyday foods
  (banana, oatmeal, salad) that Food-101 structurally excludes, and can grow
  over time without retraining.
- Materially higher measured in-vocabulary accuracy in the spike (91.7% vs
  67%) — against that spike's own test set, photos re-sourced by category
  rather than confirmed byte-identical to attempt 2's originals, and at a
  small n=12 in-vocabulary sample; a real but qualified comparison, not a
  controlled A/B on identical inputs.
- Its OOD weakness (misreads non-food as food, confidently) is exactly the
  class of error a mandatory confirm screen neutralizes — the user sees "a
  photo of waffles" suggested for their dog photo and simply doesn't save
  it, or picks something else / logs manually. It would NOT have been safe
  to ship silently; it is fine to ship as a suggestion.

**This is a backend model swap plus targeted client fixes, not a new
screen.** `log.tsx` already has a mandatory `review` step (editable fields,
a `confirmSave()` gate, nothing writes to `food_logs` on an unconfirmed
suggestion) — this was verified by reading the code directly, not assumed.
See Scope item 4 for the four small deltas this ticket actually makes to
that existing screen.

**Cost tradeoff, unchanged from attempt 2's honest framing**: this replaces
a per-call API fee with server CPU/RAM cost per scan — a fixed
infrastructure cost the business already controls, not zero. The backend is
still not hosted anywhere (no `Dockerfile`/`fly.toml`/`render.yaml`) — a
pre-existing gap, out of scope here.

## Scope

1. New backend module wrapping CLIP zero-shot classification, replacing
   `analyzeFoodPhoto`'s Claude call for the photo-scan path only.
2. A developer-maintained candidate label list (foods + a small set of
   negative/reject anchor labels) — an open, growable list, not a fixed
   101-class enum. Format/location: plan's call.
3. `POST /food/analyze` keeps its route signature and `requireActiveAccess`
   gate; only the function behind it changes. Response shape may need a
   field to signal "this is a suggestion, not a certainty" if not already
   implied by existing `confidence`/`caveat` fields — plan to confirm against
   the existing `FoodAnalysis` contract before adding anything new.
4. **Targeted fixes to the EXISTING client-side review/confirm screen**
   (`log.tsx`'s `review` step already shows the suggested food name +
   macros, pre-filled and editable, gated behind an explicit `confirmSave()`
   — nothing is written to `food_logs` before that today, for any scan
   path). This ticket does not build a new screen; it adds: a guard against
   saving with a blank food name (today this round-trips to a raw API 400
   instead of a clear message), a fix so the log's `ai_raw_response` stores
   the true original model output rather than the user's edited values, and
   verification that the existing low-confidence/caveat banners still read
   as meaningful signal once every photo scan carries one (not just some,
   as with the dropped Claude path).
5. Nutrition-reference data mirrors attempt 2's design intent (a backend
   table mapping recognized labels to reference-serving macros), scoped to
   whatever label list Step 2 lands on.
6. Honest degrade path: a very-low-confidence or reject-anchor-triggered
   result still surfaces the review screen (with the model's best guess or
   an explicit "couldn't identify this" state) rather than silently
   guessing OR silently failing — the user always has a next action (edit
   fields, or fall back to manual entry).

## Non-goals

- `POST /food/analyze-text` — stays on Claude, unrelated NLP problem, still
  a real per-call cost the business pays after this ticket ships.
- Backend hosting/deployment — pre-existing gap, separate concern.
- Multi-item meal recognition — single-label classifier limitation, stated
  honestly, not solved.
- Automatically retrying with a different model/threshold when confidence is
  low — the confirm screen IS the handling for low confidence; no separate
  retry logic needed.
- Deleting the now-superseded Claude vision code path — recommend leaving in
  place, marked superseded, unless the user prefers deletion.
- Solving CLIP's non-food misfires at the model layer (better anchor
  prompts, a two-stage binary gate) — the CLIP spike's own findings flagged
  this as a possible future improvement, but the confirm screen makes it
  non-blocking for this ticket. Can be revisited later as a separate,
  smaller ticket if false-positive suggestions prove annoying in practice.

## Acceptance criteria

- [ ] `/food/analyze` returns a result produced by the local CLIP model +
      nutrition lookup, with zero calls to any paid AI API for photo scans.
- [ ] `requireActiveAccess`'s billing gate is verified unchanged (expired
      trial → 402, same as today).
- [ ] The existing mandatory review/confirm UI state (`log.tsx`'s `review`
      step) continues to gate every photo scan exactly as it does today —
      confirmed unchanged, not rebuilt.
- [ ] Saving with a blank/unidentified food name is guarded client-side with
      a clear message, instead of round-tripping to the backend's raw
      validation error.
- [ ] `food_logs.ai_raw_response` stores the true original model output, not
      the user's post-edit values.
- [ ] A result where an anchor/negative label appears near the top of the
      model's output (not just in the #1 position) is still flagged as low
      confidence with a caveat — verified against the specific case the
      CLIP spike found dangerous (a non-food photo scoring a "medium"-
      looking margin for a real food label).
- [ ] Web and mobile both get the feature identically — verified via the
      `run-foxbite-web` skill, not assumed.
- [ ] Candidate label list and nutrition-reference data are verified against
      real sources, not asserted from memory.
- [ ] New tests: backend (recognition/lookup modules, `node --test`
      convention) AND frontend — two targeted additions to the existing
      852-line `log.test.tsx` suite (edited-value-reaches-`createLog`
      assertion, empty-result render case), not a new suite or a rewrite.
- [ ] Outcome doc states plainly that CLIP's non-food-confidently-wrong
      failure mode still exists at the model layer and is mitigated by the
      confirm screen, not eliminated — don't imply the underlying model
      problem was solved.

## Pipeline

Full ticketed-change + gated-build cycle, consistent with tickets 004-009:
plan → tech-lead review → explicit user go-ahead → Sonnet build → Sonnet QA
→ Opus tech-lead → Opus CTO verdict → outcome/verdict docs → commit only on
explicit request.
