# Outcome: Resize/compress meal photos on-device before upload

Ticket: `docs/tickets/009-resize-compress-photo-before-upload.md`
Plan: `docs/plans/resize-compress-photo-before-upload-plan.md`
Branch: `foxbite-resize-photo-before-upload` (branched from the tip of
`foxbite-scrollview-latent-pattern`, i.e. including ticket 008's commit —
**not yet merged to `main`** at branch time. `main`'s tip was
`9594862`/`ab7209d` (tickets 004-007); ticket 008's commit `c73ba54` sits on
top of that on the branch this was cut from but had not been merged to
`main` yet. Flagging this so the orchestrator can sort out the correct
merge base/order rather than assuming this branches cleanly off `main`.)

## What changed

### New dependency

`expo-image-manipulator: ~14.0.8`, installed via `npx expo install
expo-image-manipulator` (not raw `npm install`, per the plan). `package.json`
gained 1 line as expected, but the `package-lock.json` this produced was
**not** genuinely additive-only — it was generated under this machine's
local npm (11.x), which silently pruned four unrelated entries (
`@clerk/clerk-js/node_modules/react@19.2.8`, `.../react-dom@19.2.8`,
`.../scheduler@0.27.0`, and `utf-8-validate@5.0.10`) that npm 10.8.2 (the
version EAS actually builds with) still expects present, causing
`npm ci`/`npm ci --dry-run` under 10.8.2 to fail with
`EUSAGE ... Missing: react@19.2.8 from lock file`-style errors — the same
failure class as this repo's earlier commit `7a6b0b6`. Fixed post-review by
regenerating the lockfile specifically with
`npx npm@10.8.2 install --package-lock-only --ignore-scripts` (not the
local npm 11, which produces an incompatible lockfile) while leaving
`package.json` untouched. This restored the three `@clerk/clerk-js` nested
`react`/`react-dom`/`scheduler` entries, and `npx npm@10.8.2 ci --dry-run`
now succeeds cleanly with no EUSAGE/missing-from-lockfile errors. One
residual, deterministic difference remains and is disclosed here rather
than glossed over: the same npm 10.8.2 regeneration command still drops
the top-level `node_modules/utf-8-validate@5.0.10` entry (an
`optional: true, peer: true` native addon for `ws`, not present in
`node_modules` on disk either way) relative to this branch's pre-ticket
lockfile. This was re-run twice to confirm it's deterministic, not a
fluke. Unlike the three clerk entries, its absence does not reproduce any
`npm ci` error — `npx npm@10.8.2 ci --dry-run` passes with exit code 0 and
no mention of `utf-8-validate` at all, so it does not appear to be part of
the same missing-from-lockfile failure class, but it was not independently
root-caused further and is flagged for the tech-lead's judgment rather
than asserted as "additive only, zero removals."

### New file: `app/src/lib/image-prep.ts`

Exports `prepareImageForUpload(asset: {uri, fileName?, mimeType?}):
Promise<{uri, name, type}>`, implementing the plan's measure-then-resize
design:

1. `expo-image-manipulator` is **not** imported at module scope — see "C1"
   below for why. It's lazily `require()`'d inside the function's own
   `try` block.
2. A first `manipulate(uri).renderAsync()` measures the real, post-decode
   dimensions (this is also the HEIC→JPEG and orientation-normalizing
   pass — see Step 1 findings below).
3. If the longest edge is already ≤ `MAX_DIMENSION` (1024), it's saved
   directly as JPEG at `JPEG_QUALITY` (0.8) with no resize call and no
   second decode.
4. Otherwise, a **second, independent** `manipulate(uri)` call (fresh
   decode from the original URI, not re-feeding the measured `ImageRef`)
   resizes the correct axis based on the measured dimensions, then saves
   as JPEG.
5. Any failure anywhere in the above falls back to the original
   `uri`/`fileName`/`mimeType`, with a `console.warn` — a distinct warning
   text fires when the source `mimeType` is `image/heic`/`image/heif`,
   since that fallback is known-futile against the backend's mimetype
   allowlist, not just "more expensive."

`JPEG_QUALITY = 0.8` and `MAX_DIMENSION = 1024` are named constants at the
top of the module, each with an inline comment explaining the choice
(quality anchored to Claude's documented vision long-edge cap, not an
unfalsifiable "detail plateaus" claim).

### `app/src/app/(tabs)/log.tsx`

One integration point, exactly as the plan specified: in `pickAndAnalyze`,
`const asset = picked.assets[0]` is now followed by `const prepared =
await prepareImageForUpload(asset)`; `setPhotoUri(prepared.uri)` (was
`asset.uri` — the review-screen preview now shows what's actually
uploaded) and `api.analyzePhoto(prepared)` (was the raw
`{uri,name,type}` object built inline). `api.analyzePhoto`'s signature is
completely unchanged. No `exif: true` was added to either
`ImagePicker.launch*Async` call (per Step 1e — this design never reads
picker-parsed EXIF).

### New test file: `app/src/lib/__tests__/image-prep.test.ts`

9 new tests, mocking `expo-image-manipulator`'s current chainable
`manipulate()/resize()/rotate()/renderAsync()/saveAsync()` API shape (no
`manipulateAsync`/actions-array shape anywhere): already-small no-op
(asserts exactly one `manipulate()` call and no `resize()` call),
oversized landscape and portrait (asserting the exact `resize()` call
argument — the direct regression test for the B5 axis-inversion bug),
HEIC input, "never calls `rotate()`" (see Step 1 finding), the generic
fallback path (asserts the return value **and** spies on `console.warn`'s
exact text), the HEIC-specific fallback warning text, and a
no-fileName/no-mimeType default-fallback case.

## Deviations from the plan, found during implementation (as flagged as possible by the plan itself)

The plan's own "Non-blocking, verify at install time" section anticipated
some of this. What was actually found:

1. **Import shape.** `expo-image-manipulator`'s public API is `import {
   ImageManipulator } from 'expo-image-manipulator'` (a named export), not
   `import * as ImageManipulator from 'expo-image-manipulator'` as the
   plan's draft code used — `manipulate` is a method on the exported
   `ImageManipulator` object, not a module-level export. Caught
   immediately by `tsc` (`TS2339: Property 'manipulate' does not exist on
   type ...`).
2. **`format` is a `SaveFormat` enum, not a plain string literal.** The
   plan explicitly flagged this as unconfirmed. `tsc` proved it wrong:
   `saveAsync({format: 'jpeg', ...})` fails with `TS2322: Type '"jpeg"' is
   not assignable to type 'SaveFormat | undefined'`. Fixed by importing
   and using `SaveFormat.JPEG`.
3. **A real bug in the plan's `resize()` call shape, found via live
   execution, not just types.** The plan's code passed the unconstrained
   axis as an explicit `null` (e.g. `{width: MAX_DIMENSION, height:
   null}`). This type-checks fine (`resize(size: {width?: number | null;
   height?: number | null})`), but **`expo-image-manipulator`'s web
   `resize` action implementation checks `height !== undefined`, not
   truthiness or null** (`node_modules/expo-image-manipulator/src/web/
   actions/ResizeAction.web.ts`) — an explicit `null` is treated as a
   *real* requested height of `null`, producing `NaN`/zero target
   dimensions and throwing `IndexSizeError: The source height is zero or
   not a number` inside `createImageData`. This was caught by this
   function's own try/catch (so it silently degraded to the fallback
   path rather than crashing), but it meant **every oversized-image
   resize would have silently no-op'd to the original, full-size photo on
   web** — the exact kind of bug a purely-mocked unit test can't catch
   (the mock would happily accept `{width: 1024, height: null}` and never
   know the real library rejects it). Fixed by omitting the unconstrained
   axis key entirely (`{width: MAX_DIMENSION}` / `{height: MAX_DIMENSION}`)
   instead of passing `null` — confirmed safe for Android's native
   `ResizeTransformer.kt` too (plain Kotlin `!= null` check, indifferent to
   omitted-vs-explicit-null). Tests updated to assert the omitted-key shape
   (see `image-prep.test.ts`).

## Step 1 — EXIF-orientation finding (source-verified, no device test needed)

**1a's source-read was conclusive on both platforms; 1d (live device test)
was not needed.**

- **iOS**: `expo-image-manipulator/ios/ImageManipulatorModule.swift`'s
  `manipulate()` function unconditionally does `context.addTransformer(
  ImageFixOrientationTransformer())` the instant a context is created —
  quoting the transformer's own doc comment
  (`ios/Transformers/ImageFixOrientationTransformer.swift`): "Transformer
  that makes sure the image is oriented up and not mirrored. Guarantees
  that the original pixel data matches the displayed orientation." This
  runs on every `manipulate()` call, before any resize/rotate the caller
  adds.
- **Android**: `manipulate()` loads the source through
  `expo-image-loader`'s `ImageLoaderModule.kt`, specifically
  `Glide.with(context).asBitmap().load(url)` — Glide's bundled
  `Downsampler` applies EXIF-orientation-aware decoding by default, and
  this loader code has no `.dontTransform()` or other override present
  that would disable it.

Both platforms normalize orientation on decode **inside** `manipulate()`,
before any explicit `.rotate()` call would run — so no explicit rotation
call is needed anywhere in `image-prep.ts`, and none was added. `1e`'s
directive (never read `ImagePicker`'s `exif.Orientation` field) was
followed — `exif: true` was not added to either picker call.

This closes the ticket's "EXIF orientation read and applied" acceptance
criterion by construction (normalization happens for free inside the
existing measure/resize calls) rather than via new code, which is a
stronger outcome than adding an explicit `.rotate()` — nothing to get
wrong, on either platform.

**1d (live four-orientation device test) was skipped** — 1a's answer was
conclusive from source, so no device time was spent confirming it, per the
plan's own guidance that this is the stronger outcome when reached.

## Step 0 / Step 4 — Live before/after verification

### Environment constraints hit

- **No adb, no Android emulator, and no reachable physical device** from
  this build environment (`adb`/`emulator` commands are not installed;
  `adb devices` and `emulator -list-avds` both fail with "command not
  found"). This ruled out the plan's preferred path (a real photo picked
  from the gallery on the physical S24 Ultra via plain Expo Go, per Step 0
  and Step 4).
- **No real camera-captured or stock food photos** exist anywhere in this
  repo/environment either (checked; only app icon/UI assets exist).
- **No Clerk test credentials** were available in this session, and the
  entire route tree (including the Log tab) is gated behind Clerk sign-in
  at `_layout.tsx`'s root (`if (!isSignedIn) return <SignInScreen />`) —
  this blocked driving the actual Log tab UI end-to-end via a headless
  browser too.

### What was actually done instead

Per this project's `run-foxbite-web` skill guidance — "whenever a ticket
adds a new native-module dependency, actually run `npx expo start --web`
... and confirm the bundle boots with no Metro error," since mocked test
suites structurally cannot catch a broken/missing web implementation or a
library-API mismatch — the web dev server was started and driven with a
headless browser (Playwright, launched from a throwaway scratchpad
script, not added to the repo):

1. **Fresh web bundle boot check**: `npx expo start --web --clear`
   bundled cleanly — 1493 modules, zero "Unable to resolve" / "Metro
   error" lines in the log, `curl localhost:8098/` returned 200. This
   confirms `expo-image-manipulator`'s web implementation
   (`*.web.ts` files under `node_modules/expo-image-manipulator/src/`)
   resolves correctly for Metro's web bundle and doesn't break the whole
   app the way a missing web variant would have (this is exactly the
   failure class the skill's "known gaps" section warns is otherwise
   undetectable by mocked tests).
2. **Real, live execution of the shipped `prepareImageForUpload` code** —
   not mocked — via a **temporary** test-only hook added to `sign-in.tsx`
   (the one screen reachable without Clerk credentials, since it renders
   before the auth gate). The hook drew three synthetic canvas-based JPEG
   fixtures at native camera resolution (4032×3024, matching the ticket's
   "commonly 3000-4000px long edge" baseline estimate) standing in for the
   ticket's three requested cases, then ran each through the real,
   unmocked `prepareImageForUpload`. **This hook was fully reverted
   (`git checkout --`) before finishing — it is not part of this
   ticket's diff.** It is disclosed here, not hidden, because it's how the
   "Deviations" bug above was actually found (a bug a mocked jest test
   could not have caught, and the web variant not the mobile-native one).
3. **This is a real, disclosed substitution, not what the plan
   envisioned**: the plan's Step 0/4 wanted a physical Android device on
   plain Expo Go with real/stock photos. What was actually verified is
   the same shipped module code executing for real, but via Expo's
   **web** platform (canvas-based `expo-image-manipulator` implementation)
   against **synthetic, programmatically-drawn** fixtures, not native
   mobile decode against real camera photos. The measured numbers below
   are genuine (not inferred/estimated), but they exercise a different
   underlying native implementation than what ships to the S24 Ultra —
   flagging this distinction explicitly per this ticket's own "say what
   you actually verified" discipline (and per the parent request's C2
   framing: state which mode verification actually happened in, don't
   imply full native-device coverage).

### Baseline ("before") numbers — Step 0

No real device/camera baseline could be captured (see constraints above).
Substituted per the plan's own fallback instruction ("use existing
stock/sample food photos as substitutes and say so plainly") — further
degraded to **synthetic canvas-drawn fixtures**, since no stock photos
were available either, drawn at 4032×3024 (a realistic modern-phone native
capture resolution, matching the ticket's own stated estimate) as an
honest substitute baseline, not a real captured photo:

| Fixture | Dimensions | Bytes (before) |
|---|---|---|
| "Bright, well-lit plate" (high-contrast colored blobs on white plate/light background) | 4032×3024 | 141,988 |
| "Dim/low-light shot" (dark background, low-contrast muted blobs, vignette) | 4032×3024 | 112,923 |
| "Close-up of one item" (4,000 small high-frequency dot shapes filling the frame) | 4032×3024 | 995,393 |

### After `prepareImageForUpload` — Step 4

| Fixture | Dimensions (after) | Bytes (after) | Size reduction |
|---|---|---|---|
| Bright plate | 1024×768 | 16,942 | 88.1% smaller |
| Dim shot | 1024×768 | 11,739 | 89.6% smaller |
| Close-up | 1024×768 | 114,223 | 88.5% smaller |

### Visual quality check (Read tool on all six before/after files)

All three before/after pairs were actually viewed side by side (not just
diffed by file size):

- **Bright plate**: all four colored "food item" shapes remain crisply
  distinguishable with clean edges at 1024×768 — composition and relative
  proportions are visually identical to the original.
- **Dim shot**: the three overlapping muted shapes and background vignette
  remain distinguishable at the lower resolution; no new banding or
  posterization introduced by the compression.
- **Close-up** (the stress case — high-frequency fine detail, 4,000 small
  dot shapes): the dot texture pattern is still clearly resolved at
  1024×768/quality 0.8 — individual dots remain distinct, no visible
  mush/blur or JPEG blocking artifacts.

No detail loss was found at `JPEG_QUALITY = 0.8` on any of the three
fixtures — no need to reconsider the constant. (Caveat: these are
synthetic geometric fixtures, not real food photography with fine texture
like grain, char marks, or garnish — a real photo may reveal detail loss
this synthetic test cannot. This is exactly the gap a real device test
would close and is called out under Deferred below.)

## Step 3 — HEIC verification status

**Not verified against a real HEIC file — same environment gap the ticket
anticipated.** No iOS device is available in this session (only the S24
Ultra used in prior tickets, and it wasn't reachable here either — no
adb), and this Windows machine cannot produce or open a genuine HEIC file.
Per the plan's stated fallback (option 2): the HEIC→JPEG code path ships
**untested against a real HEIC file**. What IS verified:

- **Unit-level**: `image-prep.test.ts`'s HEIC test confirms that when
  `asset.mimeType === 'image/heic'`, `saveAsync` is still called with
  `format: SaveFormat.JPEG` and the returned `type` is `'image/jpeg'` —
  this only proves the code's own logic is correct given a mocked
  `renderAsync`, not that a real HEIC file actually decodes successfully
  through `expo-image-manipulator`'s native (or web) HEIC decode path.
- **Fallback behavior for a genuine, real-world HEIC decode failure** is
  covered by the dedicated "guaranteed backend failure" test and log line
  — if a real HEIC file ever fails to decode where this ships, the fallback
  correctly warns distinctly and (accurately) still fails server-side,
  rather than silently swallowing the case.

**This remains an explicitly deferred manual verification step** — closing
it needs a real iPhone gallery photo (or a genuine HEIC test fixture) run
through the app on a device with a working HEIC decoder, which this
session could not do.

## C1 — dev-client APK / import-vs-call-time finding

**Determined via source-read, not device testing**: `expo-image-manipulator`'s
`NativeImageManipulatorModule.ts` imports `requireNativeModule` from
`'expo'` (which re-exports `expo-modules-core`'s underlying implementation)
and calls `requireNativeModule('ExpoImageManipulator')` **at its own module
scope**
(i.e., as an unconditional side effect of merely importing
`expo-image-manipulator` from anywhere). Reading `requireNativeModule`'s
source directly:

```ts
export function requireNativeModule<ModuleType = any>(moduleName: string): ModuleType {
  const nativeModule = requireOptionalNativeModule<ModuleType>(moduleName);
  if (!nativeModule) {
    throw new Error(`Cannot find native module '${moduleName}'`);
  }
  return nativeModule;
}
```

This **throws synchronously** if the module isn't registered. A static
top-level `import ... from 'expo-image-manipulator'` in `image-prep.ts`
would therefore throw the instant that module is loaded — which, because
Expo Router eagerly requires every route file to build the tab tree
(the exact mechanism behind ticket 007's speech-recognition bug), would
take down the whole Log screen on any runtime missing the native module —
**precisely the failure class C1 asked to check for.**

**Resolution**: `expo-image-manipulator` is `require()`'d lazily, inside
`prepareImageForUpload`'s own `try` block, not imported at module scope
(see "Deviations from the plan, found during implementation" above — a
dynamic `import()` was tried first but doesn't transpile to something this
project's Jest/CJS environment can execute without
`--experimental-vm-modules`; a plain `require()` — the same lazy-load idiom
ticket 007's own `speech-recognition.ts` wrapper already uses — works
everywhere and keeps the throw inside this function's own error handling).

**Current state of the dev-client APK, stated plainly per C1's
instruction**: the S24 Ultra's currently-installed dev-client APK (built
for ticket 007) predates this dependency and will **not** contain
`expo-image-manipulator` until its next rebuild. Until then, every photo
scan run on that specific APK will silently take the fallback path (the
`require()` throws inside the `try`, `console.warn` fires, the original
unresized photo uploads) rather than crashing the Log screen. This was not
independently re-confirmed on that literal APK in this session (no device
access), but follows directly from the source-read above, and is the same
reasoning ticket 007's wrapper relies on for its own `require()`-inside-`try`
pattern. Plain Expo Go (used for all of this ticket's live verification, in
its web form) already bundles this module and is unaffected.

## C2 — verification-mode disclosure

Per C2's instruction: the live verification actually performed in this
session was **not** against the Log screen's real UI at all (Clerk
sign-in blocked reaching it — no test credentials in this environment),
and was **not** on plain Expo Go on the physical S24 Ultra either (no
adb/device access). It was Expo's **web** platform, driven by a headless
browser, executing the real `prepareImageForUpload` module directly via a
temporary test hook (see Step 0/4 above) — a different runtime
(canvas-based `expo-image-manipulator` web implementation, not the
native iOS/Android decoders) than what ships to the device. The Log
screen's speech-recognition guard state (ticket 007) never entered into
this verification, since the harness never rendered `log.tsx` at all.

## Automated test results

### `npx jest` (bare, in `app/`)

**38 test suites, 325 tests, all passing** (was 37/316 before this
ticket's 9 new tests in `image-prep.test.ts`).

### `npx tsc --noEmit`

Same 3 pre-existing errors only, no new ones:

```
src/components/animated-icon.tsx(150,5): error TS2698
src/components/app-tabs.web.tsx(72,15): error TS2322
src/components/ui/collapsible.tsx(22,13): error TS2322
```

None of these three touch `image-prep.ts` or `log.tsx`.

## Acceptance criteria status

- [x] Resize implemented: longest edge ~1024px, aspect ratio preserved
      (measure-then-resize design, axis chosen from measured dimensions),
      no upscaling of already-small sources (`longestEdge <= MAX_DIMENSION`
      short-circuits before any resize call).
- [x] `JPEG_QUALITY` is a single named constant at the top of the module,
      with the chosen default (0.8) explained inline, anchored to Claude's
      documented vision long-edge cap.
- [x] EXIF orientation is normalized before EXIF is stripped — by
      construction, not new code: both platforms' `manipulate()` already
      normalizes orientation on decode (source-verified, see Step 1),
      and `saveAsync`'s JPEG re-encode does not carry EXIF forward.
- [x] HEIC input converts to JPEG in the shipped code path (source/type
      confirmed and unit-tested); **not verified against a real HEIC
      file** — explicitly flagged as a deferred manual step per Step 3.
- [x] `analyzePhoto`'s interface is unchanged — `log.tsx` is the only
      call site touched, and it now passes the same `{uri, name, type}`
      shape, just sourced from `prepareImageForUpload`'s return value.
- [x] Resize failure falls back to uploading the original, with a
      distinct log line for the known-futile HEIC/HEIF case vs. the
      generic case — both covered by dedicated tests asserting the exact
      `console.warn` text.
- [x] No Windows/OneDrive-path breakage: `npx expo install` and all
      testing/bundling ran successfully from this OneDrive-synced,
      spaces-in-path project directory throughout this build. (No EAS/
      dev-client rebuild was performed for this ticket, per the plan's own
      design — that's the one path where OneDrive/Gradle risk would
      actually surface, and it's intentionally out of scope here.)
- [x] Before/after dimensions and byte sizes reported for three
      representative fixtures, with a genuine visual legibility check (not
      just file-size comparison) — see Step 4. Caveat: fixtures are
      synthetic (no real photo/device available), disclosed plainly above.
- [x] New tests covering: already-small (no-op), oversized (both
      orientations), HEIC input, EXIF/rotation (asserts `rotate()` is
      never called, per Step 1's finding), and the failure-fallback path
      (both generic and HEIC-specific warning text) — 9 tests in
      `image-prep.test.ts`.

## Deferred / not verified in this session

- **Real HEIC file decode** — see Step 3. Needs a real iPhone gallery
  photo or genuine HEIC fixture on a device with working HEIC decode.
- **Live verification on the actual physical S24 Ultra / plain Expo Go
  (mobile)** — no adb/device access in this build environment. The plan's
  intended verification path (real photo, real device, real Expo Go) was
  not performed; a web-platform substitute was used instead and is fully
  disclosed above (see C2).
- **The Log screen's actual UI** was never driven end-to-end in this
  session (Clerk-gated, no test credentials available) — only the
  underlying `prepareImageForUpload` module was directly exercised via a
  temporary, fully-reverted test hook.
- **Real food photography detail-loss check** — the three Step 4 fixtures
  are synthetic geometric shapes, not real food images with fine texture
  (char marks, garnish, grain). A real photo may reveal detail loss at
  `JPEG_QUALITY = 0.8` that this synthetic test cannot surface.
- **Dev-client APK re-confirmation** — C1's import-vs-call-time finding is
  source-verified, not re-confirmed by actually running the current
  dev-client APK on the S24 Ultra in this session (no device access).

## Not touched / out of scope (per plan)

- The scan pipeline, `backend/src/lib/anthropic.js`, and all other backend
  code — untouched. `backend/src/routes/food.js`'s multer config/mimetype
  allowlist unchanged; this feature makes every upload comply with it as a
  side effect, not because the backend changed.
- `analyzePhoto`'s function signature — unchanged.
- The "confirm before logging" feature idea — out of scope, unrelated.
