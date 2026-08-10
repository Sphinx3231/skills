# Outcome: Log tab no longer disappears when the native speech-recognition module isn't linked

Ticket: `docs/tickets/007-log-tab-crashes-without-speech-recognition.md`
Plan: `docs/plans/log-tab-crashes-without-speech-recognition-plan.md`
Branch: `foxbite-log-tab-speech-recognition-guard`

## What changed

Implemented exactly per the plan, using its tsc-verified wrapper code
close to verbatim.

### New file: `app/src/lib/speech-recognition.ts`

A wrapper module that `require()`s `expo-speech-recognition` inside a
`try/catch` at module scope. If the native module isn't linked (confirmed
in this repo's jest-expo config, and on Expo Go per the ticket), the
`require()` throws and `speechModule` is set to `null` instead of
propagating the throw. Exposes:

- `isSpeechRecognitionAvailable: boolean` — `speechModule !== null`.
- `requestSpeechPermissions()` — returns `{ granted: false }` when
  unavailable, otherwise delegates to the real module.
- `startSpeechRecognition(options)` / `stopSpeechRecognition()` — safe
  no-ops when unavailable.
- `useSpeechRecognitionEvent` — the real hook when available, a no-op
  function when not. Safe under React's rules of hooks because
  availability is resolved once at module load and can't change within a
  session (documented in the wrapper's own comments, matching the plan's
  rationale).

Deliberately does **not** export a nullable `ExpoSpeechRecognitionModule`
handle — the plan's first review round found that approach produces new
`TS18047` errors at `log.tsx`'s call sites, so all null-handling lives
inside the wrapper's functions instead.

### `app/src/app/(tabs)/log.tsx`

`git diff --shortstat`: 1 file changed, 18 insertions(+), 11 deletions(-).

1. Replaced the static `expo-speech-recognition` import with the wrapper
   import (`isSpeechRecognitionAvailable`, `requestSpeechPermissions`,
   `startSpeechRecognition`, `stopSpeechRecognition`,
   `useSpeechRecognitionEvent`, plus the two event-type imports) from
   `@/lib/speech-recognition`. `log.tsx` no longer imports or references
   `ExpoSpeechRecognitionModule` anywhere.
2. `startVoiceInput()` now guards first, before the existing
   double-tap-in-flight check: if `!isSpeechRecognitionAvailable`, sets
   `error` to `'Voice Input needs the full app build — not available in
   this preview.'` and returns immediately. Existing `error`/`ThemedText`
   display handles rendering it — no new UI component.
3. All four raw-module call sites (line numbers matched the plan's
   estimates exactly, ticket 006 hadn't shifted them):
   - `'result'` event handler's `ExpoSpeechRecognitionModule.stop()` →
     `stopSpeechRecognition()`
   - `startVoiceInput`'s `ExpoSpeechRecognitionModule.requestPermissionsAsync()`
     → `await requestSpeechPermissions()`
   - `startVoiceInput`'s `ExpoSpeechRecognitionModule.start({...})` →
     `startSpeechRecognition({...})`
   - `cancelListening`'s `ExpoSpeechRecognitionModule.stop()` →
     `stopSpeechRecognition()`
4. The "Voice Input" `HubTile`'s `sublabel` is now
   `isSpeechRecognitionAvailable ? 'Say what you ate' : 'Needs the full
   app build'` — always visible in the unavailable case, not just after a
   failed tap. Icon, label, and `onPress` unchanged; the tile stays
   tappable so a user who taps anyway still gets the same message via the
   `startVoiceInput` guard.

No other files under `app/src/app/` changed. `app.json`'s
`expo-speech-recognition` plugin config untouched (already correct per
the ticket).

## Why

`expo-speech-recognition`'s module-scope `requireNativeModule(...)` call
throws immediately if the native module isn't linked, and Expo Router
eagerly `require()`s every route file to build the tab tree — so the
throw happened before any navigation, and `app-tabs.tsx`'s
`<NativeTabs.Trigger name="log">` silently lost its match, dropping the
whole Log tab. Moving the risky `require()` behind a wrapper that catches
the failure once, at module scope, means `log.tsx` (and therefore the
route file Expo Router eagerly loads) never throws, regardless of
platform, while the real feature is fully preserved wherever the native
module is actually linked.

## Test coverage added

1. **`app/src/lib/__tests__/speech-recognition.test.ts`** — no mocks.
   jest-expo has no real `ExpoSpeechRecognition` native module, so
   requiring the real `expo-speech-recognition` package unmocked
   exercises the unavailable path directly: asserts
   `isSpeechRecognitionAvailable === false`,
   `requestSpeechPermissions()` resolves `{ granted: false }`, and
   `startSpeechRecognition`/`stopSpeechRecognition` don't throw.
2. **`app/src/app/(tabs)/__tests__/log-no-speech.test.tsx`** — mocks
   `@/lib/speech-recognition` directly (not the raw package), alongside
   copies of the `expo-router`/`expo-image-picker`/`expo-camera`/
   `@/lib/api`/`expo-web-browser` mocks `log.test.tsx` already uses.
   Asserts the Voice Input tile's sublabel reads "Needs the full app
   build", tapping it shows the guard's error text without ever calling
   the wrapper's `requestSpeechPermissions`/`startSpeechRecognition`, and
   that the other hub tiles (Snap & Track, From library, Barcode Hunt)
   are unaffected.
3. **`app/src/app/(tabs)/__tests__/log.test.tsx`** (existing file) — added
   one new sanity test at the top of the `describe('LogScreen — Voice
   Input', ...)` block asserting the existing
   `jest.mock('expo-speech-recognition', ...)` mock is genuinely wired
   through the wrapper: tapping "Voice Input" calls the mocked module's
   `requestPermissionsAsync` and `start` directly. This guards against the
   wrapper silently resolving to the unavailable branch in a way that
   would make every pre-existing "Voice Input works" assertion in that
   file pass vacuously. The existing `jest.mock('expo-speech-recognition',
   ...)` itself (line ~41) was **not** moved or altered, per the plan —
   the wrapper's own `require()` picks it up transparently, so
   `isSpeechRecognitionAvailable` resolves `true` under that mock and all
   ~15 pre-existing assertions on `mockedSpeech.*` are unaffected.
4. **`app/src/app/(tabs)/__tests__/log-no-speech-real-wrapper.test.tsx`**
   (added during tech-lead review, N2) — the integration counterpart to
   file 2 above. File 2 mocks `@/lib/speech-recognition` directly, which
   validates `log.tsx`'s guard logic but never exercises the wrapper's own
   real fallback behavior. This file mocks everything `log.tsx` needs
   *except* `@/lib/speech-recognition`, letting the real wrapper resolve
   unavailable under jest-expo's lack of a linked native module — the
   same condition Expo Go hits. Asserts: the real wrapper reports
   unavailable, `LogScreen` renders successfully with "Log a meal" /
   "Voice Input" / "Needs the full app build" all present, and tapping the
   tile shows the degraded message. This is the one test that actually
   proves the fix end-to-end (route loads + renders + degrades gracefully
   with the real, unmocked wrapper) rather than validating its two halves
   separately.

## Automated test results

### `npx jest` (bare, in `app/`)

**37 test suites, 316 tests, all passing.** (Was 36/313 before the N2
integration test above was added during tech-lead review.) Ran the bare
command
specifically (not `--testPathPattern tabs`) because that filter would not
match `app/src/lib/__tests__/speech-recognition.test.ts`, which lives
outside the tabs directory — the plan flagged this explicitly to avoid
the new wrapper test silently never running.

### `npx tsc --noEmit`

Same 3 pre-existing errors only, no new ones:

```
src/components/animated-icon.tsx(150,5): error TS2698
src/components/app-tabs.web.tsx(72,15): error TS2322
src/components/ui/collapsible.tsx(22,13): error TS2322
```

None of these three touch `log.tsx` or the new `speech-recognition.ts`
wrapper.

## Acceptance criteria status

- [x] Log tab renders regardless of whether the native speech module is
      linked — `log.tsx` no longer has any module-scope code path that can
      throw from the speech-recognition import, since the wrapper catches
      the failure. Evidence-backed for the automated case: the new
      `log-no-speech-real-wrapper.test.tsx` renders `LogScreen` against the
      real, unmocked wrapper resolving unavailable (the same condition
      Expo Go hits) and confirms it renders successfully. Live
      confirmation on the physical device itself is still deferred (see
      Deferred below).
- [x] Tapping "Voice Input" when unavailable shows a clear, honest message
      ("Voice Input needs the full app build — not available in this
      preview.") via the existing error-display pattern, not a crash or
      silently-broken button — plus the sublabel now reads "Needs the
      full app build" even before tapping.
- [x] When the native module IS linked, Voice Input behaves exactly as
      before — verified by the existing `log.test.tsx` suite (unchanged
      mock) plus the new sanity test confirming the mock is genuinely
      exercised through the wrapper, not bypassed.
- [x] No other screen/tab's behavior changed — only
      `app/src/app/(tabs)/log.tsx` and the new
      `app/src/lib/speech-recognition.ts` were touched, plus the three
      test files.
- [x] New test coverage for both the "module available" (existing
      `log.test.tsx` + new sanity assertion) and "module unavailable"
      (`speech-recognition.test.ts` + `log-no-speech.test.tsx` +
      `log-no-speech-real-wrapper.test.tsx`, the last of which renders
      `LogScreen` against the real, unmocked wrapper) code paths.

## Not touched / out of scope (per plan)

- Barcode Hunt / camera permissions — no change.
- Voice Input's behavior when the module IS available — no change beyond
  routing through the wrapper's pass-through functions.
- `app.json`'s `expo-speech-recognition` plugin config — already correct,
  untouched.
- The N10 finding from ticket 006's CTO verdict (latent ScrollView
  shrink-to-fit pattern shared by `index.tsx`/`companion.tsx`) — separate,
  already-identified follow-up, not part of this ticket.

## Deferred

- **Live Expo Go verification on the physical device.** Per the task
  scope for this pass, live verification on a physical device wasn't
  required; the automated suite (unmocked wrapper test using the real
  `expo-speech-recognition` package, which throws in this environment
  exactly as it does on Expo Go) is the evidence that the unavailable path
  works. The user has a physical device available for real-world
  confirmation once this is built.
- **Web sanity check.** Backend/web dev servers were not started for this
  pass, since the plan explicitly notes web's `isSpeechRecognitionAvailable`
  is expected to stay `true` (web resolves `expo-speech-recognition`
  successfully via a different code path than `requireNativeModule`), so
  web cannot demonstrate the unavailable-state UI change — running it
  would not have added verification value for this specific fix.

## Pipeline note

This document has been revised across the full pipeline: the original
Sonnet build, a QA pass (mutation-tested), an Opus tech-lead review that
added the `log-no-speech-real-wrapper.test.tsx` file directly (closing a
real coverage gap it identified and proved with its own throwaway probe),
and an Opus CTO verdict (`log-tab-speech-recognition-guard-verdict.md`,
decision: MERGE) that independently re-ran the mutation tests itself.
Reflects the final, merge-ready state — not just the initial build step.
