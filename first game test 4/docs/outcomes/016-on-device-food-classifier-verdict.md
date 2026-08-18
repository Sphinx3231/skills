# CTO Verdict: Ticket 016 — On-device food classification (native)

Round: 1
Decision: **MERGE (approved)**

## What I independently verified

- **Full suite, myself, from clean tree**: `npx jest --coverage` in
  `app/` → **427/427 passing, 48 suites**, coverage 98.64%/91.02%/98.53%/99.57%
  (stmts/branch/func/line) — matches the outcome doc's claimed numbers
  exactly, not just trusted.
- **`npx tsc --noEmit`**: same 3 pre-existing baseline errors
  (`animated-icon.tsx`, `app-tabs.web.tsx`, `collapsible.tsx`) — no new
  errors introduced.
- **Mutation test 1** (my own, not reused from QA/tech-lead): forced
  `classifyFoodClassifierOutput`'s background-near-top branch to be a
  no-op (`const confidence = baseConfidence;`, removing the
  `backgroundNearTop ? 'low' : ...` guard). Result: 1 real test failure
  in `food-classifier-shared.test.ts` (the exact regression test named
  for this). Reverted from clean backup; suite back to 427/427.
- **Mutation test 2** (my own): commented out `await assertActiveAccess();`
  as the first line of `classifyFoodPhoto`. Result: 3 real test failures
  in `food-recognition.test.ts`, including the "fails closed on billing-check
  throw" test resolving with a real classification instead of rejecting.
  Reverted; suite back to 427/427.
- **Dependency claims**: confirmed `react-native-fast-tflite@^3.0.1`,
  `react-native-nitro-modules@^0.36.5`, `jpeg-js@^0.4.4` are actually present
  in `app/package.json`, and the Expo plugin entry is actually present in
  `app/app.json`.
- **CSV quote-fix claim**: read the raw source CSV directly
  (`app/assets/models/food_classifier_labelmap.csv` lines 1128-1129:
  `1126,"""Peanut butter"` / `1127,"""Bacon"`) and confirmed the generated
  labelmap (`food-classifier-labelmap.ts` line 1136: `'"Peanut butter'`)
  is the correct RFC4180 unescape of that raw field, not a residual bug —
  matches what tech-lead/QA reported, verified from the raw bytes myself
  rather than taking the claim on faith.
- **Dead-route claim**: grepped all production call sites of
  `api.analyzePhoto` (which hits `POST /food/analyze`). It is called from
  **zero** production code paths now — only from test files
  (`api.test.ts`, `food-recognition.test.ts`'s own "makes no network call"
  assertion, and `log.test.tsx`'s legacy mock wiring). Both native
  (`food-recognition.ts`) and web (`food-recognition.web.ts`) now resolve
  entirely on-device. This confirms the outcome doc's and ticket's framing
  is accurate, not overstated.
- **Threat-model text**: compared the ticket's Background section verbatim
  against the outcome doc's "Threat model — restated, not paraphrased"
  section and the code comment atop `food-recognition.ts`. All three say
  the same thing with no softening: on-device execution is a product gate
  via `assertActiveAccess()`, not a security boundary; a determined user
  can strip the client-side check once the model ships in the binary; no
  DRM/anti-tampering was attempted or implied. This is an honest,
  non-overstated disclosure.

## Scope vs ticket

In scope, no drift:
- `react-native-fast-tflite` + Expo plugin + `metro.config.js` asset-ext
  change — as specified.
- Model sourcing resolved exactly as the ticket's own "Model selection"
  section dictated (no new model chosen mid-build).
- Native-only change; `food-recognition.web.ts` untouched (confirmed via
  `git status` — no diff on that file or its tests).
- Backend untouched, `requireActiveAccess` left in place server-side on
  `/food/analyze` and `/analyze-text` — not deleted, per the established
  "leave superseded code in place" precedent from tickets 010/014.
- Macro-data-as-zero-plus-manual-entry is a reasonable, explicitly-scoped
  design decision, not a silent omission — both rejected alternatives
  (USDA lookup, reusing CLIP's 36-item table) are documented with concrete
  reasons and the "no new secret" instinct is correct.
- New tickets 017/018 filed as backlog items about *unrelated*, previously
  found issues (misleading startup log, no live Claude verification path) —
  correctly not folded into this ticket's build, not scope creep.

## Point-by-point on my assigned checks

**1. Three parallel food-recognition engines (web CLIP, native MobileNet,
unreferenced Claude vision) — worth flagging, not blocking.**
Each individual "don't delete the superseded engine" call was locally
reasonable and consistent with established precedent (010, 014). But the
accumulation is now real: `backend/src/lib/anthropic.js`'s
`analyzeFoodPhotoMultiItem` and `backend/src/lib/local-food-analysis.js`'s
CLIP pipeline are both fully uncalled from any HTTP route or client path,
and `POST /food/analyze` itself has zero remaining production callers.
Three maintained-but-inert engines is a real ongoing tax (dependency
upgrades, security patches, mental overhead for the next engineer reading
`food.js` and wondering which of two functions actually runs) even though
none of them is a bug today. Ticket 017 already independently surfaces
part of this (the misleading startup log for the same dead CLIP path) —
that's good, but there's no ticket yet proposing an actual decision point
("delete engine X" or "formally freeze it with a comment explaining why
it's kept"). **Non-blocking architectural note**, recommend a follow-up
ticket to make an explicit keep/delete decision on `analyzeFoodPhotoMultiItem`
and `local-food-analysis.js` rather than letting "uncalled but present"
compound indefinitely.

**2. Native (MobileNet, 2,024 classes) vs web (CLIP, ~36 hand-picked
candidates) now being two different closed-set models with different
taxonomies and accuracy profiles — worth naming, not blocking.**
This is a genuine user-facing inconsistency: the same photo of the same
dish can plausibly be recognized on one platform and not the other, with
different confidence-threshold semantics (probability scale vs.
margin/anchor scale) and different failure modes (MobileNet's 2,024-class
long tail vs. CLIP's narrow 36-item candidate set). Neither the ticket nor
the outcome doc names this cross-platform inconsistency explicitly as a
*product* fact a user might notice and be confused by ("why did my Android
scan work but not this one" / vice versa isn't quite it, it's "why does the
app know Kutia but not more common items CLIP might catch, or vice versa").
It's disclosed technically (thresholds aren't comparable, taxonomies don't
overlap) but not framed as a user-facing quality-consistency concern.
**Non-blocking, but recommend the outcome doc or a follow-up ticket
explicitly acknowledge this as a known platform-parity gap**, distinct from
the already-well-covered technical disclosures.

**3. Is `requireActiveAccess` dead code for the native path, and does
a future regression risk exist?**
Confirmed: no production code path calls `api.analyzePhoto` any more, on
either platform, so `requireActiveAccess` on `POST /food/analyze` is
currently unreachable via any client-initiated photo scan. It's *not*
fully dead as a function, though — it still actively gates
`POST /food/analyze-text` (`analyzeFoodText`, voice/typed description,
explicitly out of scope for this ticket and still live). So this is
"dead for the photo-scan route specifically," not "dead code" in the
function-level sense.

On the regression-risk question: this is actually **not** as dangerous as
it could be, and worth stating precisely rather than alarmist. If some
future change accidentally reintroduced a native call to
`api.analyzePhoto()`/`POST /food/analyze`, the existing server-side
`requireActiveAccess` middleware is still wired to that route and would
still enforce it — the server-side backstop for *that specific route* has
not been removed, only bypassed by the current architecture choosing not
to call it. The actual gap the ticket's threat model correctly names is
narrower and different: the on-device path itself has **no server
round-trip at all**, so its only enforcement is the client-side
`assertActiveAccess()` check, which is trivially bypassable by anyone
willing to patch the binary — this is disclosed, accepted, and consistent
with the ticket's own explicit non-goal ("no real DRM/binary-hardening").
I don't see a code path in this diff that silently reintroduces a call
while dropping the gate — `assertActiveAccess()` is the very first
`await` in `classifyFoodPhoto`, confirmed by my own mutation test above.
**No blocking issue here.**

**4. Threat-model disclosure honesty.** Confirmed accurate and
consistent across ticket, outcome doc, and code comment (see verification
above). Nothing in the code or docs claims a stronger guarantee than what
`assertActiveAccess()` can actually provide.

**5. Outcome document technical-debt disclosures.** The "Unverified /
could not check in this environment" section is unusually candid and
specific — it names the exact unresolved risk (uint8 dequantization
scale/zero-point assumption for the output tensor is unconfirmed against
the real bundled model file) rather than glossing over it, and points to
where in the code that assumption lives. This is an acceptable record: it
correctly separates "verified by reading source/types and unit tests"
from "verified by running on real hardware," and does not overstate either.
I sign off on this outcome document's disclosures as honest and complete
enough to merge, with the two architectural notes above (three-engine
sprawl, cross-platform model-taxonomy inconsistency) recorded as follow-up
material, not blockers.

## Risk / reversibility

No one-way doors here: no schema change, no data migration, no Cosmos/DB
repartition analog in this stack. The riskiest unverified claim (uint8
tensor dequantization assumption) fails safe — worst case is a wrong
classification still gated by the mandatory confirm screen, not a crash or
silent bad data write, and it's explicitly flagged for a real-device
verification pass before or shortly after this ships. Acceptable to merge
without blocking on real-device verification, given the confirm-screen
backstop is confirmed genuinely load-bearing (not decorative) by two
independent mutation tests (mine + tech-lead's).

## Blocking issues

None.

## Architectural notes (non-blocking, recommend follow-up tickets)

1. File a follow-up ticket to make an explicit keep/delete/freeze decision
   on the now-fully-uncalled `analyzeFoodPhotoMultiItem`
   (`backend/src/lib/anthropic.js`) and `local-food-analysis.js` (CLIP)
   engines, rather than letting a third "leave it uncalled" precedent
   compound without a maintenance plan. Ticket 017 partially covers the
   local-CLIP warm-up symptom but not the underlying "how many dead engines
   do we carry forever" question.
2. Explicitly name, in the outcome doc or a short follow-up note, that
   native and web now run genuinely different closed-set food-recognition
   models (different taxonomies, different confidence semantics, different
   accuracy profiles) as a user-facing platform-parity fact, not just a
   technical implementation detail.
