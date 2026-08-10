# CTO Verdict: Ticket 007 — Log tab disappears when the native speech-recognition module isn't linked

Ticket: `docs/tickets/007-log-tab-crashes-without-speech-recognition.md`
Plan: `docs/plans/log-tab-crashes-without-speech-recognition-plan.md`
Outcome: `docs/outcomes/log-tab-speech-recognition-guard-outcome.md`
Branch: `foxbite-log-tab-speech-recognition-guard`
Reviewer: Opus (CTO gate)
Date: 2026-08-11

## Decision

# MERGE

Approved for commit and merge to `main` as-is. Four non-blocking findings
(C1–C4) are recorded below; none of them gates the merge, and C2 is a
three-line documentation touch-up the committer may fold in if convenient.

## Model-tiering caveat (stated per standing convention)

This account is on Claude Pro **without Fable access**, so Opus stands in for
the CTO role that this pipeline normally assigns to Fable. This is a
documented fallback, and it has a real cost that must be stated rather than
glossed: the review chain collapses from three distinct models to two —
**Sonnet** (build + QA), **Opus** (tech-lead implementation review), **Opus**
(this CTO gate). The tech-lead and CTO stages therefore share a model family,
its blind spots, and its priors. They are not truly independent reviews in the
sense the pipeline design intends; the CTO gate here is better understood as a
*second pass with fresh context and a different mandate* than as an
independent model's opinion.

Mitigation applied: rather than reasoning from the tech-lead's and QA's
reports, this gate re-derived its evidence from scratch — re-running the full
suite and typecheck, reading every changed file end to end, and performing two
**independent mutation tests** (below) rather than accepting QA's mutation
claim on trust. That is the strongest available substitute for genuine model
independence, but it is a substitute.

## Verification performed at this gate (not inherited)

| Check | Result |
| --- | --- |
| `npx jest` (bare, in `app/`) | **37 suites, 316 tests, all passing** — matches the outcome doc exactly |
| `npx tsc --noEmit` | **3 errors, all pre-existing** (`animated-icon.tsx:150` TS2698, `app-tabs.web.tsx:72` TS2322, `collapsible.tsx:22` TS2322). None touches `log.tsx` or the new wrapper. No new errors. |
| `git status` / `git diff` | Working tree contains exactly the claimed set: 2 modified (`log.tsx`, `log.test.tsx`), 4 new (wrapper + 3 test files), 3 new docs. No stray edits. |
| `log.tsx` diff read line by line | 18 insertions / 11 deletions, all four raw-module call sites swapped, import replaced, sublabel ternary added. Nothing else touched. |
| Repo-wide grep for `expo-speech-recognition` | Only the wrapper, `log.test.tsx`'s intentional mock, and test comments. `log.tsx` genuinely no longer references the raw package or `ExpoSpeechRecognitionModule`. |
| Route-file native-import audit (all of `src/app/**`) | No other route file imports a non-Expo-Go-bundled native module (see C4). |

## Scope vs plan

**Faithful, with no scope creep and no under-delivery.** Every item the plan
specified is present, and nothing beyond it is:

- New wrapper at `app/src/lib/speech-recognition.ts` — implemented
  essentially verbatim from the plan's tsc-prototyped snippet, including the
  deliberate rejection of the nullable-module-handle design that round 1 of
  plan review proved produces TS18047 errors at the call sites.
- All **four** enumerated raw-module call sites swapped (result handler's
  `stop`, `requestPermissionsAsync`, `start`, `cancelListening`'s `stop`).
  Verified individually in the diff; the plan's enumeration was complete.
- The plan's `import type` statement-form instruction honoured (line 1–4 of
  the wrapper), not the inline `import { type X }` form.
- UX per plan revision 2: sublabel ternary (always-visible honest state) plus
  the on-tap guard message, tile left tappable, icon/label/`onPress`
  unchanged.
- The existing `jest.mock('expo-speech-recognition', ...)` in `log.test.tsx`
  was **not** moved or altered, exactly as the plan required — the two
  mocking strategies live in separate files, which is the only thing Jest's
  hoisted, file-scoped `jest.mock` actually permits.
- Verification run bare rather than `--testPathPattern tabs`, per the plan's
  explicit warning — otherwise `src/lib/__tests__/speech-recognition.test.ts`
  would silently never run. Confirmed independently at this gate.
- Non-goals respected: no Barcode Hunt/camera changes, no `app.json` change,
  the ticket-006 N10 ScrollView finding correctly left alone.

The plan's two review rounds paid for themselves. The nullable-handle rejection
and the "Jest cannot do describe-scoped mock opt-out" correction are both
visible in the shipped code as design constraints that were *already settled*
before the build started, rather than as churn discovered during it.

## Code quality

**Wrapper (`app/src/lib/speech-recognition.ts`), 53 lines.** This is the right
shape for the problem. The whole risk is contained in one file, at module
scope, resolved exactly once, and every consumer sees a total (never-throwing,
never-nullable) function surface. `log.tsx` cannot reintroduce the bug without
deleting an import.

Two specific things this file gets right that are easy to get wrong:

1. **The `require()` runs exactly once at module scope, inside the try/catch.**
   The comment cites Metro's actual `loadModuleImplementation` behaviour —
   a factory throw is rethrown synchronously and the failure is cached, so
   there is no half-initialized-exports hazard and no benefit to retrying.
   That reasoning is correct and is the load-bearing justification for the
   pattern.
2. **The no-op `useSpeechRecognitionEvent` fallback is genuinely
   hooks-safe**, and the comment explains *why* in terms of the actual
   invariant (availability is resolved once per JS context and cannot flip
   mid-session, so the hook-call shape inside any consumer is stable across
   every render), including the condition under which it would *not* be safe.
   This is the kind of comment that survives contact with a future reader.

**N1 (missing wrapper comments) is genuinely closed, not paved over.** The two
comment blocks are 8 and 6 lines and they do the specific job the plan asked
for: the first opens with "This try/catch is load-bearing — do not 'simplify'
it back into a static import", then gives the mechanism (module-scope
`requireNativeModule` throws → Expo Router eagerly requires every route file →
whole Log tab dropped), then names the ticket. A future cleanup pass has to
read past an explicit prohibition *and* its causal explanation to reintroduce
the bug. That is exactly the failure mode N1 existed to prevent. They are not
decorative comments restating the code.

**`log.tsx`.** The guard is placed correctly — *before* the
`voiceStartInFlightRef` in-flight check, so the unavailable message is never
suppressed by an unrelated re-entrancy guard, and the guard's early `return`
never touches the ref (so it can't leave it stuck true). The sublabel ternary
is a one-line change on an existing prop with no new component, consistent
with how this screen already surfaces recoverable state. The error string
reuses the existing `error`/`ThemedText` display. Minimal, idiomatic, in
keeping with the file's existing style.

**Findings.**

- **C1 (non-blocking, latent correctness nit).**
  `isSpeechRecognitionAvailable` is derived from `speechModule !== null`, but
  every call path is gated on `nativeModule` (`speechModule
  ?.ExpoSpeechRecognitionModule ?? null`). These two can diverge: if the
  package ever resolves successfully but doesn't expose
  `ExpoSpeechRecognitionModule`, `isSpeechRecognitionAvailable` reports
  `true` while `startSpeechRecognition`/`stopSpeechRecognition` silently
  no-op and `requestSpeechPermissions` returns `{ granted: false }` — i.e.
  the UI would advertise Voice Input as working and then produce a
  permission-denied error it can never clear. That is precisely the
  "silently-broken button" the ticket's acceptance criteria forbid. It is
  **currently unreachable** (the package's module-scope `requireNativeModule`
  throws before a partial-export state is observable), which is why this is a
  nit and not a blocker. Deriving the flag from `nativeModule !== null`
  instead would close the divergence at zero cost and would not disturb any
  existing test (`log.test.tsx`'s mock supplies a real
  `ExpoSpeechRecognitionModule` object, so it still resolves `true`).
  Optional; safe to defer.
- Minor wording note (no action needed): the sublabel says "Needs the full app
  build" while the tap message says "not available in this preview". Both are
  honest and mutually consistent; "preview" is slightly softer language for
  what is concretely Expo Go. Acceptable.

## Test adequacy

**The mutation evidence.** I did not take QA's mutation report on trust; I ran
two mutations of my own from a clean, green baseline (37/316) and restored
after each, re-confirming 37/316 green at the end.

**Mutation A — reintroduce the actual ticket-007 bug.** Replaced the wrapper's
`try { require(...) } catch { null }` with a bare unguarded `require(...)`,
which is behaviourally identical to the static import that caused the
original outage.

| Suite | Under mutation A |
| --- | --- |
| `src/lib/__tests__/speech-recognition.test.ts` | **FAIL** (suite fails at module load) |
| `src/app/(tabs)/__tests__/log-no-speech-real-wrapper.test.tsx` | **FAIL** (suite fails at module load) |
| `src/app/(tabs)/__tests__/log-no-speech.test.tsx` | PASS — does not detect the bug |
| `src/app/(tabs)/__tests__/log.test.tsx` | PASS — does not detect the bug |
| Totals | 2 suites failed, 35 passed |

This is the single most important result in this review, and it settles the N2
question definitively. **Before the tech-lead added
`log-no-speech-real-wrapper.test.tsx`, no test that rendered `LogScreen` would
have gone red if someone reverted the guard.** The mocked-wrapper file
(`log-no-speech.test.tsx`) stays green under the real bug, because mocking
`@/lib/speech-recognition` is precisely what removes the failure from the
module graph. **N2 was a real gap, not a hypothetical one, and the added file
genuinely closes it** — it is now the only test that both renders the route
component and fails when the bug returns.

**Mutation B — revert `log.tsx`'s guard and sublabel** (removed the
`!isSpeechRecognitionAvailable` early return and restored the hardcoded
`sublabel="Say what you ate"`). Result: **4 tests failed, 312 passed** —
2 in `log-no-speech.test.tsx` (sublabel assertion, on-tap message assertion)
and 2 in `log-no-speech-real-wrapper.test.tsx` (render assertion, on-tap
message assertion). `speech-recognition.test.ts` correctly stayed green (it
tests the wrapper, not the screen), and `log.test.tsx`'s 21 available-path
tests correctly stayed green (the available path is genuinely unaffected).
This is directionally consistent with QA's reported 2/3-red result at the time
they ran it, and it confirms both halves of the `log.tsx` change are pinned by
assertions rather than merely present.

Together, A and B establish that the guard, the sublabel, *and* the wrapper's
try/catch are each independently load-bearing and independently detected. That
is a materially stronger evidence base than "the tests pass."

**Does the 4-file split make sense, or is it redundant?** It makes sense. Each
file carries at least one thing no other file can carry, and I would reject a
proposal to consolidate them:

1. `src/lib/__tests__/speech-recognition.test.ts` — unit-level contract on the
   wrapper itself, unmocked. Only place asserting the *shape* of the degraded
   contract (`{ granted: false }` specifically, and that the void functions
   don't throw). Fails under mutation A.
2. `log-no-speech.test.tsx` (wrapper mocked) — the only file that can assert
   the **negative**: that `requestSpeechPermissions` and
   `startSpeechRecognition` were *never called*. The real-wrapper file
   structurally cannot make that assertion, because with the real wrapper
   those exports aren't jest mocks. It is also the only file asserting the
   other three hub tiles are unaffected in the degraded state. Weakest of the
   four (green under mutation A) but not redundant.
3. `log-no-speech-real-wrapper.test.tsx` — the end-to-end composition that
   *is* the bug: real wrapper + real `log.tsx` + live React render. Highest
   value of the four per mutation A. Also the only test that exercises the
   no-op `useSpeechRecognitionEvent` fallback surviving an actual render.
4. `log.test.tsx`'s new sanity test — an **anti-vacuity guard**, not a feature
   test. Without it, a wrapper regression that resolved to the unavailable
   branch under the existing mock would make all ~21 pre-existing "Voice
   Input works" assertions pass for the wrong reason (the guard would swallow
   every tap before touching the mock). It asserts the tap reaches
   `mockedSpeech.requestPermissionsAsync` and `.start` with the exact options.
   This is the correct instinct and the cheapest possible expression of it.

The overlap is two duplicated assertions between files 2 and 3 (sublabel text,
on-tap message text). That duplication is defensible as defence-in-depth
rather than waste: files 2 and 3 fail for *different reasons* and would
survive different future breakages independently. Not worth consolidating.

**One environmental dependency worth naming.** Files 1 and 3 both depend on
jest-expo *not* registering a native `ExpoSpeechRecognition` module. If a
future `expo-speech-recognition` upgrade ships a JS/web fallback that resolves
under jest-expo, that premise breaks. Importantly, it breaks **loudly** —
`expect(isSpeechRecognitionAvailable).toBe(false)` is asserted explicitly in
both files as its own test, so the suite would fail visibly rather than
quietly degrading into a vacuous pass. That explicit assertion is good
defensive test design and is the reason this dependency is acceptable rather
than fragile.

**Coverage of the acceptance criteria** is complete for everything automatable:
degraded render, degraded sublabel, degraded tap message, no call-through,
wrapper contract shape, available-path regression (21 pre-existing tests plus
the anti-vacuity guard), other tiles unaffected.

## Outcome-document honesty

The outcome doc is **substantially accurate and unusually candid** — every
number in it reproduced exactly at this gate (37/316; the same 3 pre-existing
tsc errors, correctly named and correctly characterised as untouched by this
diff). It does not overclaim on the one thing it would be tempting to
overclaim: the "Deferred" section states plainly that live Expo Go
verification on the physical device did not happen and explains why, and
acceptance criterion 1 is explicitly hedged as "Evidence-backed for the
automated case" with live confirmation "still deferred." The web-sanity-check
deferral is likewise reasoned rather than waved away (web resolves the package
successfully via a different code path, so web cannot demonstrate the
unavailable state — correct, and it matches the plan's own analysis). The
`git diff --shortstat` figure quoted (18+/11-) is accurate.

It also correctly attributes the fourth test file to the tech-lead's N2
finding rather than presenting it as original build work, which is the honest
thing to do.

- **C2 (non-blocking, doc hygiene — three stale sentences left over from the
  revisions).** The doc was revised twice and two statements weren't carried
  forward:
  1. Acceptance criterion 4 says "plus the **three** test files." There are
     now four (three new, one modified).
  2. Acceptance criterion 5 credits the unavailable path to
     "`speech-recognition.test.ts` + `log-no-speech.test.tsx`" — omitting
     `log-no-speech-real-wrapper.test.tsx`, which mutation A proves is the
     *strongest* evidence for that very criterion. The doc undersells its own
     best asset here.
  3. The closing "Pipeline note" says the document "covers the Sonnet-build
     step" and that tech-lead review is "not part of this document," while
     the body now legitimately includes tech-lead-round content (the N2 file,
     the 316-test count, the 36/313 → 37/316 note). The note should say the
     doc was updated through the tech-lead round.
  None of this is dishonest — it's revision lag, and it errs toward
  understating the work rather than overstating it. Worth a three-line fix at
  commit time; not merge-blocking.

## Risk assessment

**Overall: LOW.** This change strictly enlarges the set of environments in
which the app works. There is no environment made worse by it.

*Blast radius.* Two source files. One is new. The other's diff is an import
swap plus two guards. No shared component, no state management, no API, no
schema, no navigation config, no build config touched. The 300+ tests outside
this ticket's scope are untouched and green.

*Regression risk to the working feature (native builds where the module IS
linked): very low.* The wrapper's available path is pure pass-through —
`nativeModule.requestPermissionsAsync()`, `nativeModule.start(options)`,
`nativeModule.stop()`, and the real `useSpeechRecognitionEvent` re-exported by
reference. The only semantic addition on that path is one extra function-call
frame. The 21 pre-existing Voice Input tests all still pass through the
wrapper against the same mock object, and the new anti-vacuity test proves
they're passing for the right reason rather than vacuously.

*Type-safety risk: very low.* Typecheck is clean, and the wrapper's design was
chosen specifically *because* the alternative was tsc-proven to fail. The
`Parameters<NativeModuleType['start']>[0]` idiom keeps the options type tied
to the real package rather than restating it, so a package upgrade that
changes that signature surfaces as a compile error rather than a runtime
surprise.

*Residual risk — C3 (informational, no action required to merge).* The
strongest automated evidence (`log-no-speech-real-wrapper.test.tsx`) proves
that `log.tsx`'s module graph loads and the component renders when the native
module is absent. It does **not** exercise Expo Router's `getRoutesCore`
route-tree build, nor `app-tabs.tsx`'s `NativeTabs.Trigger` binding — i.e. the
observed *symptom* (tab missing from the tab bar) is not directly reproduced
or directly proven fixed by any test. The causal chain is nonetheless sound:
the module-scope throw was the sole cause, the throw is now impossible, and
the route file loading cleanly is both necessary and sufficient for the
Trigger to find its match. I judge this acceptable for merge because the
remaining uncertainty is about *whether the diagnosed cause was the only
cause*, and the diagnosis was independently confirmed by reading Metro's and
Expo Router's actual behaviour during plan review. Recommendation: the user
should still confirm on the physical S24 Ultra via Expo Go once built — that
is the only test that closes the loop on the original report, and it costs one
scan of a QR code.

*C4 (follow-up, explicitly out of scope for this ticket).* I audited every
route file under `src/app/**` for the same class of exposure. Current
route-level native imports are `expo-camera`, `expo-image-picker`,
`expo-linear-gradient`, `expo-font`, `expo-splash-screen`, `expo-web-browser`,
`@clerk/expo`, and `react-native-safe-area-context` — all of which ship inside
Expo Go's bundled module set, which is exactly why
`expo-speech-recognition` (a third-party module *not* bundled in Expo Go) was
the only one that failed. **So there is no second instance of this bug today.**
But the class of bug returns the moment any route file statically imports the
next non-Expo-Go-bundled native module, and it returns with the same nasty
signature: a silently missing tab rather than a stack trace. Worth a
follow-up ticket for a cheap structural guard — either a note in
`app/AGENTS.md` or an `eslint no-restricted-imports` rule scoped to
`src/app/**` — so the next such module is forced through a wrapper by default
rather than by memory.

## Rationale for MERGE

1. Every claim in the outcome doc reproduced independently at this gate:
   37 suites / 316 tests green, typecheck clean with only the 3 known
   pre-existing errors, diff scope exactly as described.
2. The fix addresses the diagnosed root cause directly and structurally,
   rather than symptomatically. The risky `require()` now exists in exactly
   one place, wrapped, commented, and impossible to reach from a route file.
3. The two prior-round findings are genuinely closed, verified by inspection
   and by mutation rather than by assertion. **N1**: the comments state the
   prohibition, the mechanism, and the ticket reference — they do the
   anti-cleanup job they were asked to do. **N2**: mutation A proves the
   added test is the *only* `LogScreen`-rendering test that detects the
   original bug, so the gap it filled was real and is now filled.
4. Test suite has demonstrated fault-detection power, not just green output —
   verified by two independent mutations run at this gate, one of which
   reintroduced the actual production bug.
5. Risk is low and asymmetric: the change can only expand the set of working
   environments. The working native path is pure pass-through and is pinned
   by 21 pre-existing tests plus a new anti-vacuity guard.
6. The four open findings are all non-blocking: one latent-but-unreachable
   correctness nit (C1), one doc-revision-lag cleanup (C2), one
   already-disclosed deferral the outcome doc is honest about (C3), and one
   out-of-scope structural follow-up (C4).

The one thing this verdict cannot certify, and does not: that the tab is
visibly back on the physical device. That requires a build and a device, both
of which the user has. Everything that automation can establish, is
established.

## Recommended follow-ups (none blocking)

1. Fold C2's three stale sentences into the outcome doc at commit time.
2. Optionally apply C1 (derive `isSpeechRecognitionAvailable` from
   `nativeModule !== null`) — one line, no test impact.
3. Confirm on the physical S24 Ultra via Expo Go after the next build (C3).
4. File a follow-up ticket for C4's structural guard against route files
   statically importing non-Expo-Go-bundled native modules.
