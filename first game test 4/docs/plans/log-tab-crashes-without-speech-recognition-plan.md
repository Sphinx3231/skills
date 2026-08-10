# Plan: Log tab disappears when the native speech-recognition module isn't linked

Ticket: `docs/tickets/007-log-tab-crashes-without-speech-recognition.md`

## Root cause (recap)

`app/src/app/(tabs)/log.tsx` statically imports `expo-speech-recognition`:

```ts
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionResultEvent,
  type ExpoSpeechRecognitionErrorEvent,
} from 'expo-speech-recognition';
```

That package calls `requireNativeModule('ExpoSpeechRecognition')` at
**module scope** — it throws the instant the module is loaded, not when
Voice Input is actually pressed. Expo Router's route-tree builder
(`getRoutesCore`) eagerly `require()`s every route file during startup, so
on any runtime without the native module linked (Expo Go, confirmed today
on a physical Android device), the throw happens before the user does
anything, and the Log route is dropped from the tab bar entirely.

`app/app.json` already registers the `expo-speech-recognition` config
plugin correctly (lines ~46-51) with proper permission strings — this is
purely an unguarded-import problem, not a config problem. Real
dev-client/production builds (where the plugin ran during
`prebuild`/`eas build`) should have the module linked and are not expected
to be affected — this ticket is about making the failure graceful on
environments that don't have it, primarily Expo Go.

**Confirmed mechanism for the exact symptom** (tab silently missing, not a
crash screen): `app/src/components/app-tabs.tsx` declares tabs explicitly
via `<NativeTabs.Trigger name="log">`. When the `log` route throws during
Expo Router's eager route-tree build and gets dropped from the tree, that
Trigger has no matching screen to bind to and simply doesn't render its
button — while Today/Companion, whose routes loaded fine, render normally.
This is why the failure looks like "the tab vanished" rather than a visible
crash.

**Confirmed safe to catch**: `require('expo-speech-recognition')` was
tested directly against this repo's own jest-expo config and threw
`Cannot find native module 'ExpoSpeechRecognition'`, which a plain
`try/catch` around the `require()` call caught cleanly. Checked against
Metro's actual runtime (`node_modules/metro-runtime/src/polyfills/require.js`,
`loadModuleImplementation`): on a factory throw, Metro marks the module
failed and rethrows synchronously (no silent half-initialized exports), and
a later `require()` of the same failed module rethrows the cached error
rather than retrying — so requiring exactly once at module scope, in a
try/catch, is the correct and sufficient pattern here.

## Fix approach

Move the native import behind a small wrapper module that catches the
`require()` failure and exposes a safe, always-callable fallback, so
`log.tsx` itself never touches the raw package and never risks a
module-scope throw.

### New file: `app/src/lib/speech-recognition.ts`

**Do not export a nullable `ExpoSpeechRecognitionModule` handle** — a
prototype of that approach was tested against this repo's actual
`tsc --noEmit` and produced 2 new `TS18047 'possibly null'` errors at the
`log.tsx` call sites, and the obvious fix (`?.` at each call site) makes it
worse at the `requestPermissionsAsync()` call (the awaited result becomes
`PermissionResponse | undefined`, breaking the next line's `.granted`
access). Export safe **functions** instead, so all null-handling lives in
the wrapper and `log.tsx` never touches a nullable module reference:

```ts
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

type SpeechModule = typeof import('expo-speech-recognition');
type NativeModuleType = SpeechModule['ExpoSpeechRecognitionModule'];

let speechModule: SpeechModule | null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  speechModule = require('expo-speech-recognition') as SpeechModule;
} catch {
  speechModule = null;
}

const nativeModule: NativeModuleType | null = speechModule?.ExpoSpeechRecognitionModule ?? null;

export const isSpeechRecognitionAvailable = speechModule !== null;

export async function requestSpeechPermissions(): Promise<{ granted: boolean }> {
  if (!nativeModule) return { granted: false };
  return nativeModule.requestPermissionsAsync();
}

export function startSpeechRecognition(options: Parameters<NativeModuleType['start']>[0]): void {
  nativeModule?.start(options);
}

export function stopSpeechRecognition(): void {
  nativeModule?.stop();
}

export const useSpeechRecognitionEvent: SpeechModule['useSpeechRecognitionEvent'] =
  speechModule?.useSpeechRecognitionEvent ?? (() => {});

export type { ExpoSpeechRecognitionResultEvent, ExpoSpeechRecognitionErrorEvent };
```

This prototype was verified against this repo's `tsc --noEmit` with **zero
new errors**. `log.tsx` should call `requestSpeechPermissions()`,
`startSpeechRecognition({...})`, and `stopSpeechRecognition()` — never
import or reference `ExpoSpeechRecognitionModule` directly.

Notes for the implementer:
- Use the **statement form** `import type { X } from '...'`, never inline
  `import { type X }` — both are erased by TypeScript, but the statement
  form removes any ambiguity about whether a runtime `require()` is
  triggered. It is not; `import type` is fully erased.
- The fallback `useSpeechRecognitionEvent` is a plain no-op function, not a
  real hook with internal state. This is safe under React's rules of
  hooks specifically because `speechModule` is resolved once at module
  load and never changes within a JS context — so the hook-call shape
  inside `LogScreen` (one real `useEffect`-based listener, or zero) is
  stable across every render of a given app session. It would NOT be safe
  if availability could change at runtime mid-session, but it can't here.
- `speechModule`/`nativeModule` are computed once at module load (not
  per-render).

### `app/src/app/(tabs)/log.tsx` changes

1. Replace the static `expo-speech-recognition` import with:
   ```ts
   import {
     isSpeechRecognitionAvailable,
     requestSpeechPermissions,
     startSpeechRecognition,
     stopSpeechRecognition,
     useSpeechRecognitionEvent,
     type ExpoSpeechRecognitionResultEvent,
     type ExpoSpeechRecognitionErrorEvent,
   } from '@/lib/speech-recognition';
   ```
   `log.tsx` must not import or reference `ExpoSpeechRecognitionModule`
   directly anywhere — all four of its current call sites route through
   the wrapper's safe functions instead (full list below).
2. In `startVoiceInput()` (line ~161), add an early guard before anything
   else in the function, and swap the two direct module calls inside it
   for the wrapper functions:
   ```ts
   async function startVoiceInput() {
     if (!isSpeechRecognitionAvailable) {
       setError('Voice Input needs the full app build — not available in this preview.');
       return;
     }
     // ...existing body, with:
     //   line ~166: const permission = await requestSpeechPermissions();
     //   line ~174: startSpeechRecognition({ lang: 'en-US', interimResults: true });
     // otherwise unchanged
   }
   ```
   Use the existing `error` state / `ThemedText` error display already
   present on this screen (confirmed at line ~350-354) — no new UI
   component needed, this is consistent with how the screen already
   surfaces recoverable problems (e.g. AI analysis failures).
3. **UX for the unavailable state** (revised per tech-lead review): prefer
   swapping the "Voice Input" `HubTile`'s `sublabel` from "Say what you
   ate" to something like "Needs the full app build" when
   `!isSpeechRecognitionAvailable`, rather than only showing an error after
   a tap. This is always visible (not just after a failed attempt), reads
   as an honest stub-state rather than an error, and needs no new
   component — just a ternary on the existing `sublabel` prop. Keep the
   tile tappable (don't set `disabled` alone with no explanation) so the
   `startVoiceInput` guard's error message still confirms the same thing
   on tap for a user who taps anyway. Icon/label/`onPress` unchanged.
4. There are exactly **four** call sites in this file touching the raw
   module today, all of which must be swapped to the wrapper's safe
   functions (not null-guarded with `?.` — see the wrapper section above
   for why that approach was rejected):
   - Line ~136: `ExpoSpeechRecognitionModule.stop()` inside the `'result'`
     event handler → `stopSpeechRecognition()`
   - Line ~166: `ExpoSpeechRecognitionModule.requestPermissionsAsync()`
     inside `startVoiceInput` → `await requestSpeechPermissions()`
   - Line ~174: `ExpoSpeechRecognitionModule.start({...})` inside
     `startVoiceInput` → `startSpeechRecognition({...})`
   - Line ~283: `ExpoSpeechRecognitionModule.stop()` inside
     `cancelListening` → `stopSpeechRecognition()`
   `useSpeechRecognitionEvent`'s three call sites (lines ~126, ~141, ~147)
   need no change — same import name, now from the wrapper.

## Test coverage

**Do not move or touch the existing `jest.mock('expo-speech-recognition',
...)` in `log.test.tsx` (line ~41).** The wrapper's own `require()` picks
that mock up transparently — `speechModule` resolves to the mocked shape,
`isSpeechRecognitionAvailable` becomes `true`, and `requestSpeechPermissions
`/`startSpeechRecognition`/`stopSpeechRecognition` call through to the same
mocked `ExpoSpeechRecognitionModule` object the existing ~15 assertions
already reference (e.g. `mockedSpeech.ExpoSpeechRecognitionModule
.requestPermissionsAsync`) — those assertions are unaffected because it's
the same mock object, just invoked one level deeper through the wrapper's
functions. Moving the mock would break this for no benefit.

**`jest.mock` is hoisted and file-scoped — there is no describe-scoped way
to opt out of it.** N1 forbids *moving or altering* the existing raw-package
mock inside `log.test.tsx`; it does not forbid mocking the new wrapper
module in a **different, new** test file. These two rules don't conflict —
use two separate new files:

1. `app/src/lib/__tests__/speech-recognition.test.ts` — **no mocks at
   all**. jest-expo has no real native module, so requiring the real
   `expo-speech-recognition` package unmocked throws
   `Cannot find native module 'ExpoSpeechRecognition'` and exercises the
   unavailable path for free (confirmed directly against this repo's
   config during plan review). Assert: `isSpeechRecognitionAvailable ===
   false`; `await requestSpeechPermissions()` resolves `{ granted: false
   }`; `startSpeechRecognition({...})` and `stopSpeechRecognition()` don't
   throw.
2. `app/src/app/(tabs)/__tests__/log-no-speech.test.tsx` — mocks
   `@/lib/speech-recognition` directly (not the raw package) with
   `{ isSpeechRecognitionAvailable: false, requestSpeechPermissions:
   jest.fn(), startSpeechRecognition: jest.fn(), stopSpeechRecognition:
   jest.fn(), useSpeechRecognitionEvent: () => {} }`, alongside copies of
   the `expo-router`/`expo-image-picker`/`expo-camera`/`@/lib/api`/
   `expo-web-browser` mocks `log.test.tsx` already uses. Render
   `LogScreen`, press "Voice Input", assert the error text renders,
   assert `startSpeechRecognition` was never called, and assert the
   HubTile's sublabel reads "Needs the full app build".

In the **existing** `log.test.tsx` (unchanged mock, per N1), add one cheap
sanity assertion that the available path is genuinely active — e.g.
`isSpeechRecognitionAvailable === true` under the existing mock, or that
pressing "Voice Input" actually calls through to the existing mock's
`requestPermissionsAsync`/`start` (the real property path is
`mockedSpeech.requestPermissionsAsync`/`.start`/`.stop` — `mockedSpeech`
*is* the module object at `log.test.tsx:90`, not a nested
`.ExpoSpeechRecognitionModule` property). This guards against the wrapper
silently resolving to the unavailable branch in a way that would make every
existing "Voice Input works" assertion pass vacuously.

## Non-goals (out of scope for this ticket)

- Nothing about Barcode Hunt / camera permissions changes.
- No change to how Voice Input behaves when the module IS available — this
  is purely about the unavailable path.
- No change to `app.json`'s plugin config (already correct).
- Not fixing the N10 finding from ticket 006's CTO verdict (the latent
  ScrollView shrink-to-fit pattern shared by `index.tsx`/`companion.tsx`) —
  that's a separate, already-identified follow-up.

## Verification

- `npx jest` (bare — `--testPathPattern tabs` would NOT match the new
  `app/src/lib/__tests__/speech-recognition.test.ts` file, so the wrapper's
  own test would silently never run if that filter is kept) — full pass,
  new tests included.
- `npx tsc --noEmit` — same 3 pre-existing errors only, no new ones.
- Manual/live: not required to re-test on the physical device as part of
  this pipeline (the user already has one for real-world confirmation once
  built), but QA should confirm via the automated suite that both branches
  (available / unavailable) are exercised. Note: web's `/log` route has
  rendered without crashing throughout tickets 004-006's QA this session,
  meaning `expo-speech-recognition`'s web code path resolves successfully
  there (likely a real web-registered implementation via
  `expo-modules-core`, not the same `requireNativeModule` path that throws
  on Expo Go) — so `isSpeechRecognitionAvailable` is expected to be `true`
  on web, and web is NOT a convenient way to visually confirm the
  unavailable-state message. If QA wants a live screenshot of the
  unavailable-state message, it would need an actual Expo Go session,
  which is out of scope for this ticket's QA pass unless cheap to arrange.
