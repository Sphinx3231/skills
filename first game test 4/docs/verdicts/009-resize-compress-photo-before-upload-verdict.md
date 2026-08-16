# CTO Verdict: Ticket 009 — Resize/compress meal photos before upload

Ticket: `docs/tickets/009-resize-compress-photo-before-upload.md`
Plan: `docs/plans/resize-compress-photo-before-upload-plan.md`
Outcome: `docs/outcomes/resize-compress-photo-before-upload-outcome.md`
Branch: `foxbite-resize-photo-before-upload` (base `foxbite-scrollview-latent-pattern`, which carries ticket 008's still-unmerged commit)
Stage: CTO review — final gate after Sonnet build → Sonnet QA → Opus tech-lead (2 rounds, approved)

> Note on provenance: a partially-completed verdict artifact from an earlier, session-limited
> attempt was present at this path. It was not trusted or carried forward. Every claim below was
> re-derived independently in this session — library source read directly, tests executed, seven
> mutations run against the shipped module, typecheck run, lockfile diff inspected line by line.

---

## Decision

**MERGE.**

The shipped change is three modified files (18 insertions / 21 deletions) plus two new files,
entirely inside the layer the ticket scoped. Every load-bearing factual claim in the outcome
document that could be checked from this machine was checked and held. The design's failure mode
is structurally bounded — I verified by reading the control flow, not by trusting the description
of it — so the worst realistic outcome of a subtle defect here is *today's behavior* (a full-size
upload), not a broken scan. Residual gaps are verification-environment gaps, not code defects,
and all are disclosed in the outcome doc. Four non-blocking follow-ups are recorded; none of them
justifies holding the merge.

---

## 1. Scope vs plan

**Verdict: matches the approved plan, with three disclosed deviations, all justified.**

Actual diff surface (`git diff foxbite-scrollview-latent-pattern --stat`):

```
app/package-lock.json      | 28 +++++++++++++---------------
app/package.json           |  1 +
app/src/app/(tabs)/log.tsx | 10 ++++------
```

plus untracked `app/src/lib/image-prep.ts` and `app/src/lib/__tests__/image-prep.test.ts`.
Nothing in `backend/`, nothing in `app/src/lib/api.ts`, no `app.json` change, no picker-option
change. Ticket 008's content is correctly excluded by using that base for the diff.

| Plan commitment | Shipped | How I verified |
|---|---|---|
| One new module exporting `prepareImageForUpload({uri, fileName?, mimeType?}) → {uri, name, type}` | Yes, exactly that signature | Read `image-prep.ts:44-48` |
| Measure-then-resize via two independent `manipulate(uri)` calls | Yes (`:86` and `:108`) | Read the file; mutations M6/M7 probe it |
| `analyzePhoto` signature untouched | Yes — `api.ts` is not in the diff at all | `git diff --stat` |
| Single call site inside `pickAndAnalyze`, between `assets[0]` and `analyzePhoto` | Yes, `log.tsx:83-89` | `git diff` on `log.tsx` |
| No `exif: true` added to either picker call | Correct — both still `{ quality: 0.7, base64: false }` | `log.tsx:78-80`, unchanged in diff |
| Quality/dimension as named module-top constants with reasoning | `JPEG_QUALITY = 0.8`, `MAX_DIMENSION = 1024`, both commented | `image-prep.ts:34-42` |
| Installed via `npx expo install` (SDK-54-resolved range) | `expo-image-manipulator: ~14.0.8` | `package.json` diff |
| No backend / scan-pipeline / Anthropic change | Confirmed | `git diff --stat` |

### The three deviations

1. **Named export `{ ImageManipulator }`, not `import * as`.** The plan's sketch was factually
   wrong about the module's export shape; `tsc` caught it. Not a judgment call.
2. **`SaveFormat.JPEG` enum instead of the string `'jpeg'`.** The plan explicitly registered this
   as unconfirmed and instructed the implementer to check it with `tsc --noEmit` before writing
   mocks. That is what happened — the plan's own risk-registration working as designed.
3. **Omitting the unconstrained resize axis key rather than passing explicit `null`.** This is the
   substantive one and it was a real bug in the plan's code sketch. I reproduced the root cause
   from the installed library rather than accepting the write-up:

   `node_modules/expo-image-manipulator/src/web/actions/ResizeAction.web.ts` gates on
   `if (width !== undefined)` / `if (height !== undefined)`. With `{width: 1024, height: null}`,
   the first branch sets `requestedHeight = 1024 / imageRatio`, then the second branch fires
   (because `null !== undefined`) and overwrites `requestedHeight = null` → resample with a null
   height → `IndexSizeError` in `createImageData`. Confirmed exactly as reported.

   The claimed cross-platform safety of the fix also holds:
   `android/.../transformers/ResizeTransformer.kt` uses `resizeOptions.width != null` /
   `height != null` and derives the other axis from `bitmap.width / bitmap.height`, so an omitted
   key behaves identically to an explicit null there — and single-axis aspect preservation is
   implemented on both web and Android, so omitting the key does not lose aspect ratio.

Drift assessment: no unjustified drift. Two deviations were forced by reality (wrong plan
assumptions caught by the type system), one fixed a genuine defect the plan would have shipped.
That third one is the strongest evidence in this ticket that the live-execution step earned its
keep — a purely mocked suite would have happily accepted `{width: 1024, height: null}` forever.

### One plan step not delivered as written

Step 0/Step 4's physical-device verification was substituted with Expo **web** execution against
**synthetic** fixtures. This is a real substitution, not an equivalent. It is disclosed at length
in the outcome doc (three separate places), and the plan itself pre-authorized a documented
fallback. Accepted, with the carryovers in §6.

---

## 2. Code quality

**Verdict: clean, well above the bar for a 130-line module; two nits, no defects found.**

Read in full: `app/src/lib/image-prep.ts`.

- **Structure.** One exported function, no hidden state, no side effects beyond the manipulation
  itself and a `console.warn`. Fallback object is constructed *before* the `try`, from the raw
  asset — so it cannot be contaminated by partial work.
- **Constants.** `JPEG_QUALITY = 0.8` and `MAX_DIMENSION = 1024` are at module top with
  falsifiable reasoning (anchored to Claude's documented vision long-edge behavior rather than a
  vibes-based "detail plateaus"). No inline magic numbers anywhere. The ticket's "tell me what you
  defaulted to and why" is answered in the code, not just the doc.
- **Comments.** Unusually heavy (about half the file), but every block is load-bearing: why the
  import is lazy, why `require()` and not `import()`, why the unconstrained axis key is omitted,
  why no `.rotate()` call exists. These encode findings that would otherwise be silently
  re-litigated by the next person who "cleans up" the file. I would not cut them.
- **Naming.** `measured` / `resized` / `saved` / `longestEdge` / `isLandscape` / `fallback` —
  all say what they are.
- **The lazy `require()`.** I verified the justification independently rather than accepting it:
  `expo-image-manipulator/src/NativeImageManipulatorModule.ts` is literally
  `export default requireNativeModule<ImageManipulator>('ExpoImageManipulator')` — a module-scope
  call — and `expo-modules-core/src/requireNativeModule.ts` throws synchronously when the module
  is absent. A static top-level import in `image-prep.ts` would therefore throw during Expo
  Router's eager route load, which is ticket 007's exact failure class. The lazy `require()` is
  correct and non-negotiable here, and it matches the existing `speech-recognition.ts` idiom, so
  it is a repo convention rather than a one-off.

### Is the fallback truly non-throwing?

Traced by hand, statement by statement. Everything that can throw or reject is inside the single
`try`: the `require()` (throws if the native module is missing), both `manipulate()` calls, both
`renderAsync()` awaits, both `saveAsync()` awaits. Outside the `try` there is only object-literal
construction from already-present fields and two `??` defaults — no property access on anything
possibly-undefined, no user callback, no `await`. The `catch` itself does only string comparisons
on `asset.mimeType` and a `console.warn`, then returns. **`prepareImageForUpload` cannot reject.**
I verified this behaviorally too: mutation M1 (making the `catch` rethrow) turned three tests red,
so the property is test-locked, not just true by inspection today.

The one theoretical hole: if `saveAsync` ever *resolved* with a malformed result, `saved.uri`
would be `undefined` and the function would return a bad URI without warning. That is a library
contract violation rather than a defect here, and the downstream `analyzePhoto` call would fail
visibly rather than silently. Not worth guarding.

### Nits (non-blocking)

- **N1 — UI feedback gap at the call site.** `log.tsx:84-86` awaits `prepareImageForUpload`
  *before* `setPhotoUri` and `setStep('analyzing')`. Previously `setPhotoUri(asset.uri)` fired
  immediately when the picker closed. Now the screen sits in its prior state, with no spinner,
  for the duration of one or two native decodes of a multi-megapixel image. That is plausibly
  several hundred milliseconds to a couple of seconds on a mid-range phone, reading as a hang.
  The fix is to move `setStep('analyzing')` above the await (keeping the preview update after).
  Correctness is unaffected — this is UX only.
- **N2 — double lossy encode.** Both picker calls still pass `quality: 0.7`, so the asset is
  JPEG-encoded at 0.7 by the picker and then re-encoded at 0.8 by this module: generational loss
  for no benefit now that we own compression. Worth revisiting `quality: 0.7` → `1` in a
  follow-up, measured, not assumed.

---

## 3. Test adequacy

**Verdict: adequate, with genuine mutation evidence. One real coverage hole found (non-blocking).**

I did not take QA's or the tech-lead's word on this. I executed the suite and then ran seven
mutations against the shipped module, restoring a byte-identical copy after each
(`md5 ac4e5d2084296989e067a32d0303655b` verified before and after the whole exercise; `git status`
unchanged afterward).

Baseline: `npx jest src/lib/__tests__/image-prep.test.ts` → **9 passed**.
Full suite: `npx jest` → **38 suites, 325 tests, all passing** (outcome doc's claim confirmed
exactly). `npx tsc --noEmit` → exactly the 3 pre-existing errors in `animated-icon.tsx`,
`app-tabs.web.tsx`, `collapsible.tsx`; no new ones.

| # | Mutation | Result |
|---|---|---|
| M1 | `catch` rethrows instead of returning `fallback` | **Killed** — 3 tests red |
| M2 | `isLandscape` inverted (`>=` → `<`) | **Killed** — 3 tests red (the B5 regression tests earn their name) |
| M3 | Reintroduce the explicit-`null` axis shape from the plan sketch | **Killed** — 3 tests red |
| M4 | HEIC/HEIF branch disabled, so the distinct warning never fires | **Killed** — 1 test red |
| M5 | No-upscale short-circuit removed | **Killed** — 1 test red |
| M6 | Save the **measured** ImageRef instead of the **resized** one | **SURVIVED** |
| M7 | Drop the `.resize()` call entirely on the oversized path | **Killed** — 3 tests red |

So the tech-lead's claim that mutation testing was done on the fallback path is credible and I
reproduced it: the fallback path is genuinely test-locked (M1, M4), as is the axis decision (M2),
the omitted-key fix (M3), the no-op path (M5), and the presence of the resize (M7). This is real
red-before/green-after proof, not coverage theater.

**M6 is a real hole and is new to this review.** `image-prep.test.ts` uses a single shared
`mockSaveAsync` across every fake context, so it cannot distinguish which `ImageRef` was saved. In
production, saving `measured` instead of `resized` would upload the **full-size** image while all
nine tests stayed green — a silent regression of the entire feature, invisible to the suite.
Bounded severity (the fallback semantics still hold; you'd just pay full-size upload costs), and
the shipped code is correct today. Fix is one line of test hygiene: give each `makeContext` its
own `saveAsync` jest.fn and assert it was the resize context's that fired. **Follow-up F1.**

Other test observations: `JPEG_QUALITY` is re-declared as a literal `0.8` in the test rather than
imported, so changing the constant fails the suite. That is arguably correct (a deliberate change
should require touching the test), just worth knowing. HEIC coverage is honestly scoped — it
asserts call arguments only, and the outcome doc says exactly that.

---

## 4. Honesty / discipline

**Verdict: this is the strongest outcome doc in the 006-009 run. Norm upheld.**

Concrete checks against the "don't overclaim" norm:

- **HEIC**: flagged unverified in three places — the Step 3 section ("ships untested against a real
  HEIC file"), the acceptance-criteria line (checked box, but with the caveat inline, not hidden),
  and the Deferred list. The doc explicitly distinguishes "unit test proves our logic given a
  mocked decode" from "a real HEIC decodes." Correct framing.
- **Dev-client APK state**: labeled source-verified, not empirically confirmed, both in the doc's
  C1 section and in the module's own header comment. I checked the underlying source claim and it
  is accurate. The doc states plainly that every scan on the currently-installed APK will take the
  fallback path until rebuild — that is a self-reported downside, disclosed rather than buried.
- **Lockfile residual**: the `utf-8-validate` removal is disclosed with its own paragraph, marked
  as "not independently root-caused further," and explicitly *not* claimed as "additive only, zero
  removals." I verified the diff myself: the lockfile change is exactly +`expo-image-manipulator`
  (with `expo-image-loader@6.0.0` already present, so no dangling dependency) and
  −`node_modules/utf-8-validate@5.0.10`. That entry is `optional: true, peer: true`, is not
  present in `node_modules` on disk, and the only remaining references to it in the lockfile are
  `peerDependenciesMeta` optional markers plus `rpc-websockets`' own nested v6 copy. The
  tech-lead's benign root-cause holds. The three previously-pruned `@clerk/clerk-js` nested
  entries are back.
- **Device verification**: the doc does not pretend the web run was a device run. It says which
  runtime, which implementation, which fixtures, and why each preferred path was unavailable
  (no adb, no emulator, no Clerk test credentials, no stock photos). It also volunteers that the
  temporary `sign-in.tsx` hook existed and was reverted — I confirmed the revert: `sign-in.tsx` is
  not in the diff.
- **Synthetic-fixture caveat**: the doc itself says geometric fixtures may not surface detail loss
  that real food photography would. That is the doc arguing against its own conclusion, which is
  exactly the discipline this norm is for.

I found no instance of a verified-sounding claim that isn't actually verified. Every claim I spot-
checked against source or execution was accurate, including the small ones.

**Constitution note**: no `.specify/memory/constitution.md` or any file named `constitution*`
exists in this repo. Reviewed instead against the repo's documented conventions: root `CLAUDE.md`
(WAT layering — respected; this is app code, not workflow/tool code, and nothing in `tools/` or
`workflows/` was touched), `app/AGENTS.md` (SDK 54 — the installed `~14.0.8` is the
SDK-54-resolved range and the docs consulted were v54), the `run-foxbite-web` skill's mandate to
actually boot the web bundle when a new native dependency lands (done, and it is what caught the
resize bug), and the 006-009 honesty norm (above).

---

## 5. Risk assessment

**Verdict: blast radius is structurally bounded, and I confirmed the structure rather than the
claim.**

The bounding argument is real. Everything that can fail — missing native module, decode failure,
unsupported format, resize error, save error — is inside one `try`, and the `catch` returns the
untouched original asset fields, which are byte-identical to what `pickAndAnalyze` passed to
`analyzePhoto` before this ticket. So the degraded state of this feature *is* the pre-ticket
state. Verified by inspection (§2) and by mutation M1.

Risk inventory:

| Risk | Likelihood | Impact | Bounded by |
|---|---|---|---|
| Native module missing (current dev-client APK) | **Certain** until APK rebuild | Full-size uploads, one warn per scan | Lazy `require()` inside `try`; screen does not crash |
| Real HEIC fails to decode on device | Low-moderate, unverified | Fallback keeps `image/heic` type → backend 400 → scan fails | Not fully bounded — see below |
| Resize produces mush on real food photos at 0.8 | Low | Degraded AI accuracy, silent | Not bounded by code; needs the §6 check |
| Web-only `resize` null bug class recurring | Now nil | — | Fixed and mutation-locked (M3) |
| Peak native memory on large captures | Low-moderate | Possible OOM on low-RAM Android | Partially — see F2 |
| Temp files accumulating in the cache dir | Low | Disk use | OS cache eviction; plan-accepted |
| Lockfile drift breaking EAS `npm ci` | Now nil | — | Regenerated under npm 10.8.2; `ci --dry-run` clean |

Two risks deserve more than a table row:

**R1 — HEIC is the one path the fallback does not rescue.** If a genuine HEIC fails to decode, the
fallback re-uploads an `image/heic` asset into a backend allowlist that rejects it with a 400. The
code handles this as gracefully as it can (a distinct warning that says so), but the user-visible
result is a failed scan, not a more expensive one. That is *also* today's behavior for that same
input — the backend rejects HEIC today too — so this ticket does not regress anything; it just
does not fix it in the failure case. Worth knowing that HEIC support is a best-effort improvement,
not a guarantee, until §6's real-HEIC check runs.

**R2 — peak native memory, new finding.** The double-decode design keeps up to three full-size
native bitmaps alive at peak on the oversized path (`measured`'s bitmap, the second decode's
bitmap, and the resized output), and `image-prep.ts` never calls `release()` on any context or
ImageRef. The library's own deprecated `manipulateAsync` wrapper does exactly that
(`src/ImageManipulator.ts`: `context.release(); image.release();` with the comment "These shared
objects will not be used anymore, so free up some memory"), which is a strong signal that explicit
release is the intended usage. At 4032×3024 ARGB_8888 that is roughly 49 MB per bitmap, so a peak
near 150 MB on Android. Expo's SharedObject does free on JS GC, so this is a delay rather than a
leak, and an `OutOfMemoryError` inside Glide would most likely surface as a rejected promise and
land in the fallback — but I could not confirm that a hard native OOM is always catchable rather
than process-fatal, so I am not claiming it is fully bounded. **Follow-up F2**, and a thing to
watch on the first real-device run with a high-resolution capture.

Net: the realistic worst case of this merge is that the feature silently doesn't save money yet.
The unrealistic-but-possible worst case is an OOM on a low-RAM device, which is a pre-existing
class of risk for any on-device image work and is not made materially worse than a single decode
would be.

---

## 6. Deploy-time carryovers

These are only truly closed by a real device and/or a dev-client rebuild. They must not be lost.

1. **Rebuild the dev-client APK.** Until then, the S24 Ultra's installed dev client lacks
   `expo-image-manipulator` and every scan takes the fallback path (full-size upload + one
   `console.warn`). The feature is effectively inert on that device. This is expected and
   documented, but it means *"merged" ≠ "live"* for this ticket.
2. **Real on-device Expo Go / dev-client run of the photo path.** Nothing in this ticket exercised
   `log.tsx`'s actual UI end-to-end (Clerk-gated, no test credentials). Confirm: picker → prepare →
   preview shows the resized image → scan succeeds.
3. **Real HEIC file from an iPhone gallery.** The single largest unverified assumption. Confirm it
   decodes and uploads as JPEG; if it doesn't, confirm the distinct warning fires and decide
   whether HEIC needs a real fix.
4. **Real food-photo detail check at `JPEG_QUALITY = 0.8` / 1024px.** The Step 4 fixtures were
   synthetic geometry. Re-run with three genuine photos (bright plate, dim restaurant, close-up)
   and confirm char marks, garnish, and grain survive well enough for the vision model. If not,
   the constant is designed to be the single place to change.
5. **Real before/after byte sizes from an actual camera capture.** The synthetic baselines
   (112 KB–995 KB) are far below a real multi-MB capture, so the reported ~88% reduction is
   directionally right but not the real number. Capture the real one to validate the ticket's cost
   premise.
6. **Native-platform confirmation of the resize call shape.** The omitted-key fix was verified
   live on web and by source-read on Android; iOS's `ImageResizeTransformer` was not exercised at
   runtime by anything in this session.
7. **First real-device run: watch memory** on a large capture (see R2/F2).
8. **EAS build sanity.** The lockfile is fixed for npm 10.8.2 by dry-run, but the next real EAS
   build is the actual proof.

---

## Follow-ups (non-blocking, file as tickets)

- **F1** — Close the M6 test hole: per-context `saveAsync` mocks so the suite can tell the resized
  ImageRef from the measured one. Small, and it protects the feature's whole point.
- **F2** — Call `release()` on contexts and ImageRefs once done (mirroring the library's own
  `manipulateAsync` wrapper), and/or reconsider the second decode now that the re-feed question
  could be settled cheaply. Halves peak native memory.
- **F3** — Move `setStep('analyzing')` above the `await prepareImageForUpload(...)` in
  `log.tsx` so the resize isn't a silent UI stall (N1).
- **F4** — Revisit the pickers' `quality: 0.7` now that this module owns compression, to avoid a
  double lossy encode (N2). Measure before changing.

---

## Merge rationale

Approving because:

1. The diff is small, scoped exactly as ticketed, and touches nothing it was told not to touch.
2. Every independently checkable claim in the outcome doc checked out — library source, lockfile
   diff, test counts, typecheck counts, revert of the temporary hook.
3. The safety property that bounds the entire risk surface ("never throws to the caller; degrades
   to today's behavior") is true by construction and locked by tests, both verified here directly.
4. The test suite kills six of seven mutations, including all the ones that matter for the
   fallback and the axis bug. The survivor is a test-hygiene gap, not a code defect.
5. The honesty discipline is met without qualification — the doc discloses its own weakest points
   unprompted, which is precisely what makes the rest of it trustworthy.

The unverified items are all *environment* gaps that no amount of further review from this machine
can close; they close on a device. Holding the merge would not shorten that list — it would only
delay the dev-client rebuild that is itself a precondition for closing most of it.

**MERGE**, with §6's carryovers attached to the next device/build session and F1-F4 filed as
follow-up tickets.
