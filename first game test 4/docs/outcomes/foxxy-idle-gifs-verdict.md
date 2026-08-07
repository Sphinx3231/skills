# CTO Verdict: replace SVG FoxCompanion with always-looping idle GIFs

Branch: `foxbite-idle-gifs` (uncommitted working tree at
`C:\Users\El Samaka\OneDrive\Desktop\Claude`, changes under
`first game test 4/app/` and `first game test 4/docs/`).
Pipeline: Sonnet build → Sonnet QA → Opus tech-lead (one blocking fix cycle,
resolved) → Opus CTO (this document). Fable unavailable on this plan.

Reviewed: `docs/plans/foxxy-idle-gifs-plan.md`,
`docs/outcomes/foxxy-idle-gifs-outcome.md`, the full `git diff main` plus all
untracked new files, and independently re-run `npx jest --coverage` and
`npx tsc --noEmit`.

## Decision

# ✅ MERGE

Merge to `main` as-is. No blocking defects. Four non-blocking follow-ups and
one accepted UX quirk are recorded below; none of them justify holding a
change whose entire purpose is a visible improvement the user asked for
directly and confirmed twice.

---

## 1. Scope vs. the original brief

The user's words: *"I have created 6 foxidle gifs please use these for the
companion along side the other animations I dont want him to ever be a still
png."* Two judgment calls were confirmed with the user during scoping (full
SVG replacement everywhere, not a fallback; reduce-motion still respected by
freezing on a static frame).

Verdict: **delivers the brief, and nothing more.**

| Brief element | Delivered |
|---|---|
| Use all 6 idle GIFs | Yes — `fox-idle.tsx`'s `SOURCES` map covers all six, and `fox-idle.test.tsx` asserts each kind loads its own specific filename, so no GIF is orphaned or mis-wired |
| "Alongside the other animations" | Yes — the 5 one-shot `FoxMoment` GIFs and their queue are untouched; the `activeMoment ? <FoxMoment/> : <Foxxy/>` shape at both call sites is preserved, only the else-branch component changed |
| "Never a still png" | Yes — all three former `FoxCompanion` sites (Dashboard hero, Companion hero, wardrobe grid thumbnails) now render a looping GIF. `grep` for `FoxCompanion` in `app/src` returns only two doc-comments naming the retired component for context |
| Reduce motion still respected | Yes — `Foxxy` reads `useReduceMotion()` once and passes `autoplay={!reduceMotion}` to `expo-image`. Confirmed `autoplay` is a real prop in the installed `expo-image@3.0.11` (`build/Image.types.d.ts:202`), not an invented one |
| Nothing else touched | Confirmed — diff is 8 modified/deleted tracked files, 48 insertions / 577 deletions, plus new Foxxy files and assets. Sign-in, backend, billing, `log.tsx` untouched |

**Mood mapping is sound.** `idleKindForDashboard` reuses `foxxyState`'s
existing `remaining <= goal * 0.15` "Sly moves!" threshold rather than
duplicating a second copy of that rule — the right call, since the fox's
pose and the fox's speech line now can't drift apart. The explicit
`neutral → 'stand'` branch added post-review is genuinely better than the
accidental fallthrough it replaced.

### Is retiring the SVG entirely the right call, given the earlier revert?

Yes, with a caveat worth stating plainly.

The concern is legitimate: `HANDOFF.md` records an earlier session that tried
a raster Foxxy and the user reverted it back to hand-drawn SVG. Doing the
same thing again on an assumption would be a repeat mistake. It isn't an
assumption here — the plan's Brief documents that this was re-confirmed
directly with the user across two rounds of `AskUserQuestion` during scoping,
including specifically that the SVG is not to be kept as a fallback. Nor is
it the same direction: the earlier attempt substituted someone else's raster
art for the user's fox; this uses six GIFs the *user drew and supplied*, at
the user's own instruction. That's a materially different decision.

**Reversibility — verified, not assumed.** I confirmed
`git show main:"first game test 4/app/src/components/fox-companion.tsx"`
returns the full 422-line component, and its test file is equally recoverable
from `main` (commit `c95d75a`). Nothing in this change is destructive:

- The GIF assets are additive; none of the six were modified during the
  wardrobe fix (only overlay coordinates changed).
- `FoxMood` moved from the deleted `fox-companion.tsx` to
  `dashboard-logic.ts` — arguably where it always belonged, since
  `foxxyState()` owns the mood logic. That relocation survives a revert
  independently and is an improvement on its own merits.
- The accessory SVG paths were extracted **verbatim** into
  `fox-wardrobe-overlay.tsx` rather than redrawn, so the hand-drawn wardrobe
  art is still live in the tree even though the fox body isn't.
- Restoring the SVG fox means `git checkout main -- <two files>` plus
  reverting three call sites. Under an hour of work, no data migration, no
  schema, no state.

The one caveat: the wardrobe accessory *coordinates* are now tuned to the
GIFs (see §4). A future revert to the SVG fox would need those transforms
removed, not just the fox swapped back. That's documented in-file and here,
so it won't be a surprise. It does not make the change hard to undo.

---

## 2. Code quality

Good. This reads like it belongs in the codebase rather than beside it.

**Strengths**

- **Correct separation of concerns.** `fox-idle.ts` (pure mapping) /
  `fox-idle.tsx` (dumb renderer, `reduceMotion` as a required prop) /
  `fox-wardrobe-overlay.tsx` (presentational SVG) / `foxxy.tsx` (composite,
  owns the hook). This deliberately mirrors the existing
  `fox-moments.ts`/`fox-moment.tsx` split, so a reader who knows one knows
  the other. Making `reduceMotion` a *required* prop on `FoxIdle` — not
  optional-with-default — is the right strictness: it can't be silently
  forgotten at a new call site.
- **Comments explain "why," and specifically why-this-number.** The
  coordinate comments in `fox-wardrobe-overlay.tsx` state the measured pixel
  fractions and the viewBox conversion, so a future session can re-derive
  them without repeating the screenshot work. The `KINDS_WITH_BAKED_IN_SCARF`
  comment explains the suppression and why the code stays kind-aware instead
  of deleting `Scarf` outright. This is above the bar for this repo.
- **The fix cycle was handled honestly.** Suppressing the Scarf rather than
  recoloring it, and translating the Backpack rather than redrawing it, both
  preserve "extracted verbatim" as a real property instead of a claim. The
  outcome doc records a *failed* first repositioning attempt (backpack landed
  on the cheek) rather than presenting the final numbers as first-try
  insight — that's the kind of reporting that makes the rest of the doc
  trustworthy.
- **Coverage-floor miss was flagged up, not quietly rounded.** The outcome
  doc leaves that acceptance checkbox unticked and explains itself. Correct
  behavior at a gate.

**Minor notes (not blocking, not requiring action)**

- `Foxxy` re-computes `wearingAnything` on every render and skips the overlay
  `View` entirely when nothing is worn — cheap and correct; the Dashboard
  hero (which never wears anything) pays nothing for the overlay path.
- The overlay `View` correctly sets `pointerEvents="none"`, so accessories
  can't swallow touches on the wardrobe tiles. Easy thing to miss; it wasn't.
- `accessibilityLabel="Foxxy"` now appears on up to five nodes on the
  Companion screen (hero + 4 grid tiles). That's semantically honest — they
  are all Foxxy — but a screen reader user hears "Foxxy" five times with no
  distinguishing context on the grid. The tile's text label ("Cozy scarf"
  etc.) is adjacent, so it's navigable, but per-tile labels
  (`"Foxxy wearing a cozy scarf"`) would be better. Follow-up, not blocker.

---

## 3. Test adequacy — my own final numbers

Re-run independently in `first game test 4/app`:

**`npx jest --coverage`** — exit 0.

```
Test Suites: 25 passed, 25 total
Tests:       182 passed, 182 total
All files    | 97.81 % Stmts | 89.52 % Branch | 97.79 % Funcs | 99.35 % Lines
```

**`npx tsc --noEmit`** — the same 3 pre-existing errors, no new ones:

```
src/components/animated-icon.tsx(150,5): error TS2698
src/components/app-tabs.web.tsx(71,15): error TS2322
src/components/ui/collapsible.tsx(22,13): error TS2322
```

These match the outcome doc's reported figures exactly. The doc did not
inflate anything.

**On the coverage floor.** Three of four metrics land fractionally under the
stated bar (stmts −0.16pp, funcs −0.16pp, lines −0.04pp); branches *cleared*
it (89.52 vs 89.43). I verified the stated root cause rather than accepting
it: every file this change created or touched sits at **100/100/100/100** in
the per-file table — `fox-idle.ts`, `fox-idle.tsx`, `fox-wardrobe-overlay.tsx`,
`foxxy.tsx`, `dashboard-logic.ts`, `fox-moments.ts`, `companion.tsx`,
`index.tsx`. The only uncovered lines in the whole report are
`log.tsx:401,404`, `sign-in.tsx:279`, `external-link.tsx:14`, and
`theme.ts:115` — all pre-existing, all in files this plan explicitly places
out of scope, and the last two structurally uncoverable under `jest-expo`.

Deleting a 422-line, 100%-covered file shrinks the denominator; a fixed
number of pre-existing uncovered lines then occupies a larger share of it.
**This is denominator arithmetic, not a testing regression.** Treating a
0.16pp aggregate dip as a merge blocker would create exactly the wrong
incentive — it would penalize deleting well-tested dead code, and reward
padding unrelated out-of-scope screens with tests to chase a number. I am
explicitly accepting the miss and **resetting the coverage floor to the new
measured values (97.81 / 89.52 / 97.79 / 99.35)** for subsequent tickets.

**Test quality is genuinely better than the count suggests** (+26 tests,
+4 suites). Three things stand out:

1. The `autoplay` assertions inspect the rendered
   `ViewManagerAdapter_ExpoImage` node for literal `"autoplay":false` — they
   prove the prop reaches the native view, not that a plausible value was
   handed to a wrapper. That is what the acceptance criterion actually asked
   for.
2. Each `FoxIdleKind` is asserted to load its own specific GIF filename via
   `testUri`, so a copy-paste error in the `SOURCES` map fails a test.
3. The restored negative assertion in `companion.test.tsx` — an
   accessibility-label collision had silently degraded `'does not play a
   FoxMoment when nothing was newly unlocked'` into a comment with no
   assertion, and the fix re-targets it at the celebrate GIF's filename.
   Finding and restoring a test that had quietly stopped testing anything is
   worth more than several new ones.

**Remaining test gap (accepted):** nothing enforces accessory placement. See
§4.

---

## 4. Risk assessment

### 4a. Wardrobe coordinate fragility — the real long-tail risk

**Severity: low-impact, moderate-likelihood, permanently unguarded.**

The Hat/Crown/Backpack transforms in `fox-wardrobe-overlay.tsx`
(`translate(-10,4) scale(1,0.52)`, `translate(-10,-1) scale(1,0.6875)`,
`translate(-73,14)`) and the entire `KINDS_WITH_BAKED_IN_SCARF` suppression
are derived from pixel measurements of two specific files —
`foxidle_01_stand.gif` and `foxidle_02_calm.gif` — as they exist today. They
encode the position of *that* fox's head, torso, tail, and baked-in bandana.

No test can catch a regression here. The unit tests assert an accessory's
`testID` is present or absent; none of them can assert it is present *in the
right place*, because that requires rasterizing a GIF frame and compositing.
So: if the user redraws `stand.gif` with the fox two-thirds the size, or
shifted, or facing sideways, or without the bandana — the suite stays green
at 182/182 and the crown floats above empty space in production.

Mitigating factors, which are why this is a follow-up and not a blocker:

- The failure mode is cosmetic, visible immediately on the Companion screen,
  and trivially fixable by re-running the documented measurement procedure.
- The measurements are recorded as reproducible `(pixel-fraction → fraction ×
  200)` derivations in both the outcome doc and in-file comments, so the
  next session re-derives rather than re-guesses.
- In practice only two of the four accessories can even render today, and
  the Scarf renders nowhere at all (see §5).

**Recommended follow-up (not a merge condition):** add a comment block at the
top of `fox-wardrobe-overlay.tsx` — or a `docs/` note — reading roughly *"if
any of the six idle GIFs are replaced, these transforms must be re-measured;
no test will catch it."* The information exists; it just isn't at the place
someone swapping a GIF would look first.

### 4b. Bundle size — measured, and the largest real cost of this merge

Actual current contents of `app/assets/Gifs/` (measured, not from the plan):

| Set | Files | Bytes |
|---|---|---|
| New idle GIFs (`foxidle_01..06`) | 6 | 11,737,348 (~11.2 MiB) |
| Existing moment GIFs (`fox_01..05`) | 5 | 11,601,758 (~11.1 MiB) |
| **Total** | **11** | **23,339,106 (~22.3 MiB)** |

Largest single files: `fox_01_wave.gif` 3.82 MB (pre-existing),
`foxidle_01_stand.gif` 2.38 MB (new).

So this branch roughly **doubles** an already-large asset payload. ~22 MiB of
GIFs bundled into an app whose entire JS/TS source is a few thousand lines is
disproportionate, and it is the single most defensible reason someone could
argue for NO-MERGE.

I am accepting it, for three reasons: (1) the ~11.1 MiB half of it already
shipped to `main` in the GIF-moments ticket, so this branch is not
introducing the problem, only enlarging it; (2) the plan flagged it
explicitly as deferred rather than hiding it; (3) it is entirely fixable
later without touching a line of the code merged here — GIF→WebP/AVIF
conversion or frame-rate/palette reduction changes only the files in
`assets/Gifs/` and the `require()` extensions in two `SOURCES` maps.
`expo-image` supports animated WebP natively.

**This is now the top-priority follow-up ticket.** ~22 MiB is past the point
of being deferrable indefinitely; a WebP pass would plausibly reclaim 60-80%
of it. It should be picked up before any further GIF sets are added, not
after.

### 4c. Risks that only appear on a real device or production Metro bundle

Everything below passed in Jest and would not be caught there. None is
alarming; all are worth ten minutes on a device before or shortly after
merge.

1. **Five simultaneous animated GIFs on the Companion screen.** The hero plus
   four wardrobe thumbnails now all decode and loop continuously. The four
   thumbnails share one source (`stand`), so `expo-image`'s cache should mean
   one decode — but "should" is doing work there, and animated-image decoding
   is per-view in some `expo-image` backends. On a low-end Android device
   this is the most plausible place to see jank or memory pressure. Nothing
   in the test suite can see it. **Verify on a physical mid/low-tier Android
   device.**
2. **`autoplay={false}` on web.** `app.json` configures a web target
   (`web.output: "static"`), and `autoplay` is primarily a native-side
   `expo-image` prop. If the web renderer ignores it, an OS reduce-motion
   user on web gets a looping GIF anyway — i.e. the accessibility guarantee
   this plan was careful to preserve could silently not hold on one platform.
   Jest (`jest-expo`, always `Platform.OS === 'ios'`) cannot detect this.
   **Verify with `expo start --web` and OS reduce-motion enabled.**
3. **`autoplay={false}` freezes on frame 1, whichever frame that is.** The
   test proves the prop arrives; it cannot prove the resulting still frame is
   a *flattering* one. If `foxidle_06_asleep.gif` opens mid-blink, that is
   what reduce-motion users see permanently. Cosmetic, worth one look.
4. **Metro asset resolution for 6 new `require()`d GIFs.** Standard,
   low-risk, but a release-mode bundle is the only place a missing/misnamed
   asset surfaces as a crash rather than a test failure. `expo export` or a
   release build would confirm.
5. **Initial load of a 2.4 MB GIF in a 64 px thumbnail.** The grid renders
   full-resolution `stand.gif` at 64×64. Correctness-wise fine; a
   `recyclingKey`/downscaled thumbnail variant would be the optimization.
   Rolls into the 4b compression follow-up.

### 4d. Non-risks I checked and cleared

- `idleKindForDashboard(mood, goal - calories, goal)` with `goal = 0` would
  make `remaining <= goal * 0.15` trivially true → `excited`. Unreachable in
  practice: `index.tsx:67` defaults `goal` to `2000`, and a zero-goal user
  with any calories logged resolves to `over` → `asleep` before that branch.
  Not worth defensive code.
- `FoxMood`'s move to `dashboard-logic.ts` creates no import cycle —
  `fox-idle.ts` and `fox-moments.ts` both import the type from `lib/`, and
  `lib/` imports nothing from `components/`. This actually *removed* a
  components→lib dependency inversion that existed on `main`.
- `pointerEvents="none"` on the overlay means accessories cannot block taps
  on wardrobe tiles.
- Nothing in the diff touches auth, network, storage, or the backend. No
  security surface.

---

## 5. Documentation note: the "Cozy scarf" wardrobe tile

Recorded here as tech-lead requested, because the outcome doc explains the
mechanism but never states the user-visible consequence plainly.

**Known, accepted UX quirk:** the Companion wardrobe grid's **"Cozy scarf"
tile now shows no visually-added scarf.** The grid always renders
`kind="stand"`, and `Scarf` is suppressed for `stand`/`calm` because those
two GIFs already have a blue bandana with a paw print painted into the
artwork. The same applies to the Companion hero when the scarf is unlocked
(hero renders `stand` or `calm` only).

Net effect in the shipped app: **the `Scarf` overlay never renders anywhere.**
The "Cozy scarf" tile is visually identical to a bare Foxxy apart from its
text label and its locked/unlocked opacity — and because the bandana is baked
into every frame, Foxxy *appears* to be wearing a scarf even when the item is
locked.

This is the right trade-off. The alternatives were painting a near-identical
`#3f7dd6` scarf directly on top of the existing bandana (worse — visible
double-drawing), recoloring it so it reads as distinct (worse — it stops
being the same scarf worn elsewhere, for no gain), or repositioning it, which
the pixel measurements showed collides with either the bandana or the tail
everywhere on the body. And the user-facing story still basically holds: the
fox does visibly have something around its neck.

Keeping the `Scarf` function and the kind-aware `KINDS_WITH_BAKED_IN_SCARF`
check rather than deleting the code is correct — a future idle GIF without a
baked-in bandana revives it automatically.

**Accepted as-is. Two optional future improvements, neither blocking:**
retitle the tile to something like "Cozy bandana" so the label matches what's
on screen, or dim/annotate the tile's fox in the locked state so the
baked-in bandana doesn't read as an already-unlocked item.

---

## 6. Follow-ups (none blocking this merge)

| # | Item | Priority |
|---|---|---|
| 1 | Compress the GIF set (animated WebP/AVIF, palette/frame reduction) — ~22.3 MiB in `assets/Gifs/` is the largest debt on the project. Do this before adding any further GIF set | **High** |
| 2 | Add a "re-measure these transforms if any idle GIF is replaced — no test guards this" warning at the top of `fox-wardrobe-overlay.tsx` | Medium |
| 3 | Device pass: mid/low-tier Android (5 concurrent GIFs), and web with OS reduce-motion on (`autoplay={false}` behavior) | Medium |
| 4 | Per-tile `accessibilityLabel`s on the wardrobe grid instead of five identical "Foxxy" labels | Low |
| 5 | Rename the "Cozy scarf" tile, or distinguish its locked state (§5) | Low |
| 6 | Update the recorded coverage floor to 97.81 / 89.52 / 97.79 / 99.35 in `HANDOFF.md`, and record in "Recent decisions" that the SVG→GIF direction was re-confirmed by the user this time, so a future session doesn't read the old revert as still-standing policy | Low |

---

## 7. Rationale for MERGE

The change does what the user asked, in the way the user confirmed, and
stops there. It is well-factored, follows patterns the codebase already
established, and is documented well enough that a future session can
re-derive its trickiest numbers instead of re-guessing them. All 182 tests
pass, TypeScript is unchanged from baseline, and every file this change
touches is at 100% coverage — the aggregate dip is arithmetic from deleting a
large well-tested file, not a regression.

The two real risks are both known, both bounded, and neither is made worse by
merging rather than waiting: the bundle-size debt is half pre-existing and
fixable entirely within `assets/Gifs/` later, and the coordinate fragility
produces an obvious cosmetic bug with a documented fix procedure. Nothing is
irreversible — `fox-companion.tsx` is one `git checkout main --` away if the
user changes direction a third time.

The gate worked as designed: tech-lead caught a genuine visual bug that no
amount of code reading would have surfaced, by compositing coordinates onto
the actual GIF frames. That fix landed with measurements rather than
eyeballing, and the doc records the failed first attempt honestly. I have no
further blocking findings.

**Merge.** Then file follow-up #1.

---

## 8. Follow-up round: Scarf visibility (post-verdict) — closed

§5 above recorded, as an accepted quirk, that the `Scarf` overlay rendered
**nowhere** in the shipped app: it was suppressed on `stand`/`calm`, and
those are the only two kinds any call site ever passes `wearingScarf` to. On
reflection that framing was too generous — an earnable unlock that changes
nothing on screen is a regression, not a trade-off, and the branch was
re-opened to fix it. It has now been fixed, rejected once by tech-lead on
three measured points, redrawn, and approved by a fresh tech-lead instance
that independently recomposited the new coordinates onto the real GIF frames.

**My own read of `fox-wardrobe-overlay.tsx`.** The gap is genuinely closed.
Suppression is replaced by variant *selection*: `KINDS_WITH_BAKED_IN_SCARF`
(a hide-list) is now `KINDS_WITH_BAKED_IN_BANDANA` (a pick-list), and
`stand`/`calm` render `ScarfCozyWrap` instead of nothing. The variant is
visibly a different garment from the painted-in bandana, not a second copy of
it — dusty-berry `#B85C6B` (the `protein` token) against the bandana's blue,
a draped band rather than a flat collar, and two fringed tails hanging from
y140 to y179 that are the dominant silhouette element and have no counterpart
in the baked-in art. A user unlocking "Cozy scarf" now sees a clear change.
Both prior defects are addressed rather than argued away: the stroke is `INK`
like every other accessory, and the fill is nowhere near `Backpack`'s green.

**Spot-check of the approval's numbers against the file** (not a re-do of the
compositing, which tech-lead has now done twice): band path bbox is x70–120 /
y128–150, inside the measured x64–128 silhouette window and clear of the
tail's x125+ start; tails are `Rect` x90–100 and x102–112 → x90–112;
`Backpack`'s `translate(-73,14)` on its x128–158 / y126–164 art gives
x55–85 / y140–178. All four match the claims exactly, including the
disclosed x70–85 / y140–150 corner where the drape's left shoulder meets the
Backpack's top-right. That the doc *discloses* that small overlap instead of
claiming it away — after being caught making the opposite kind of claim last
round — is the right instinct, and the residue is a stroke sliver, not a
fill-on-fill collision.

Test coverage of the behavior is real, not nominal: the suite asserts the
variant selection per kind, that the default band is absent on those kinds,
and that the two fills genuinely differ at the rendered-prop level (comparing
`react-native-svg`'s ARGB payloads rather than grepping hex strings in
source). It cannot assert placement — no unit test can — which leaves §4a's
coordinate fragility exactly where it was.

**Final numbers, re-run by me in `first game test 4/app`:**

```
npx jest --coverage   → exit 0
Test Suites: 25 passed, 25 total
Tests:       183 passed, 183 total
All files    | 97.82 % Stmts | 89.52 % Branch | 97.81 % Funcs | 99.35 % Lines
fox-wardrobe-overlay.tsx | 100 | 100 | 100 | 100

npx tsc --noEmit      → the same 3 pre-existing errors, no new ones
  animated-icon.tsx(150,5) TS2698
  app-tabs.web.tsx(71,15)  TS2322
  ui/collapsible.tsx(22,13) TS2322
```

These match the outcome doc exactly, and clear the floor §3 reset
(97.81 / 89.52 / 97.79 / 99.35) on all four metrics — statements and
functions each up fractionally, branches and lines flat, on one more test.

**Decision: still ✅ MERGE.** Nothing changed my mind; the branch is strictly
better than when I first approved it. §5's "accepted UX quirk" is now
**resolved rather than accepted** — treat that section as superseded by this
one. Follow-up #5 shrinks but does not vanish: renaming the tile is moot now
that the overlay is a distinct garment, but the locked-state issue stands —
the baked-in bandana still makes Foxxy look like she's wearing something
before the item is earned. Follow-up #1 (GIF compression, ~22.3 MiB) remains
the top-priority ticket and is untouched by this round. Follow-ups #2, #3,
#4 are unchanged, and #2 matters slightly more now that a fourth accessory
depends on measured coordinates.

---

*Reviewed by: Opus CTO gate. Nothing was merged or committed by this review.*
