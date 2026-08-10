# Ticket 007: Log tab disappears entirely when the native speech-recognition module isn't linked

Status: **In progress** (plan being written)

## Summary

On a device/runtime where the `expo-speech-recognition` native module isn't
linked into the binary — confirmed today on plain **Expo Go** on a physical
Android device (S24 Ultra) — the Log tab doesn't just lose Voice Input, it
disappears from the tab bar entirely. The user sees Today and Companion,
with no way to reach Log at all.

## Root cause (confirmed by reading the code)

`app/src/app/(tabs)/log.tsx` imports `expo-speech-recognition` as a
**static, module-scope import**:

```ts
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionResultEvent,
  type ExpoSpeechRecognitionErrorEvent,
} from 'expo-speech-recognition';
```

`expo-speech-recognition`'s own module-scope code calls
`requireNativeModule('ExpoSpeechRecognition')`, which throws immediately if
the native module isn't present in the running binary — not lazily, not
only when Voice Input is actually used.

Expo Router's route-tree construction (`getRoutesCore`) eagerly
`require()`s every route file to build the tab/stack tree, including
`log.tsx`, before the user ever navigates there. So the throw happens during
initial app startup, and (per the observed symptom — the tab is missing,
not a crash screen) Expo Router appears to drop the failing route from the
tree rather than crashing the whole app.

**This is not a config problem** — `app.json` already registers the
`expo-speech-recognition` config plugin correctly with proper permission
strings (verified: `app.json` lines ~46-51). It's purely that the import is
unguarded, so any environment without the linked native module (Expo Go
being the common one — real native dev/production builds should have the
module linked via the registered config plugin) loses the entire tab, not
just the Voice Input feature within it.

## What should happen instead

Per this project's own stated convention (`.claude/skills/foxbite/SKILL.md`):
"Never ship placeholder functionality... unbuilt features render as visible
'coming soon' stubs." Voice Input and Barcode Hunt were originally stubs and
were later built out to real functionality (voice-barcode ticket). This
ticket restores the *spirit* of that convention for the case where the
underlying platform capability genuinely isn't available: Log tab should
always render, and Voice Input should degrade to a clear "not available in
this environment" state rather than taking the whole tab down with it.

## Acceptance criteria

- [ ] Log tab renders on Expo Go (no linked native speech module) — Today,
      Log, Companion all present in the tab bar.
- [ ] On Expo Go, tapping "Voice Input" shows a clear, honest message (not a
      crash, not a silently-broken button) — e.g. "Voice Input needs the
      full app build" or similar, consistent with the app's existing
      stub/empty-state tone.
- [ ] On a real dev-client/production build where the native module IS
      linked, Voice Input continues to work exactly as before — no
      regression to the real feature.
- [ ] No other screen/tab's behavior changes.
- [ ] New test coverage for both the "module available" and "module
      unavailable" code paths.

## Pipeline

Full ticketed-change + gated-build cycle, consistent with tickets 004-006:
plan → tech-lead review → explicit user go-ahead → Sonnet build → Sonnet QA
→ Opus tech-lead → Opus CTO verdict → outcome/verdict docs → commit only on
explicit request.
