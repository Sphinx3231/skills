# Plan: Voice Input and Barcode Hunt logging

Ticket: [Sphinx3231/skills#2](https://github.com/Sphinx3231/skills/issues/2)
Branch: `foxbite-voice-barcode` (isolated from `main`, gated-build pipeline
combined with the ticketed-change tracking discipline per the user's
explicit request to use both).

## Context

The Log screen's tile hub (`app/src/app/log.tsx`) has two honest "Coming
soon" placeholders — Voice Input and Barcode Hunt — alongside working
Snap & Track (AI photo scan) and From library tiles. This replaces both
stubs with real implementations, confirmed with the user beforehand on
three real architecture decisions:

1. Voice → nutrition: transcript sent to Claude (new text-analysis
   endpoint), mirroring the photo-scan flow — same review/edit step, same
   trial billing gate (it costs money per call).
2. Speech-to-text: on-device via `expo-speech-recognition` (Android + Web,
   no API key, no new backend work for transcription itself).
3. Barcode data source: Open Food Facts (free, public, no API key),
   proxied through a new backend route.

**Installed Expo SDK is 54.0.36** (verified via `require('expo/package.json').version`,
not assumed from `package.json`'s `^54.0.0` range). `app/AGENTS.md` used to
say to check v57 docs — confirmed stale with the user and corrected as part
of this ticket's investigation (see the file's own history/comment). Build
against SDK 54.

**Expo Go compatibility, verified per-package, not assumed**: `expo-camera`'s
`CameraView` + `barcodeScannerSettings`/`onBarcodeScanned` (the API this plan
uses, not the newer `launchScanner`/`onModernBarcodeScanned`) works in
standard Expo Go — no dev build needed for Barcode Hunt. `expo-speech-recognition`
explicitly requires a custom development build (`npx expo run:android`) on
native Android; it works directly in-browser on web via the Web Speech API
with no dev build needed there. **Practical consequence**: the user can
verify Barcode Hunt and Voice-Input-on-web through the normal `npx expo
start --web` flow already used this session, but verifying Voice Input on
an actual Android device requires building a dev client first — that's a
manual step for the user, not something this ticket's automated tests or
the `run-foxbite-web` skill can cover. Say this plainly in the outcome doc
rather than claiming Android voice input was "verified" when only the web
path and the mocked-native-module code paths were.

## Verified API shapes (not guessed — checked against real docs/responses)

**`expo-camera` (`~17.0.x` for SDK 54) barcode scanning**:
```tsx
const [permission, requestPermission] = useCameraPermissions();
<CameraView
  barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
  onBarcodeScanned={(result) => { /* result.type, result.data */ }}
/>
```

**`expo-speech-recognition`** (event-based, not promise-based):
```tsx
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
useSpeechRecognitionEvent('result', (event) => setTranscript(event.results[0]?.transcript));
useSpeechRecognitionEvent('error', (event) => setError(event.message));
ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true });
ExpoSpeechRecognitionModule.stop();
```
Permissions: `ExpoSpeechRecognitionModule.requestPermissionsAsync()` (covers
both microphone and, on iOS, the network speech recognizer — not relevant
for Android/Web but harmless to call everywhere).

**Open Food Facts** (`GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json`),
verified with a real barcode (`3017620422003`):
```json
{
  "code": "3017620422003",
  "status": 1,
  "status_verbose": "product found",
  "product": {
    "product_name": "Nutella",
    "nutriments": {
      "energy-kcal_100g": 539,
      "proteins_100g": 6.3,
      "carbohydrates_100g": 57.5,
      "fat_100g": 30.9
    }
  }
}
```
`status: 0` means not found. **All nutriment values are per-100g by
default, not per-serving** — Open Food Facts commonly also has
`product.serving_size` plus `_serving`-suffixed nutriment keys
(`energy-kcal_serving`, `proteins_serving`, etc.) when a product's packaging
states a serving size. **Prefer the `_serving` keys when present; fall back
to `_100g` only when they're absent.** This mostly dissolves the caveat
instead of just labeling it — most products with real serving-size data need
no caveat at all. When falling back to `_100g` values, the caveat must get
real visual weight, not the muted `notes` treatment `log.tsx`'s review card
already gives incidental AI commentary (`type="small" themeColor="textSecondary"`,
below the number fields) — style it like the existing low-confidence banner
(`styles.lowConfidence`, its own colored line *above* the fields,
`log.tsx:228-232`) since this is something the user must act on
(mentally scale for their actual portion), not read-and-ignore commentary.

## Scope of implementation

### Backend (`backend/src/`)

1. **`src/lib/anthropic.js`**: add `analyzeFoodText({ description })`,
   parallel to the existing `analyzeFoodPhoto`. Same response shape
   (`{foodName, calories, proteinG, carbsG, fatG, confidence, notes}`), a
   text-only prompt adapted from `FOOD_ANALYSIS_PROMPT` (estimate from a
   spoken/typed description instead of an image; same "Unknown"/low-confidence
   fallback for descriptions that aren't food).
2. **`src/routes/food.js`**:
   - `POST /food/analyze-text` — behind the same `requireActiveAccess`
     trial gate as `/analyze` (it costs money per call too). Body:
     `{ description: string }`. Calls `analyzeFoodText`, same
     502-on-failure handling as the photo route.
   - `GET /food/barcode/:code` — **not** behind `requireActiveAccess` (free
     API, no per-call cost). **Validate `:code` against `/^\d{8,14}$/`
     before making any outbound request** (this route is ungated, so it's
     the one place in this ticket a malicious or malformed value reaches an
     external HTTP call unchecked) — reject non-matching input with 400,
     never forward it. Send a real `User-Agent` header on the outbound
     request (Open Food Facts' usage policy throttles generic/missing
     agents — e.g. `FoxBite - <backend origin or contact>`).
     Response handling:
     - `status === 0` → 404, `{ error: "No product found for this barcode" }`.
     - `status === 1` but neither `_serving` nor `_100g` energy/macro keys
       are present (a real, common case — many OFF entries have a name but
       incomplete nutrition data) → **404** with a distinct message
       (`{ error: "Found a product, but it has no nutrition data on file" }`)
       — do NOT pass `NaN`/`undefined` through as if it were a valid
       `FoodAnalysis`; `POST /food/logs` would otherwise reject it downstream
       with a confusing generic 400 (`Number.isFinite(calories)` check).
     - Otherwise → 200, mapped to `FoodAnalysis` shape per the serving/100g
       preference above, `confidence: 'medium'`, `notes` stating whichever
       basis was actually used (serving size and its stated quantity, or the
       per-100g caveat).
3. Backend tests (Node's built-in `node --test`, module-mocking
   `../src/lib/anthropic.js` and network calls the same way existing tests
   mock dependencies): success/failure/billing-gate cases for
   `/analyze-text`; for `/food/barcode/:code` — found-with-serving-data,
   found-with-only-100g-data, found-but-no-nutrition-data (the 404 case
   above, not just plain not-found), not-found (`status: 0`),
   invalid-code-rejected-before-fetch, and network-failure. Mock the
   outbound `fetch` — confirm what HTTP client the codebase already uses
   server-side (native `fetch` should be available in this Node version;
   verify rather than assume).

### Frontend (`app/src/`)

4. **New dependencies**: `expo-camera`, `expo-speech-recognition` — install
   via `npx expo install` (lets Expo pick SDK-54-correct versions rather
   than pinning guessed ones), add both to `app.json`'s `plugins` array per
   each package's own config-plugin setup (camera + microphone permission
   strings).
5. **`app/src/lib/api.ts`**: add `analyzeText(description: string)` and
   `lookupBarcode(code: string)` client functions, mirroring the existing
   `analyzePhoto` function's error handling (including the 402/billing
   paywall path for `analyzeText`).
6. **`app/src/app/log.tsx`**:
   - Voice Input tile: no longer `disabled`. Tapping it starts recording
     (mic icon → recording state, similar visual weight to `analyzing`),
     with `interimResults: true` so the UI can show live partial text as
     the user speaks. **Only submit to `analyzeText` on a `result` event
     where `event.isFinal` is true** (or the `end` event, whichever the
     library actually fires reliably on web + Android — confirm during
     implementation rather than assuming) — interim results are for
     display only, never sent to the backend mid-utterance.
   - Barcode Hunt tile: no longer `disabled`. Tapping it opens a camera
     view (new `step` value, e.g. `'scanning'`) with `CameraView` +
     `onBarcodeScanned`. **`onBarcodeScanned` fires continuously while a
     barcode stays in frame** — guard with a ref/state flag so only the
     first scan in a session triggers `lookupBarcode`; ignore subsequent
     fires until the user backs out or the lookup completes (success or
     error), otherwise one scan triggers N duplicate lookups. On a
     successful scan, call `lookupBarcode` → same `review` step, with the
     serving/100g caveat visible before Save per the styling decision
     above.
   - `confirmSave`'s `createLog` call currently hardcodes `source: 'ai'`
     (correct for the photo flow, since it's genuinely a Claude estimate).
     Voice Input is also a genuine Claude estimate, so it uses `source:
     'ai'` too. Barcode Hunt is real packaged-food data, not an AI guess —
     use a new `source: 'barcode'` value (the `food_logs.source` column is
     a plain `TEXT` with no `CHECK` constraint, so this needs no migration).
     **This requires two more changes the client-side description above
     doesn't cover on its own:**
     - `backend/src/routes/food.js`'s `POST /food/logs` currently sanitizes
       on write with `source === "ai" ? "ai" : "manual"` — a binary
       coercion that would silently collapse `'barcode'` back to
       `'manual'`. Widen it to an allowlist:
       `['ai', 'barcode'].includes(source) ? source : 'manual'`, with a
       backend test asserting `'barcode'` actually round-trips through a
       real insert+read, not just that the route accepts the request.
     - `app/src/lib/api.ts`'s `createLog` parameter type and the `FoodLog`
       type's `source` field are both currently typed `'ai' | 'manual'` —
       widen both to `'ai' | 'manual' | 'barcode'`, or `tsc --noEmit` fails
       and this ticket's own final acceptance criterion (no new tsc errors)
       is violated by its own feature.
     Update `index.tsx`'s Dashboard meal-timeline label (currently
     `item.source === 'ai' ? 'AI scan' : 'Manual'`) to a proper mapping —
     `'ai'` → "AI scan", `'barcode'` → "Barcode scan", anything else →
     "Manual" — so barcode-logged entries don't misleadingly show as
     "Manual". (`index.test.tsx`'s existing test for this label asserts on
     the current binary version and will need extending.)
   - Permission-denied handling for both mirrors the existing
     `pickAndAnalyze`'s pattern (a clear error message, not a silent
     failure).
7. Frontend tests (`jest-expo` + RNTL, mirroring `log.test.tsx`'s existing
   mock patterns for `expo-image-picker`): mock `expo-speech-recognition`'s
   event hooks and `expo-camera`'s `CameraView`/`useCameraPermissions`,
   covering the same success/error/billing-paywall shapes already tested
   for the photo flow, plus permission-denied for both new tiles.

## Explicitly out of scope

- Editing/improving the existing Snap & Track / From library flows.
- Any change to the Foxxy companion, GIF moments, or design-refresh work.
- Multi-language speech recognition (English only, `lang: 'en-US'`, for
  this pass).
- A "no camera on this device" or "no microphone" fallback UI beyond a
  clear error message — full offline/no-hardware handling is a possible
  follow-up, not blocking this ticket.

## Acceptance criteria

- [ ] Voice Input tile: records → transcribes → sends to `/food/analyze-text`
      → shows the same review card as the photo flow → saves via the
      existing `createLog`/`finishLogging` path.
- [ ] Barcode Hunt tile: opens camera → scans a barcode → calls
      `/food/barcode/:code` → shows the review card (with the per-100g
      caveat visible only when the product lacks `_serving` data, per the
      serving/100g preference above) → saves via the same path.
- [ ] `/food/analyze-text` is gated by the trial the same way `/analyze` is
      (a 402 shows the existing paywall).
- [ ] `/food/barcode/:code` is **not** gated (works during/after trial
      expiry).
- [ ] A barcode with no Open Food Facts match (`status: 0`) shows a clear
      "not found" error, not a crash or a silently-empty review card.
- [ ] A barcode that matches a product with no usable nutrition data shows
      a distinct "found, but no nutrition data" error — not the generic
      `Number.isFinite(calories)` 400 from `/food/logs`, and not a review
      card full of `NaN`/blank fields.
- [ ] A malformed/non-numeric barcode value is rejected with 400 before any
      outbound request to Open Food Facts.
- [ ] Rapid repeated `onBarcodeScanned` fires for the same barcode trigger
      exactly one `lookupBarcode` call, not one per frame.
- [ ] A product with `_serving`-suffixed nutrition data uses those values
      and shows no per-100g caveat; a product with only `_100g` data shows
      the caveat with real visual weight (matching `styles.lowConfidence`'s
      treatment), not muted `notes` styling.
- [ ] Barcode-sourced log entries show as "Barcode scan" (not "Manual") in
      the Dashboard's Daily Forage timeline.
- [ ] Full `npx jest --coverage` in `app/` and `node --test
      --experimental-test-coverage` in `backend/` stay green at or above
      their current bars (frontend: 97.82%/89.52%/97.81%/99.35%; backend:
      ~98% lines, per `HANDOFF.md`).
- [ ] `npx tsc --noEmit` shows no new errors beyond the same 3 pre-existing
      ones.

## Review

Gated-build pipeline (Sonnet build → Sonnet QA → Opus tech-lead → Opus CTO,
Fable unavailable on this plan), combined with ticketed-change's tracking:
ticket filed, this plan awaiting reviewer approval next, then build only
after the user's explicit go-ahead per the hard gate.
