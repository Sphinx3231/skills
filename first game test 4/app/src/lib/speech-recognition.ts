import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

type SpeechModule = typeof import('expo-speech-recognition');
type NativeModuleType = SpeechModule['ExpoSpeechRecognitionModule'];

// This try/catch is load-bearing — do not "simplify" it back into a static
// `import ... from 'expo-speech-recognition'`. That package calls
// requireNativeModule() at module scope, which throws whenever the native
// module isn't linked (e.g. plain Expo Go). Because Expo Router eagerly
// requires every route file to build the route tree, a static import here
// took the whole Log tab down before anyone even opened it (ticket 007).
// Metro's require() (metro-runtime/src/polyfills/require.js) rethrows a
// factory's error synchronously and caches the failure rather than handing
// back a half-initialized module on a later require of the same module, so
// requiring exactly once here, in a try/catch, is both safe and sufficient.
let speechModule: SpeechModule | null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  speechModule = require('expo-speech-recognition') as SpeechModule;
} catch {
  speechModule = null;
}

const nativeModule: NativeModuleType | null = speechModule?.ExpoSpeechRecognitionModule ?? null;

// Derived from `nativeModule`, not `speechModule`, so this flag can never
// drift out of sync with what the call sites below actually gate on.
export const isSpeechRecognitionAvailable = nativeModule !== null;

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

// A no-op fallback here is safe under React's rules of hooks specifically
// because `speechModule` is resolved once at module load and never changes
// within a JS context — so the hook-call shape inside any component using
// this (one real effect-based listener, or zero) is stable across every
// render of a given app session. This would NOT be safe if availability
// could flip at runtime mid-session, but it can't.
export const useSpeechRecognitionEvent: SpeechModule['useSpeechRecognitionEvent'] =
  speechModule?.useSpeechRecognitionEvent ?? (() => {});

export type { ExpoSpeechRecognitionResultEvent, ExpoSpeechRecognitionErrorEvent };
