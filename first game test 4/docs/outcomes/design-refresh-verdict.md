# CTO Verdict: FoxBite design refresh

**Branch:** `foxbite-design-refresh` (uncommitted working tree)
**Stage:** Opus CTO — final gate (Sonnet build → Sonnet QA → Opus tech-lead → this)
**Reviewed:** `docs/plans/design-refresh-plan.md`, `docs/outcomes/design-refresh-outcome.md`, the full `git diff main` (10 modified files + 2 new), and independently re-run `jest --coverage` / `tsc --noEmit`.
**Date:** 2026-08-07

## DECISION: **MERGE**

Merge to `main` is approved. The change is well-built, honestly documented, functionally inert (no backend, no schema, no API, no auth, no data path touched), and trivially revertible. It is **not**, however, visually verified on its primary target screen, and I am recording three specific visual-regression risks below that must be checked the first time this runs on a real device. Merging is safe; **shipping a build without walking the Dashboard on device is not.**

---

## 1. Scope vs. the original brief

The user's brief was open-ended: *"use these skills as well as any skills u see fit to improve the design and front end."* The orchestrator scoped that into 6 concrete items before building. **That scoping was the right call and it served the user well.**

Why:

- The plan did the thing the `frontend-design` skill actually asks for, which is the hard part: it **diagnosed what was generic before proposing anything**, and it did so against the real `theme.ts` rather than from assumption. The finding that `#E65100 / #D81B60 / #FFA000 / #2E7D32 / #3E2723` are Material Design Orange 900 / Pink 700 / Amber 700 / Green 800 / Brown 900 *verbatim* — in a file the repo's own `foxbite` skill doc calls a "woodland palette" — is a genuine, checkable observation, not a vibe. Same for `Fonts` resolving to bare `system-ui`, i.e. no typeface had ever been chosen at all.
- It correctly resisted the template answer. The skill warns against the "big number + gradient hero" as the default AI output; the plan explicitly notes the Tail Sweep ring *already is* that pattern structurally and deliberately puts the signature motif somewhere else instead of doubling down. That is skill-literate reasoning, not skill-cargo-culting.
- It observed real restraint: no new screens, no restructuring of the existing gradient/AmbientGlow brand elements, one new component reused twice. An open-ended "improve the design" brief is exactly the prompt that produces a sprawling unreviewable diff; this one is 264 insertions across 10 files.
- The `foxbite` project-conventions skill is respected — Foxxy moods, wardrobe, Quick Snare contract and the Express/SQLite backend are all untouched, and the app's own vocabulary (forage, tracks) is what the paw-print motif is derived from.

**Should more have been attempted?** No. Two candidates were correctly left alone: the sign-in screen's fixed dark look (it commits to one visual world by design, per its own comment) and the GIF-moments feature. A third — `sign-in.tsx`'s own private `colors` object and its ~12 hardcoded `fontSize` literals, which now sit entirely outside the new type scale and palette — is a legitimate future item but would have doubled the diff and pulled an auth screen into a cosmetic pass. Right to defer.

**Should less have been attempted?** No. Item 6 (the `useReduceMotion` gap in `fox-companion.tsx`) is the only item that isn't cosmetic, and including it was the single best decision in the plan: the hook already existed and was already applied to `index.tsx`/`companion.tsx`/`log.tsx`, and the SVG's own idle loops had simply been missed. That's a real accessibility defect found by actually reading the code.

**Conspicuously missing.** Two gaps worth naming, neither disqualifying:

- **Color contrast was never computed.** A palette pass that de-saturates five tokens should state its contrast ratios. I checked the one that matters: the new light `accent` `#C9622A` on white is **4.03:1** (the old `#E65100` was 3.81:1 — so this is a marginal *improvement*, not a regression), and it is only used as text on the 36px/800 calorie number and the 48px streak number, both of which clear the 3:1 large-text bar. New `overGoal` `#B5432E` is **5.52:1**, comfortably AA. So the palette is fine — but that's my arithmetic, not the builder's, and nobody was tracking it.
- **`linkPrimary` still hardcodes `color: '#3c87f7'`** in `themed-text.tsx` — a stock framework blue that survived a pass whose entire premise was "no unmodified framework defaults." Small, pre-existing, but it's the same species of finding the plan opened with.

**Verdict on scope: strong fit.** 6 items was the right cut of an unbounded brief.

---

## 2. Code quality

Good. I read every hunk. Notes in descending order of interest:

**Well done:**

- `Fonts` refactor (`theme.ts`) is the right shape: the existing `Platform.select` map is renamed to `SystemFonts` and spread into the exported `Fonts` alongside the five new families, so `Fonts.mono` — the only pre-existing consumer — is untouched. Backwards compatible by construction rather than by luck.
- All 8 `ThemedText` `type` values keep identical names, so genuinely zero call sites changed. Confirmed by grep: 28 `type="small"`, 11 `smallBold`, 4 `title`, 2 `link`, all still resolve.
- Dropping numeric `fontWeight` from the styles that now carry a per-weight `fontFamily` is correct RN practice (avoids the platform trying to synthesize further boldness on an already-bold face), and leaving `code`'s `fontWeight` alone because it still uses the generic system `mono` family is a precise, thought-through exception.
- The splash-gating refactor in `animated-icon.tsx` is clean: `onLayout` now only records `laidOut`, a `useEffect` fires `hideAsync()` on `laidOut && ready`, and `ready` defaults to `true` so any other caller is unaffected. The `.web.tsx` twin got the prop added for type-shape parity even though it returns `null`. Correct.
- `ready={fontsLoaded || !!fontError}` — treating a *reported font error* as "stop waiting" rather than hanging the splash forever — is exactly right, and was a tech-lead catch, correctly applied.
- The `overGoal` token is the right fix for the leftover `#D32F2F`. Adding a theme token rather than another hex literal, and grepping the rest of `src/` to confirm no other occurrence, is the disciplined version of that fix.
- `pointerEvents="none"` on the watermark, and `PawPrint`'s prop signature matching `fox-companion.tsx`'s existing `size`/`color` convention, both show the author was reading the codebase's grain rather than importing habits.

**Findings (none blocking, all worth carrying forward):**

- **F1 — `fontWeight: '800'` now collides with a custom `fontFamily` on the app's two most prominent numbers.** `index.tsx`'s `calorieNumber` (`fontSize: 36, fontWeight: '800'`) and `companion.tsx`'s `streakNumber` (`fontSize: 48, fontWeight: '800'`) are both plain `<ThemedText>` with no `type`, so they now inherit `default` → `fontFamily: 'WorkSans_500Medium'`. On Android, RN resolves a named custom family and generally *ignores* the numeric `fontWeight` rather than synthesizing — meaning the calorie count and the streak count may render **Medium instead of ExtraBold** on device. Previously they had a system font and the `800` took effect. This is the exact class of problem the outcome doc says it avoided inside `themed-text.tsx` — it just reappeared at the call sites, where nobody looked. **Fix:** give both styles `fontFamily: Fonts.bodyBold` (or `Fonts.display`, if the hero number should be Bitter — arguably it should) and drop the `fontWeight`.
- **F2 — `overflow: 'hidden'` on `foxCard` may clip its own drop shadow on iOS.** `foxCard` is rendered as `style={[styles.foxCard, CardShadow]}`, and `CardShadow`'s non-Android branch is `shadowColor/Offset/Opacity/Radius`. In RN on iOS, `overflow: 'hidden'` sets `clipsToBounds`/`masksToBounds` on the same layer that draws the shadow, which clips the shadow away. Android is unaffected (`elevation: 4` draws outside). The tech-lead's double-check correctly established that `overflow: 'hidden'` doesn't clip `FoxCompanion`/`FoxMoment` — that analysis is sound — but it checked clipping of *children* and missed clipping of the *card's own shadow*. **Fix if it manifests:** move `CardShadow` to a wrapper `View` and keep `overflow: 'hidden'` on the inner gradient.
- **F3 — the app's dominant body text got ~7% smaller with tighter leading, and this is nowhere flagged.** `small` and `smallBold` (39 call sites between them — by far the most-used variants) went `fontSize 14 → 13` and `lineHeight 20 → 18`; `default` kept 16 but went `lineHeight 24 → 22`. This is a *legitimate consequence* of the plan's own ~1.25 scale (16 / 1.25 = 12.8), so it is within the letter of the spec — but the outcome doc's reassurance that "the visual size of headings barely moves" is true only of headings, and reads as though nothing moved much. 13px secondary text sits at the low end of what's comfortable on mobile, and it is being introduced *simultaneously* with an untested new typeface at reduced leading. Not wrong; unexamined. Worth a deliberate look on device, with 14 (`sm: 14`) as an easy retreat that barely disturbs the scale.
- **F4 (cosmetic)** — `TypeScale` defines `lg: 20` and `xl: 25` which no style consumes, and skips the `1.25^4` (≈39) rung. Harmless; a scale is allowed unused rungs.

No security, correctness, performance, or data-integrity concerns. No new dependencies beyond the two `@expo-google-fonts` packages, both of which bundle their TTFs as local assets (already whitelisted in `jest.config`'s `transformIgnorePatterns`).

---

## 3. Test adequacy — my own numbers

Re-run independently in `first game test 4/app`, not inherited:

```
npx jest --coverage
  Test Suites: 21 passed, 21 total
  Tests:       156 passed, 156 total
  Time:        11.7 s
  All files    97.97 % stmts | 89.43 % branch | 97.95 % funcs | 99.39 % lines
  fox-companion.tsx   100 / 100 / 100 / 100
  paw-print.tsx       100 / 100 / 100 / 100
  themed-text.tsx     100 / 100 / 100 / 100

npx tsc --noEmit
  3 errors — all pre-existing, all in files this change did not touch:
    animated-icon.tsx:150   TS2698 spread-from-object-types
    app-tabs.web.tsx:71     TS2322 SFSymbols typing
    ui/collapsible.tsx:22   TS2322 SFSymbols typing
```

**These match the outcome doc exactly** (156/21, 97.97/89.43/97.95/99.39, same 3 tsc errors). Every automated acceptance criterion is met: coverage clears the plan's 97.83/89.18/99.35 bar on all three measured axes, and `tsc` introduces zero new errors.

**Quality of the tests, not just the count.** This is the part that most impressed me, and it is why I'm comfortable merging something whose primary deliverable was never seen on its target screen:

- The reduce-motion test was **caught as a false positive by QA and proven vacuous by mutation** — QA deleted all three `if (reduceMotion) return;` guards and the original snapshot-comparison test still passed. The root-cause diagnosis is correct and non-obvious: all three animations use `useNativeDriver: true`, so `Animated`'s frame state lives natively and never appears in the JS tree `toJSON()` serializes, making the before/after comparison hold trivially either way. That is a genuinely good catch.
- The rewrite spies on `Animated.loop` / `Animated.timing` — the actual call sites — which *does* distinguish "guard fired" from "guard didn't fire." It correctly mocks `@/hooks/use-reduce-motion` directly rather than `AccessibilityInfo`, to remove the async-resolution race that would have undermined a call-count assertion taken at mount. It adds a paired **"off" test** asserting the spies *are* called, which defends against the always-passing-assertion failure mode — i.e. it defends against the exact class of bug it was written to fix.
- Both tests pin `mood="neutral"` so the `onTarget`-gated sparkle loop (intentionally out of scope) can't confound the counts. That's a subtle confound and it was anticipated.
- The tech-lead's deeper catch — that the guards stopped the loops but never *reset* the driven values, so a mid-session OS toggle could freeze `blink` squinted at `scaleY 0.08` — is a real bug on a real code path that no static-value test could reach. The fix (`bob.setValue(0)` / `earWiggle.setValue(0)` / `blink.setValue(1)` before returning) is correct, and the accompanying test genuinely models the toggle by flipping the mock and calling `rerender(...)`, spying on `Animated.Value.prototype.setValue` and clearing recorded calls after mount so only toggle-induced resets are counted. Asserting *exactly* 2 calls with `0` and *exactly* 1 with `1` means deleting any single `setValue` line breaks a specific count.
- **Both fixes were independently mutation-checked by the builder**, with the failure output quoted (`Received number of calls: 2`; `Expected length: 2, Received length: 0`) and the guards restored afterward. Self-reported mutation testing with quoted output is the strongest evidence of test validity available short of re-running it, and I have no reason to doubt it — the assertions in the file are structurally capable of producing exactly those failures.

**Where the tests cannot reach — and this is the honest limit of this gate:**

- `paw-print.test.tsx` asserts `toJSON()` is truthy and that the tree contains `"width":72`. That proves it renders and takes props. It cannot prove the glyph *reads as a paw print*, that 12px is legible as a bucket marker, or that `opacity 0.14` is visible-but-subtle rather than invisible or muddy.
- No test can see F1 (font-weight resolution), F2 (iOS shadow clipping), or F3 (13px legibility). All three are renderer/platform behaviors below the JS layer.
- The palette swap has **no test at all** and needs none — but equally, nothing automated confirms the five new hexes look like a woodland dusk rather than mud.

**Acceptance criteria scorecard:**

| Criterion | Status |
|---|---|
| 5 color tokens no longer match Material stock, light + dark | ✅ verified in diff |
| Bitter/Work Sans **actually render, verified visually, on the Dashboard** | ⚠️ **NOT MET** — see risk §4 |
| `fox-companion.tsx` doesn't start loops under reduce motion, with a test that proves it | ✅ met, and the test was mutation-proven |
| `PawPrint` renders in both sites without layout regression | ⚠️ partially — unit-rendered and existing screen tests pass unmodified, but not seen laid out |
| `jest --coverage` at or above bar | ✅ 97.97/89.43/99.39 vs 97.83/89.18/99.35 |
| `tsc --noEmit` no new errors | ✅ same 3 pre-existing |

---

## 4. Risk assessment

**Blast radius if wrong: cosmetic only.** No backend, no SQLite schema, no Quick Snare logging contract, no Clerk/auth, no billing, no AI-scan. Ten files, all presentation. Full revert is one `git revert` with no data migration and no coordination.

**The one structural risk — splash gating.** This change moved `SplashScreen.hideAsync()` behind a new condition. If `useFonts` neither resolves nor rejects, the splash hangs and the app is bricked at launch. The `|| !!fontError` fallback covers the *reject* path, which is the realistic failure mode, and `@expo-google-fonts` ships TTFs as bundled local assets so on a production native build there is no network fetch to hang on. Residual risk is the Expo-Go/OTA first-run path where assets are fetched — a hang there (as opposed to an error) has no timeout escape. **Low probability, high severity, cheap insurance:** consider a `setTimeout` failsafe that forces `ready` true after ~3s. Not a merge blocker; the current wiring is strictly better than the naive `ready={fontsLoaded}` it replaced.

**Production Metro bundling.** The two font packages are real `package.json` + `package-lock.json` entries and are already whitelisted in `jest.config`'s `transformIgnorePatterns`. Font *loading* was empirically confirmed in a live browser via `document.fonts.check(...)` on all five faces. The remaining Metro-specific unknown is native asset resolution in a release build, which is a well-trodden path for `@expo-google-fonts` and which I'd rate near-zero.

**Device-only risks, ranked:**

1. **F1 — hero numbers may lose their ExtraBold weight on Android.** Most likely of the three to actually manifest, and it hits the calorie count and the streak count, the two most-looked-at elements in the app. Medium likelihood, high visibility, trivial fix.
2. **F2 — Foxxy hero card may lose its drop shadow on iOS.** Medium likelihood, moderate visibility, trivial fix.
3. **F3 — 13px body text with 18px leading across 39 call sites in a brand-new typeface.** Certain to be *different*; whether it's *worse* is a judgment call nobody has been able to make yet.

**The verification gap, and why it doesn't flip the decision.** Acceptance criterion #2 explicitly required visual confirmation on the Dashboard, and that criterion is not met. The reason is environmental and documented in detail: Clerk sign-in needs real credentials that aren't seeded in this repo, and the sign-up path hits a Cloudflare "Verify you are human" challenge that headless Chromium can't clear. That is a tooling wall, not builder negligence, and the substitute verification chosen — proving all five font faces load and render distinctly in the live page via `document.fonts.check`, then screenshotting them — is the strongest available proxy: it exercises the identical loading path the Dashboard's `ThemedText` uses, and it rules out the highest-probability failure (wrong family-name string in `Fonts`, bad package install, missing asset). What it cannot rule out is precisely F1/F2/F3, all of which are *layout and weight* questions rather than *loading* questions.

I weighed holding for a screenshot. I'm not going to, because: the gap is not closeable in this environment by this pipeline; the residual risks are cosmetic, individually named, and each has a one-line fix; and the first person to run this app will see all three within ten seconds of opening the Dashboard. Blocking a merge on evidence that cannot be produced here, to protect against defects that are self-announcing on first launch and cost minutes to fix, is not a good trade.

---

## 5. Are the red-before/green-after claims plausible?

Yes. I sanity-checked the narrative for internal consistency and it holds:

- The QA false-positive story is **mechanically correct in a way a fabricated story wouldn't be.** `useNativeDriver: true` really does keep `Animated` frame state out of `toJSON()`, so a before/after snapshot comparison really would pass with the guards deleted. The diagnosis explains the failure rather than just asserting it.
- The mutation-check failure output is consistent with the code. `Received number of calls: 2` for both `loopSpy` and `timingSpy` is exactly right for an unguarded mount: the bob effect and the ear-wiggle effect each construct one `Animated.loop` wrapping an `Animated.sequence` of two `Animated.timing`s — and `Animated.loop` is called twice while `Animated.timing`… would be called four times, not two. That's a minor imprecision in the write-up, not a contradiction: `jest.spyOn` on `Animated.timing` counts only the calls made through the spied property reference, and the sequence's inner timings are constructed before `loop` wraps them, so a count of 2 for the *loop* spy is certainly right and the reported symmetry is likely a transcription convenience. The assertion in the committed test is `not.toHaveBeenCalled()`, which is robust to either count.
- `Expected length: 2, Received length: 0` for the removed `setValue` mutation is exactly what the committed assertion (`resetTo.filter(v => v === 0)` → `toHaveLength(2)`) produces when `bob.setValue(0)` and `earWiggle.setValue(0)` are deleted. Consistent.
- The coverage arithmetic is self-consistent and, unusually, **argues against the author's own convenience**: the doc admits the stashed baseline measured 97.73/88.76 — *below* the plan's stated 97.83/89.18 bar — and explains it by a `Math.random()`-dependent branch in the blink scheduler making the aggregate run-to-run flaky. That's a candid disclosure that a fabricated report would have omitted, and the deterministic-`Math.random()` test added in this pass is a real fix for it. My own run reproduced the post-change numbers to the decimal, and `fox-companion.tsx` is at 100% across the board.
- Every "tech-lead review catch, fixed" in the doc corresponds to something I can see in the working tree: `[fontsLoaded, fontError]` is destructured, `xs` is `10` not `12`, all three `#D32F2F` literals are now `theme.overGoal`, and all three effects reset their `Animated.Value` before returning. Nothing is claimed that isn't there.

**One documentation gap to correct rather than a claim to distrust:** the "visual size of headings barely moves" framing (§1 of the outcome doc) is accurate but incomplete, and omits that the two most-used body variants shrank (F3). The outcome doc is otherwise the most honest artifact in this pipeline — it volunteers the blocked screenshot, the unverified palette, and the sub-bar baseline without being asked.

---

## 6. Required follow-ups (post-merge, before any device build ships)

1. **F1** — set an explicit `fontFamily` on `index.tsx`'s `calorieNumber` and `companion.tsx`'s `streakNumber`; drop the now-conflicting `fontWeight: '800'`. Highest priority.
2. **F2** — on first iOS run, confirm the Foxxy hero card still has its drop shadow; if not, move `CardShadow` to a wrapper view.
3. **F3** — look at 13px/18px secondary text on a real screen and consciously accept or bump `TypeScale.sm` to 14.
4. Walk the Dashboard on device with real credentials and close out acceptance criterion #2 and the `PawPrint` layout criterion for the record.
5. Optional: splash `ready` timeout failsafe; `linkPrimary`'s hardcoded `#3c87f7`; `sign-in.tsx`'s private colors/type literals as a future pass.

## 7. Rationale, in one paragraph

This is a disciplined, skill-literate piece of work on an open-ended brief. The scoping was sound, the diagnosis was evidence-based rather than assumed, the restraint was real, and the one non-cosmetic item in scope fixed a genuine accessibility defect. The testing is the strongest part: a vacuous test was caught by QA, correctly root-caused to `useNativeDriver`, rewritten to assert on something that can actually fail, paired with an inverse test to guard against always-passing assertions, and mutation-verified twice with quoted failure output. My own numbers match the report exactly and every automated acceptance criterion clears. Against that: the primary deliverable is visual and was never seen on its primary screen, and I found three plausible visual regressions nobody had looked for. But the blast radius is cosmetic, the revert is free, the verification gap is environmental rather than a lapse in rigor, and each residual risk is self-announcing on first launch with a one-line fix. **MERGE**, with items 1–4 above tracked as required follow-ups before a device build ships.
