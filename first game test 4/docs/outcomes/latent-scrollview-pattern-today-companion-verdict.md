# CTO Verdict: latent ScrollView shrink-to-fit pattern in Today/Companion (ticket 008)

Ticket: `docs/tickets/008-latent-scrollview-pattern-today-companion.md`
Plan: `docs/plans/latent-scrollview-pattern-today-companion-plan.md`
Outcome: `docs/outcomes/latent-scrollview-pattern-today-companion-outcome.md`
Branch: `foxbite-scrollview-latent-pattern` (uncommitted working tree)
Reviewed: 2026-08-11

## Decision

**MERGE** — approved. No code changes required before commit. Two
documentation touch-ups at commit time (NB1/NB2), one optional one-line
addition (NB3/NB4), and one follow-up ticket recommended (F1 below).

This is the cleanest ticket in the 004–008 series. The diff is 8 lines
across 2 files, every load-bearing claim in the outcome document survived
independent re-derivation, and the mutation evidence is genuinely red-then-
green rather than green-only.

## Reviewer-independence caveat (read this first)

This account is on a Claude Pro plan **without Fable access**. The CTO gate
in this pipeline is normally Fable; Opus is standing in as a documented
fallback. The independence loss is real and should not be glossed over:
the chain is designed to run across three distinct model tiers (Sonnet
build → Sonnet QA → Opus tech-lead → Fable CTO) and here collapsed to
**two**, with the same Opus tier occupying both the tech-lead and the CTO
seat. Those two stages therefore share a model family, training, and
failure modes. Correlated blind spots between them are structurally
invisible to this process, and this verdict cannot claim otherwise.

The specific risk this creates for *this* ticket is worth naming: the
tech-lead's review says it "independently re-derived the reported pixel
measurements from source constants" and "independently worked through the
>800px case by reasoning." Those are exactly the two places where a shared
model family is most likely to make the *same* arithmetic or flexbox
reasoning error twice and mistake agreement for confirmation. I therefore
re-derived both from primary sources without reading the tech-lead's
derivation as an input, and additionally grounded them in the actual
`react-native-web` source in `node_modules` rather than in recalled
knowledge of RNW's behavior — a source neither prior stage's reasoning
could have contaminated. Details in the next section.

## What I verified myself (not taken on trust)

| Check | Method | Result |
|---|---|---|
| Diff scope | `git diff` on working tree | 2 files, 8 added/changed lines, matches plan exactly |
| No probe residue | `git status --porcelain` + full diff read | Clean: no test IDs, no wide row, no `alignItems:'center'` control, no stray files |
| `jest` | `npx jest` from `app/` | **37 suites / 316 tests, all passed** — matches outcome exactly |
| `tsc --noEmit` | `npx tsc --noEmit` from `app/` | **Exactly the 3 pre-existing errors**, same files/lines as reported. No new errors |
| The structural claim (`log.tsx` had no `SafeAreaView`) | Read `log.tsx:304-306` + `grep -c SafeAreaView log.tsx` → **0** | Confirmed from source: `ScrollView` is a *direct* child of `screen: {flex:1, alignItems:'center'}` |
| `Spacing.four = 24`, `MaxContentWidth = 800` | Read `app/src/constants/theme.ts:105-116` | Confirmed |
| The 848px control measurement | Re-derived from constants | 10 boxes × 80px = 800 intrinsic + (2 × `Spacing.four` = 48) = **848**. Exact match |
| The x=−185 header position | Re-derived | ScrollView centered in 430px parent at width 848 → left = (430−848)/2 = **−209**; +24 `paddingHorizontal` = **−185**. Exact match |
| The 382px content-width figure | Re-derived | 430 − 48 = **382**. Exact match |
| The x=24 as-shipped header position | Re-derived | 0 + `paddingHorizontal` 24 = **24**. Exact match |
| RNW `ScrollView` base style (the plan's reason to omit `flex: 1`) | Read `node_modules/react-native-web/dist/exports/ScrollView/index.js:608-623` | Confirmed: `commonStyle = {flexGrow: 1, flexShrink: 1, ...}`, **no `flexBasis`**. Plan's reasoning is correct |
| `width:'100%'` + padding cannot overflow | Read `node_modules/react-native-web/dist/exports/View/index.js:122` → `boxSizing: 'border-box'` | Confirmed neutral — this was the one plausible way the `scrollContent` change could have been non-neutral, and it is disproved at the source |
| `index.tsx` macro row cannot overflow | Read `styles.macroRow:341-347` | `flexDirection:'row', width:'100%'` with `flex:1` children. Confirmed: no intrinsic width to overflow with |
| `companion.tsx` wardrobe grid cannot overflow | Read `styles.wardrobeGrid/wardrobeItemWrap:233-234` | `flexWrap:'wrap'` + `flexBasis:'47%'`. Confirmed: wraps rather than overflows |
| Probe methodology validity | Read `t008-probe.mjs` in full | Sound — see "Evidence adequacy" below |
| Probe artifacts actually exist | Enumerated the scratchpad | All 15 artifacts present (13 PNGs + 2 scripts) |
| The control break, from pixels | Read `t008-1b-control-v2-full.png` as an image | Confirmed independently: header absent from viewport, hero card bleeding both edges, Protein tile clipped left / Fats clipped right, probe row running off-screen right |
| The after-fix flip, from pixels | Read `t008-2b-afterfix-today-control-full.png` as an image | Confirmed independently: "THE DEN / Today" visible at the left gutter, every card inside the viewport, probe row starting at x=24 and clipped at the container edge |
| NB3 (v1 vs v2 screenshots) | Read `t008-1b-control-full.png` and compared to the v2 image myself | **Visually identical.** Resolved — see NB3 ruling |
| Dev servers, for a live >800px re-measure | `curl :8097`, `curl :4000/health` | Both down; NB4 closed by construction instead — see NB4 ruling |

## Scope vs. plan and ticket

Exact conformance. The ticket asked for investigate-first, fix-if-real,
document-if-not, no behavior change, no other files touched. The plan
sharpened that into a 2×2 probe matrix with a positive control, a specific
fix (`alignSelf:'stretch'` only, explicitly *not* `flex:1`), a specific
second change (`width:'100%'` alone, explicitly *not* `alignSelf:'center'`),
and a re-verification pass. The delivered diff is precisely that and
nothing more:

- `style={styles.scroll}` on each `ScrollView`; `scroll: { alignSelf: 'stretch' }`
- `width: '100%'` added to each `scrollContent`

No scope creep, no opportunistic refactoring, no `log.tsx` churn (confirmed
untouched), no test edits. Both explicit "do NOT also add X" instructions in
the plan were obeyed — I checked each against the diff rather than assuming,
because these were the two places where copying `log.tsx` for parity would
have been the natural and wrong move. `log.tsx`'s `scroll` is
`{flex: 1, alignSelf: 'stretch'}` and its `scrollContent` carries
`maxWidth: MaxContentWidth, alignSelf: 'center'`; neither was copied, and
in this file's structure neither should have been (the `maxWidth` duty is
already discharged one level up by `safeArea`).

The ticket's most valuable output is arguably not the code at all: it is the
recorded **correction to ticket 006's N10 finding**. N10 was grep-derived —
two matching style blocks plus an absence — and missed the intervening
`SafeAreaView` that actually determines the outcome. That correction is now
documented with the mechanism and the empirical proof, which is what stops
the next reader from re-opening the same non-issue. Writing down that a
prior CTO finding was imprecise, with evidence, is exactly the behavior this
gate should reward.

## Code quality

Minimal, idiomatic, and self-consistent. Two observations:

- The change is **provably a no-op at render time and a constraint at edit
  time**, which is the ideal shape for a preventive fix. `alignSelf:'stretch'`
  restates the value the child was already inheriting from `safeArea`'s
  un-overridden default; `width:'100%'` restates the width `stretch` was
  already producing. Nothing about either property is width-dependent or
  breakpoint-dependent. Their entire value is that they stop being
  *inherited* and start being *stated*, so a future edit to `safeArea`
  cannot silently revoke them.
- `scroll: { alignSelf: 'stretch' }` written inline on one line while
  `safeArea`/`scrollContent` are multi-line is a trivial formatting
  inconsistency, and it matches `log.tsx`'s own one-liner (`scroll: {flex: 1,
  alignSelf: 'stretch'}`). Not worth a change request.

The decision to omit `flex: 1` deserves specific credit rather than a shrug.
It would have been easy and defensible-sounding to copy `log.tsx` wholesale.
The plan instead reasoned that `flex: 1` would change only `flexBasis`
(`auto` → `0%`) on the *vertical* axis — orthogonal to this ticket's
cross-axis concern — on two screens whose verification probe measures width
only and therefore *structurally cannot see* a vertical regression. Refusing
to introduce a change the verification can't observe is precisely the right
instinct, and I confirmed the premise directly in the RNW source
(`commonStyle` supplies `flexGrow`/`flexShrink` and no `flexBasis`). I also
satisfied myself the omission is behaviorally neutral here: as the sole
child of a `flex: 1` parent with a definite height, `flexBasis: auto` with
`flexGrow: 1` / `flexShrink: 1` resolves to the same used height as
`flexBasis: 0%` would.

## Test and evidence adequacy — does this clear "green is evidence of nothing until red"?

**Yes, and this is the strongest instance of that bar being met in the
004–008 series.** The reasoning matters, because the naive reading of this
ticket is that it clears the bar *trivially* — "nothing broke before, nothing
broke after" — which would clear nothing at all.

What makes it real is that the ticket's central claim is a **negative**
("these screens were never exposed"), and negatives are exactly where
green-only evidence is worthless. A screen that renders fine is ambiguous
between "genuinely not exposed" and "the probe was too weak to detect
exposure." That ambiguity is the same evidentiary weakness that produced the
imprecise N10 finding in the first place. The plan identified this before
building, and demanded a positive control whose *failure to fail* would
invalidate the entire run. That is the correct experimental design, and it
was actually executed:

1. **Red is real and independently confirmed.** The control cell (temporary
   `alignItems: 'center'` on `safeArea`) broke, hard — 848px ScrollView in a
   430px parent, ratio 1.97, header at x=−185. I confirmed the break from
   the raw pixels myself, not from the table: the header is simply gone from
   the frame and the cards are clipped on both edges. The probe demonstrably
   detects this bug class.
2. **The trigger is proven non-degenerate.** The probe row measured 800px in
   both cells, confirming the layout engine did not shrink it below the
   threshold before it could matter — the failure mode that would have made
   a green result meaningless.
3. **Green flips from red under the fix.** The bottom-right cell moves
   848px/1.97 → 430px/1.00 with the header back at x=24. This is the cell
   that carries the actual argument: it shows the fix neutralizes the
   specific future edit the whole ticket is premised on defending against.
   Without it, `alignSelf:'stretch'` would be a plausible-looking incantation
   with no proof of efficacy.
4. **All four cells filled, on both screens.** `companion.tsx` was not
   assumed to match `index.tsx`; it was measured, and reproduced the
   identical 848/430/1.97 → 430/430/1.00 pattern.
5. **The metric is the mechanism, not a proxy.** ScrollView-vs-parent
   bounding-rect ratio *is* the hypothesis (shrink-to-fit vs. match-parent).
   The plan explicitly rejected `document.documentElement.scrollWidth`
   because RNW's `overflowX: 'hidden'` clips the internal overflow before it
   reaches the document — I verified that `overflowX: 'hidden'` in the RNW
   source (`baseVertical`, line 619-623). Choosing a metric specifically
   because the obvious one is blind to the failure under test is a level of
   care above what this pipeline has typically produced.

Two additional strengths I found in the probe script that the outcome doc
undersells:

- It resolves the DOM ancestry **from the probe element upward**
  (`probeEl.parentElement` → `scrollContent` → `ScrollView` → `SafeAreaView`)
  rather than by selector guessing, so the measured "parent" is structurally
  guaranteed to be the real parent. I confirmed neither screen uses
  `RefreshControl` or sticky headers, so RNW inserts no extra wrapper and the
  chain is off-by-none.
- It **fails loudly** (`{error: 'probe element not found'}`) instead of
  returning zeros or nulls that could be misread as a pass. A probe that
  can't silently no-op is worth more than one that reports numbers.
- The header search is scoped to inside `safeAreaEl` with an explicit
  comment about the web tab bar's own "Today" label being a false match —
  someone thought about instrument error, not just the measurement.

**On the derived numbers.** Every reported figure reconstructs exactly from
source constants with no fudging: 848 = 10×80 + 2×24; −185 = (430−848)/2 +
24; 382 = 430 − 2×24; 24 = 0 + 24. Four independent figures all landing
exactly is not something fabricated numbers do. Combined with the
screenshots showing the qualitative symptom the numbers predict, I regard
the measurements as genuine.

**The one real limitation** is the one the plan itself named and accepted:
there is no permanent automated regression test, because `jest-expo` + RNTL
use a mock renderer with no Yoga layout computation, so a unit test cannot
detect a shrink-to-fit-width bug at all. I accept this — but I want the
consequence stated plainly rather than filed as closed: **the defense
shipped here is enforced by nothing but this document.** A future edit
deleting `styles.scroll` would pass `jest`, pass `tsc`, and reintroduce the
exposure silently. That is not a reason to block; it is a reason for F1
below, and a reason this verdict should be findable by the next person who
touches these files.

## Risk assessment

| Risk | Severity | Assessment |
|---|---|---|
| Visual regression at 430px | None | Measured directly, before and after, both screens |
| Visual regression at >800px (NB4) | None | Closed by construction — see NB4 ruling |
| Vertical/main-axis regression | None | No main-axis property was added; `flex: 1` deliberately omitted |
| Native (iOS/Android) regression (NB5) | Negligible | See NB5 ruling — closed more firmly than "judged fine" |
| Probe residue reaching a commit | None | Diff and `git status` both clean; verified myself |
| Test/type regressions | None | Both suites re-run by me with identical results |
| Fix silently deleted later | Low, unmitigated | No automated guard is possible; see F1 |
| Same pattern still live in 4 other files | Low | Newly found by me; see F1 — out of scope for this ticket, correctly |

Net: this is about as low-risk as a change can be. The realistic worst case
is that the two added lines are redundant, which is the *intended* state
today — their value is entirely in the future edit they neutralize, and that
neutralization is the one thing here that was measured most directly.

## Rulings on the tech-lead's non-blocking findings

**NB1 (ticket still says "In progress") — must fix at commit time.**
Confirmed: line 3 reads `Status: **In progress** (plan being written)`, which
is now doubly stale — the plan is written *and* the work is done. Update to
Done with the branch/date, consistent with tickets 004–007.

**NB2 (acceptance criteria unticked) — must fix at commit time.**
Confirmed all five boxes unticked. I checked each against the evidence
rather than taking the tech-lead's word: (1) satisfied — the 2×2 probe with
positive control is a genuine empirical test; (2) N/A — not exposed, so the
"if exposed" branch doesn't apply, and it should be marked N/A rather than
ticked, since ticking it would misrepresent what happened; (3) satisfied —
the outcome doc's mechanism section is clear enough to prevent re-flagging,
which was the actual bar; (4) satisfied; (5) satisfied. Tick 1/3/4/5, mark 2
as N/A with a one-line reason.

**NB3 (v1 vs v2 screenshot filenames) — resolved by me; one line, optional.**
I read both `t008-1b-control-full.png` and `t008-1b-control-v2-full.png` as
images and they are **visually identical**. The v1/v2 pair is therefore a
re-run of the *measurement instrumentation* (the probe script contains
visible defensive handling for `data-testid` vs `testID` attribute
resolution, the likely cause), not two different rendered states — so no
evidence is being hidden by the ambiguity, and the concern is purely
archival. Since I resolved it, the outcome doc can be left as-is; if the
one-line note is cheap, add "v1/v2 are the same rendered state, re-run only
to fix probe-element attribute resolution." Not a merge condition.

**NB4 (">800px" claim broader than measured) — closed by construction; no
doc change required.** The tech-lead was right to flag the wording and right
about the conclusion, but I don't think "confirmed by reasoning" is where
this should be left, so I closed it from primary sources instead. The
argument is stronger than width-neutrality at one more breakpoint — it is
**width-invariance**:

- At any viewport, `screen`'s `alignItems: 'center'` plus `safeArea`'s
  `width: '100%', maxWidth: 800` gives `safeArea` a box of
  `min(viewport, 800)`, centered. That is unchanged by this diff.
- `safeArea` sets no `alignItems`, so its default `stretch` already sized
  the `ScrollView` to that box. `alignSelf: 'stretch'` sets the child-side
  property to the identical value. Same used width at every viewport.
- `scrollContent` was already stretched to the `ScrollView`'s width by the
  same default. `width: '100%'` resolves to that same width, and because
  RNW's `View` sets `boxSizing: 'border-box'` (verified at
  `View/index.js:122`), the `paddingHorizontal: 24` sits *inside* that
  width rather than adding to it — so no horizontal overflow is introduced
  at any width.

Neither added property references a breakpoint, a viewport dimension, or a
conditional. There is no width at which their resolved values diverge from
the pre-change resolved values, so measuring one width plus this
construction is genuinely adequate evidence — not a gap being waved
through. I did attempt a live re-measure at a wide viewport for
belt-and-braces; both dev servers are down and spinning them up to
re-confirm a provable no-op is not a good use of the gate. I record that I
did not re-measure live, and that I consider the residual risk nil rather
than merely small.

**NB5 (web-only probes, no native) — closed more firmly than "fine given
the diff." No action.** The tech-lead's judgment is correct; here is the
stronger form. On native, Yoga applies the identical rules the argument
above relies on: `safeArea` overrides no `alignItems`, so its default is
`stretch`, so `alignSelf: 'stretch'` on the `ScrollView` is a restatement of
the inherited value on native exactly as on web. And `width: '100%'` on a
vertical `ScrollView`'s `contentContainerStyle` is not novel here — it is
**already shipped in this codebase** in `log.tsx`'s `scrollContent`, so this
exact property in this exact position is already exercised on the same
platforms as the rest of the app. There is no main-axis, gesture, or
platform-specific API surface in this diff to diverge. Native probing would
add no information.

## Required follow-up (not a merge condition)

**F1 — file ticket 009: the same implicit-default pattern is live in four
settings screens.** I found this while spot-checking, and it is a genuine
CTO-level consistency issue rather than a scope complaint. `settings/index.tsx`,
`settings/goals.tsx`, `settings/appearance.tsx`, and `settings/wardrobe.tsx`
each carry the *identical* structure this ticket just hardened:
`screen: {flex: 1, alignItems: 'center'}` → `safeArea: {flex: 1, width: '100%',
maxWidth: MaxContentWidth}` → `<ScrollView contentContainerStyle={...}>` with
no `style` prop. Ticket 008 correctly did not touch them — N10 named only
Today/Companion, and the ticket mandated "no other files change," so
expanding scope mid-build would have been the wrong call.

But the result is that the repo now carries **three** variants of this
layout idiom: `log.tsx` (`flex:1` + `alignSelf` + `scrollContent` owning
`maxWidth`/`alignSelf:'center'`), Today/Companion (`alignSelf` +
`width:'100%'`, `maxWidth` owned by `safeArea`), and four settings screens
(nothing explicit). Two consequences worth a ticket: the settings screens
retain the same implicit-default dependency this ticket just argued is worth
closing, and — more likely to actually cost time — a future reviewer running
the same `grep` that produced N10 will re-flag those four files and the loop
starts over. Ticket 009 should apply the Today/Companion pattern to all
four, and the interesting question is whether it can be justified *without*
re-running a full 2×2 Playwright probe on each: the mechanism is now
empirically established, the structures are byte-comparable, and one control
cell on one settings screen should suffice. Worth deciding deliberately
rather than by default.

## What should happen at commit time

1. **Update the ticket** — NB1 (status line → Done, with branch and date)
   and NB2 (tick criteria 1/3/4/5; mark criterion 2 N/A with a one-line
   reason, since the fix was preventive and no exposure existed to fix).
2. **NB3/NB4/NB5 need no changes.** NB3 is resolved above (the two frames
   are the same rendered state); the optional one-liner is welcome but not
   required. NB4 is closed by the width-invariance construction above. NB5
   is closed by the Yoga-default and `log.tsx`-precedent arguments above.
   None of the three should be carried forward as an open risk.
3. **Do not delete the probe artifacts** in the session scratchpad until the
   commit lands. They are this ticket's only red-state evidence, and
   scratchpads are session-scoped. If any evidence is to be retained
   long-term, the two frames that carry the argument are
   `t008-1b-control-v2-full.png` (red) and
   `t008-2b-afterfix-today-control-full.png` (green after fix).
4. **Commit and merge per the ticket-006 sequencing convention**, in this
   order and no other:
   - Commit ticket 008 (code + ticket + plan + outcome + this verdict) to
     its own branch, `foxbite-scrollview-latent-pattern`.
   - Then merge that branch to `main`.
   - **Only on the user's explicit go-ahead.** I am not merging anything,
     and no agent in this pipeline should. Per the convention established in
     ticket 006 and reaffirmed in the branch-sequencing note: a dependent
     ticket must not be branched until this one is committed and merged to
     `main`, so F1/ticket 009 waits on that merge.
5. **File F1 as ticket 009** after the merge — not before, so it branches
   from a `main` that already contains the pattern it will propagate.

## Closing note

Ticket 008's real product is an evidentiary correction: a prior CTO finding
was wrong in its mechanism, and instead of being quietly dropped or
defensively re-litigated, it was probed, disproved, documented, and then
hardened anyway for a *different and better-stated* reason than the one
originally given. The pipeline caught its own imprecision and wrote the
correction down. That is the behavior worth reinforcing here, more than the
8 lines of CSS.

**MERGE.**
