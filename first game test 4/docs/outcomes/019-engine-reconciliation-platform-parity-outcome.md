# Outcome: Engine reconciliation and native/web scan-quality parity

Ticket: [docs/tickets/019-engine-reconciliation-platform-parity.md](../tickets/019-engine-reconciliation-platform-parity.md)

No separate plan document was authored — per this ticket's own instruction
("this ticket's plan phase should firm this up"), the plan-phase work
(re-auditing call sites, deciding split-vs-combined scope, deciding each
engine's fate) is recorded directly in this outcome document rather than in
a separate plan doc, since the ticket is fundamentally a decision-recording
exercise, not a build with a design to review beforehand. The two goals
(engine reconciliation, platform-parity disclosure) were kept together in
one ticket/outcome, not split — both turned out small enough, and both
outcomes (a decision record) live naturally in the same document.

## 1. Re-audited current reality

Re-ran the grep-based verification the ticket asked for (not trusting its
own table), current as of this session:

| Engine | File(s) | Platform | Called by any route/screen today? |
|---|---|---|---|
| Claude vision (multi-item) | `backend/src/lib/anthropic.js` (`analyzeFoodPhotoMultiItem`), wired to `POST /food/analyze` in `backend/src/routes/food.js` | Backend | **Route is live and wired**, but **no client calls it**. Confirmed by reading `app/src/lib/food-recognition.ts` (native) and `food-recognition.web.ts` (web) end to end — neither imports or calls `api.analyzePhoto`; both call their own local model directly. `api.analyzePhoto` itself (`app/src/lib/api.ts`) has zero production call sites — grepped for `.analyzePhoto(` across `app/src`, only hits are its own test (`api.test.ts`) and a backward-compatibility test double in `log.test.tsx` that explicitly documents it's exercising a pre-016 path, not real app behavior. |
| Backend local CLIP zero-shot | `backend/src/lib/local-food-analysis.js`, `local-food-recognition.js`, `food-candidate-labels.js` | Backend | **No.** Grepped `backend/src` for `local-food-analysis`/`local-food-recognition` — the only non-test references are the two files importing each other and `backend/src/index.js`'s comment describing the history (ticket 017 already removed the boot-time warm-up that was these files' last live call site). `backend/src/routes/food.js` has zero reference to either file. |
| Web CLIP (in-browser, transformers.js/WASM) | `app/src/lib/food-recognition.web.ts` | Web only | **Yes.** `app/src/app/(tabs)/log.tsx` imports `classifyFoodPhoto` from `@/lib/food-recognition`, which Metro resolves to this file on web via the platform-extension convention. Confirmed live, unchanged. |
| On-device MobileNet classifier | `app/src/lib/food-recognition.ts` | Native only | **Yes.** Same `classifyFoodPhoto` import, resolved to this file on native. `food-recognition.ts`'s own top-of-file comment states explicitly "no network call to POST /food/analyze happens for this path anymore" — confirmed correct by the grep above (no `api.analyzePhoto` call inside it). |

**Conclusion: the ticket's table was still accurate.** Nothing changed
between ticket 016/017 and this audit — two engines live (web CLIP, native
MobileNet), two engines fully dead-but-present (Claude vision uncalled by
any client though its route still exists and works if called; backend
local-CLIP uncalled by any route at all).

## 2. Ticket 018 dependency check (performed before any Claude-vision decision)

Read `docs/tickets/018-verify-live-claude-multi-item-scan-gap.md` in full.
Confirmed: ticket 018's entire premise is that `analyzeFoodPhotoMultiItem`
via `POST /food/analyze` must **remain callable** (its acceptance criteria
require "a real Claude API call via `POST /food/analyze`... exercised at
least once"). It is currently blocked only by environment issues (no
`ANTHROPIC_API_KEY`, no native runtime), not by the code being unreachable
— the route itself is fully wired and would work today if those two
external blockers were resolved. Deleting `analyzeFoodPhotoMultiItem` or
the `/food/analyze` route would foreclose ticket 018 permanently. This
dependency was checked first, per this ticket's own non-goal, and is the
deciding factor below.

## 3. Per-engine decisions

### Claude vision (`backend/src/lib/anthropic.js`, `POST /food/analyze`) — **KEEP, unchanged, no deprecation comment**

Reasoning:
- Ticket 018 explicitly depends on this staying callable — deleting or even
  formally deprecating it (in the sense of signaling "don't build on this")
  would work against that ticket's stated goal.
- Unlike the backend local-CLIP engine below, this isn't just "uncalled
  code sitting in a file" — it's a fully wired, working route
  (`requireAuth` + `requireActiveAccess` + real Claude API integration)
  that would serve real traffic today if a client called it. The *route*
  is live infrastructure; only the *client-side call* is currently absent.
  That's a meaningfully different risk profile than the backend CLIP files,
  which have no caller anywhere in the stack.
- `backend/src/routes/food.js`'s existing comment already correctly
  describes this as "revived from ticket 010's superseded state" — accurate
  and sufficient; no additional comment was added here since there's
  nothing to deprecate. Kept exactly as-is, no code touched.
- No behavior change: confirmed by re-reading `backend/src/routes/food.js`
  unmodified.

### Backend local CLIP (`local-food-analysis.js`, `local-food-recognition.js`) — **DEPRECATED-IN-PLACE (doc-comment added), not deleted**

Reasoning against deletion: no strong case was found. These are working,
independently-tested single-item classifiers (their own test suites —
`local-food-analysis.test.js` 15/15, `local-food-recognition.test.js` 7/7 —
still pass untouched) that a future ticket could resurrect cheaply if
Claude vision's per-call API cost is ever judged unacceptable and a
cost-free fallback is wanted again (this is literally how `/food/analyze`
worked before ticket 014 swapped in Claude vision). Deletion would buy
nothing but fewer bytes in the repo, and the ticket's acceptance criteria
require any deletion to not be the default choice.

Reasoning for deprecation comment over "stay as-is": `index.js`'s existing
comment (added by ticket 017) already explained the history, but only for a
reader who opens `index.js`. A reader who opens `local-food-analysis.js` or
`local-food-recognition.js` directly (the far more likely path, since
those are the files someone would touch to resurrect or maintain this
engine) had no equivalent context. Added a doc-comment block to the top of
each file stating:
- What superseded it (ticket 014's revert of `/food/analyze` to Claude
  vision; ticket 017's removal of the now-pointless boot-time warm-up).
- Why it's kept rather than deleted (cheap-to-resurrect reference
  implementation, no strong deletion case).
- What would need to be true before it's safe to delete (a future ticket
  explicitly deciding the backend local-CLIP path will never be
  resurrected — e.g. Claude vision's cost being judged acceptable
  long-term with no cost-free fallback ever wanted — at which point this
  file, its sibling, and their test files could all go together).

No behavior change: only comment blocks were added above each file's
existing `import` statements; no logic, exports, or test files were
touched. Confirmed via the full backend test run below.

### Web CLIP and native MobileNet — **no decision needed, both stay as they are**

Both are live, in active use, and this ticket's non-goals explicitly
prohibit changing either engine's recognition behavior. Not touched.

## 4. Platform-parity disclosure decision

Read `app/src/app/(tabs)/log.tsx`'s `review-items` step (photo-scan review
screen, lines ~629-735) to see what context is already surfaced per scan.
Findings:
- Every item already shows a `confidence === 'low'` banner
  ("Low confidence — double-check these numbers before saving.") when
  applicable, plus an optional `caveat` string and an optional `notes`
  string, all rendered per-item regardless of platform.
- Both engines populate these fields with near-identical generic language
  today (`food-recognition-shared.ts` for web CLIP, `food-classifier-shared.ts`
  for native MobileNet both use "Suggested automatically from your photo —
  please review before saving." as their `notes` string, and analogous
  caveat text for the no-food/no-nutrition cases).
- Neither platform's copy names the underlying model/engine or says
  anything about cross-platform accuracy differences — confirmed no
  existing disclosure of the specific native/web gap exists anywhere in
  the UI today.

**Decision: (a) documentation-only.** No in-app UI change was made.
Reasoning:
- The review screen already enforces the same universal discipline on
  every scan, on every platform: nothing is auto-saved, every item is
  editable, and a confidence/caveat signal is shown whenever the model
  itself flags uncertainty. This mitigates the practical harm of the
  parity gap (a wrong or overconfident scan) regardless of which engine
  produced it — the mandatory confirm-before-log step ticket 016 called
  "load-bearing, not decorative" already does the safety-relevant work.
- The parity gap is a cross-device concern (comparing today's phone-app
  scan to today's web-app scan), not a within-scan one. FoxBite's existing
  usage pattern gives no indication users routinely alternate between
  native and web for the same logging session — most users would only ever
  see one engine's behavior in practice, making a same-screen "your device
  affects scan quality" disclaimer of debatable value for the sessions
  that would actually see it, and definitely not something to add without
  product/UX involvement on the actual wording, placement, and tone.
- This ticket's own non-goals prohibit building any engine-unification
  work, and the copywriting/placement of a new in-app hint is squarely the
  product/UX side's call (per this project's own division of labor), not
  something to bolt on unilaterally as an engineering afterthought. Per
  this ticket's explicit permission to close the question with "no UI
  change, documentation only" when that's the honestly-warranted answer, that
  is the decision made here.
- This decision is revisitable: if product/UX later wants an explicit
  in-app disclosure (e.g. a one-line "scan accuracy varies by device" note
  on the review screen), the smallest version would be a single additive
  `ThemedText` line inside the existing `review-items` card, styled via
  `@/theme`/`constants/theme` tokens already in use on that screen — noted
  here as the shape that future change should take if pursued, without
  actually building it now.

**Explicit naming of the gap in project documentation** (required by the
ticket's acceptance criteria regardless of the UI decision): the
native/web scan-quality gap is a known, accepted product characteristic as
of this ticket — native uses Google AIY MobileNetV1 (2,023-class closed
taxonomy, real accuracy 67-98% on correct photos per ticket 016, with a
reproduced non-food hallucination at 51.56% confidence), web uses CLIP
zero-shot (36 hand-picked candidate labels, characterized separately in
ticket 010/011's spikes) — different models, different taxonomies,
different confidence semantics, different failure profiles. This is
recorded here, in this outcome doc, as the durable decision record the
ticket asked for; no further ticket is opened to unify them (that remains
explicitly out of scope, per this ticket's non-goals, unless a future
ticket is deliberately opened for it).

## 5. Test results

Only comment-only changes were made (two backend files got new doc-comment
blocks; no logic, no test files, no UI code touched). Ran the backend suite
to confirm zero behavior regression:

```
node --test --experimental-test-coverage --experimental-test-module-mocks
```
**124/124 tests passing, 5 suites, 0 failed, 0 cancelled, 0 skipped.**
Includes `local-food-analysis.test.js` (15/15) and
`local-food-recognition.test.js` (7/7) — both files' own test suites,
unaffected by the added header comments.

No frontend/mobile files were changed at all in this ticket (the parity
decision was documentation-only, not a UI change), so no Jest run was
needed for that side — stating this plainly per the task's instruction
rather than fabricating a run for zero code change.

## Files changed

- `backend/src/lib/local-food-analysis.js` — added a deprecation doc-comment
  block above the existing `import` statement. No logic changed.
- `backend/src/lib/local-food-recognition.js` — added a deprecation
  doc-comment block above the existing `import` statements, cross-referencing
  `local-food-analysis.js`'s comment for the full reasoning. No logic
  changed.
- `docs/outcomes/019-engine-reconciliation-platform-parity-outcome.md` (this
  file) — the decision record itself.

## Not changed

- `backend/src/lib/anthropic.js`, `backend/src/routes/food.js` — Claude
  vision kept exactly as-is, no comment added (see reasoning above).
- `app/src/lib/food-recognition.ts`, `food-recognition.web.ts` — both live
  engines, untouched per non-goals.
- No UI/screen changes — platform-parity decision was documentation-only.
- No tests were added, removed, or modified — nothing was deleted, so the
  ticket's "remove tests alongside deletions" criterion doesn't apply.

## Decision record summary (for quick reference)

| Engine | Decision | Reasoning (one line) |
|---|---|---|
| Claude vision | Keep, unchanged | Ticket 018 depends on it remaining callable; route is live infra, not just dead code |
| Backend local CLIP | Deprecated-in-place (doc-comment only) | No strong deletion case; cheap-to-resurrect reference; comment now lives at the source, not just in `index.js` |
| Web CLIP | No decision needed | Live, in active use |
| Native MobileNet | No decision needed | Live, in active use |

Platform parity: **documentation-only** — gap named explicitly above; no
in-app UI change made; smallest-version UI hint shape noted for a future
product/UX-led decision if ever pursued.
