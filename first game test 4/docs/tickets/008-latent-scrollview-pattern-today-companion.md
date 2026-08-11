# Ticket 008: Investigate (and fix if real) the latent ScrollView shrink-to-fit pattern flagged in ticket 006's CTO verdict

Status: **Complete** — implemented, reviewed, CTO verdict MERGE. Awaiting merge to `main`.

## Summary

Ticket 006's CTO verdict (finding N10) flagged that `app/src/app/(tabs)/index.tsx`
and `app/src/app/(tabs)/companion.tsx` share "the same latent shrink-to-fit
`ScrollView` pattern" that caused the real, tech-lead-caught bug in
`log.tsx` — where the Log tab's header rendered outside the viewport at
narrow web widths because the outer `ScrollView` had no `style` prop and
shrank to fit a wide child's intrinsic content under a parent with
`alignItems: 'center'`.

## Before assuming the bug is real: a structural difference worth checking

Reading the actual code, `index.tsx` and `companion.tsx` are NOT structured
identically to `log.tsx`'s pre-fix state:

- **`log.tsx` (pre-fix)**: `<ThemedView style={{flex:1, alignItems:'center'}}>` directly
  wraps `<ScrollView contentContainerStyle={...}>` with no `style` prop on
  the ScrollView itself. Because the parent's `alignItems: 'center'` only
  auto-stretches children that don't set their own width, and the
  ScrollView had none, it shrank to fit its widest content (the horizontal
  Quick Stash row) and that width bubbled outward.
- **`index.tsx` / `companion.tsx`**: `<ThemedView style={{flex:1, alignItems:'center'}}>`
  wraps a `<SafeAreaView style={{flex:1, width:'100%', maxWidth: 800}}>`,
  which in turn wraps the `<ScrollView contentContainerStyle={...}>` (also
  no `style` prop on the ScrollView itself). The key difference: the
  `SafeAreaView` has an *explicit* `width: '100%'`, and does **not**
  override `alignItems` (Yoga/Flexbox's default is `stretch`, not
  `center`), so its only child — the ScrollView — should stretch to fill
  the SafeAreaView's already-width-constrained box, rather than
  shrink-to-fit like `log.tsx`'s ScrollView did when it was a *direct*
  child of the `alignItems: 'center'` container.

This suggests `index.tsx`/`companion.tsx` may not actually be exposed to
the same failure mode as `log.tsx` was — the `SafeAreaView` wrapper may
already break the exact mechanism that caused the bug. This needs to be
verified empirically (a live/rendered probe with a deliberately wide child
forced into one of these screens at a narrow viewport), not assumed either
way from reading styles alone — react-native-web's actual flex-resolution
behavior has already surprised this project once during ticket 006's
investigation.

## Scope

1. **Investigate first.** Confirm via an actual rendered probe (e.g.
   temporarily injecting a wide row of fixed-width items into Today or
   Companion, taking a screenshot/measuring computed `scrollWidth` at a
   narrow viewport, then removing the probe) whether the bug is real here
   or whether the `SafeAreaView` wrapper already prevents it.
2. **If real**: apply the same fix pattern already shipped in ticket 006's
   fix to `log.tsx` — an explicit `style` on the ScrollView (or equivalent
   containment) so any future wide child can't bubble its width upward.
3. **If not real**: document why (the `SafeAreaView`/`alignItems` mechanism
   above, empirically confirmed) so this finding is closed with evidence
   rather than deferred indefinitely, and note it so a future reader
   doesn't re-flag the same non-issue.
4. Either way: no behavior change to anything currently visible on these
   two screens at normal widths — this is either a preventive fix or a
   documented non-issue, not a visible bug fix today.

## Acceptance criteria

- [x] A genuine empirical test (not just reasoning about styles) settles
      whether `index.tsx`/`companion.tsx` are actually exposed to the
      shrink-to-fit bug class.
- [x] N/A — not exposed, so there was no live defect to fix. The
      defensive `alignSelf: 'stretch'` fix was applied anyway (see
      outcome doc) to close the implicit-default dependency, and the
      probe was fully removed.
- [x] If not exposed: outcome doc states the mechanism clearly enough that
      this doesn't get re-flagged as an open risk in a future verdict.
- [x] No regression to either screen at normal widths.
- [x] No other files change.

## Pipeline

Full ticketed-change + gated-build cycle, consistent with tickets 004-007:
plan → tech-lead review → explicit user go-ahead → Sonnet build → Sonnet QA
→ Opus tech-lead → Opus CTO verdict → outcome/verdict docs → commit only on
explicit request.
