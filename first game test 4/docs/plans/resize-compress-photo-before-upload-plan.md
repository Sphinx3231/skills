# Plan: Resize/compress meal photos on-device before upload

Ticket: `docs/tickets/009-resize-compress-photo-before-upload.md`

## Design

New module: `app/src/lib/image-prep.ts`, exporting a single function:

```ts
export async function prepareImageForUpload(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<{ uri: string; name: string; type: string }>
```

(No `width`/`height`/`exif` params — Step 1b's measure-then-resize design
gets dimensions from a fresh render instead of trusting picker-reported,
pre-rotation values, and Step 1e drops the EXIF-tag-reading approach
entirely as unimplementable on iOS.)

`log.tsx`'s `pickAndAnalyze()` (`log.tsx:82-91`) calls this once, between
`const asset = picked.assets[0]` and `api.analyzePhoto(...)`, passing the
picked asset and using the returned `{uri, name, type}` in place of the raw
asset fields it uses today. `api.analyzePhoto`'s own signature
(`{uri, name, type}`) does not change — this is the entire integration
surface, satisfying the ticket's "preserve the existing upload interface"
requirement by construction: nothing above `pickAndAnalyze` needs to change
at all.

New dependency (install via `npx expo install`, not raw `npm install`, so
Expo's SDK-54 version resolution is respected — the same lesson from the EAS
lockfile incident: don't let local tooling pick a version SDK 54 wasn't
tested against):
- `expo-image-manipulator` — confirmed via Expo's SDK 54 docs as **"Included
  in Expo Go"**, so this does not reintroduce ticket 007's failure class (a
  native module missing from Expo Go silently dropping a route). No
  `app.json` config plugin registration needed for an Expo-Go-included
  module.

No new dependency is needed for the verification report's byte-size check —
`expo-file-system` is already present transitively (`~19.0.23` per
`package-lock.json`), and that check is a throwaway verification script, not
shipped code, so it doesn't need to become a direct `package.json`
dependency. If a future ticket wants to *ship* file-size logic, add it
explicitly then.

**Corrected runtime/rebuild analysis (this project runs a dev client, not
plain Expo Go, for its physical-device testing path — tech-lead review round
1 caught that the plan's original "no rebuild needed" claim was checked
against the wrong runtime).** `app/package.json` has `expo-dev-client
~6.0.21` and `eas.json`'s `development` profile sets `"developmentClient":
true` — the APK already installed on the team's S24 Ultra (built for ticket
007) is a **custom dev client**, and a dev client only contains native
modules present at ITS build time. Adding `expo-image-manipulator` would
need a new dev-client build to appear in that installed APK, which *would*
reopen the OneDrive-synced/spaces-in-path native-build-tooling risk (Gradle,
not Metro, is what's actually intolerant of that class of path).

**This ticket avoids that entirely by using plain Expo Go for all
verification instead of the dev-client APK.** `expo-image-manipulator` is
independently confirmed "Included in Expo Go" — meaning the *actual*, already
Play-Store-installed Expo Go client already contains this native module,
with zero rebuild of anything. This session already has a plain-Expo-Go
session running (`npx expo start`, no `--dev-client` flag) reachable from
the same S24 Ultra. All of Steps 0/1/3/4's device verification below uses
that path. **No EAS build, no dev-client rebuild, and therefore no
OneDrive-path native-build exposure for this ticket** — the exposure the
first plan draft dismissed does exist for this project in general, but this
specific ticket's implementation and verification never touches the code
path that would trigger it. (When the dev-client APK is eventually rebuilt
for some other reason, this dependency will be included automatically like
any other — no special action needed then either.)

## Step 0 — Confirm current on-device numbers empirically

Before writing `image-prep.ts`, get real (not estimated) numbers to compare
against later, closing the ticket's "report" requirement with actual
evidence rather than SDK-behavior inference alone:

1. In a quick throwaway script or via a temporary console.log in
   `pickAndAnalyze` (reverted before commit), log `asset.width`,
   `asset.height`, and `asset.fileSize` for a real photo picked from the
   gallery on a physical device or emulator with real photos loaded (the
   `run-foxbite-web` skill's Playwright approach doesn't apply here — this is
   native picker behavior, not a web DOM interaction, so use Android
   Studio's emulator with sample photos, or the physical device already
   used for tickets 006/007 testing).
2. Record these baseline numbers in the outcome doc before any code changes,
   confirming or correcting this plan's estimate that native capture
   resolution is in the multi-megapixel, multi-megabyte range with `quality:
   0.7`'s JPEG compression as the only current size-reducing factor.

If a physical/emulator device with loadable sample photos isn't reachable in
the build environment, fall back to three representative static JPEG test
fixtures (see Step 4) as the "before" baseline instead, and say so plainly
in the outcome doc rather than presenting inferred numbers as measured ones.

## Step 1 — Determine EXIF-orientation handling: design the dependency away, then verify what's left empirically

**Tech-lead review round 1 found the original design here was unimplementable
on iOS and contained a latent axis-inversion bug (B3/B4/B5 below), not just
under-verified.** Revised approach, in order:

**1a. Read `expo-image-manipulator`'s current source once it's installed**
(`node_modules/expo-image-manipulator/ios/**`, `android/src/main/java/**`)
to check whether the *current* contextual API (`manipulate()` /
`renderAsync()`) normalizes orientation on decode, before assuming any of the
older, `manipulateAsync`-era bug reports (Android/Galaxy axis-flip reports,
iOS EXIF-orientation-tag omission from `ImagePicker`'s parsed `exif` field)
still apply to this rewritten API. This is a documentation-read, not a
device test, and costs nothing — do it before writing Step 2's code, and
record what was actually found (quote the relevant source, don't paraphrase
from memory of unrelated issues).

**1b. Design the axis-inversion bug away entirely, regardless of 1a's
answer** — this is the actual fix for the b5-class bug (deciding the
resize's constrained axis from *pre-rotation* picker-reported dimensions,
which is wrong if any rotation happens between capture and resize):

```ts
// Render once, unmodified, purely to measure the ACTUAL post-decode
// dimensions — this reflects whatever orientation-handling the native
// decoder already did, regardless of whether that's auto-correction or
// not, so the resize-axis decision below never depends on knowing that
// answer in advance.
const measured = await ImageManipulator.manipulate(uri).renderAsync();
const isLandscape = measured.width >= measured.height;
```

Then perform the actual resize as a **second, independent `manipulate(uri)`
call from the original URI** (not by re-feeding `measured` back in) —
re-feeding a rendered `ImageRef` into `manipulate()` as a `source` is
type-legal per the docs (`source: string | SharedRef<'image'>`) but its
exact runtime behavior isn't confirmed, and a second fresh decode from the
URI is unambiguous and cheap enough for a single user-initiated photo scan.
This sidesteps the un-confirmed re-feed question entirely rather than
requiring yet another empirical check.

This measure-then-resize design means the resize-axis decision is correct
*regardless* of what 1a finds about auto-rotation — it was never the
question that mattered for that specific bug class.

**1c. What 1a's answer DOES still determine**: whether the final image
displays visually upright at all (a separate concern from which axis the
resize constrains). If 1a's source-read finds orientation is normalized on
decode (increasingly the default assumption for any actively maintained 2026
native image library — the specific historical bug reports about
`manipulateAsync` predate this full API rewrite and may simply not apply
anymore), no explicit `rotate()` call is needed and Step 2 ships without one.

**1d. Only if 1a's source-read is inconclusive or finds orientation is NOT
normalized**, verify live via **plain Expo Go** (not the dev-client APK — see
the runtime-analysis correction above) on the team's actual S24 Ultra: take
one real photo held at each of the four camera-rotation orientations
(portrait, upside-down, rotated-left, rotated-right), and visually confirm
(Read tool on the saved output) whether each comes out upright. This
specific device matters if 1a's read surfaces any device-family-specific
report — verify against the actual hardware in hand rather than an emulator.

**1e. Do not implement the "read the EXIF orientation tag from
`ImagePicker`'s `exif` field and rotate accordingly" branch from the
original plan draft at all.** Tech-lead review confirmed this is
unimplementable on iOS — iOS's Photos framework does not surface the
`Orientation` tag through `ImagePicker`'s parsed EXIF the way Android does,
so that branch would silently no-op on iOS while looking implemented. If 1a
or 1d finds real, unfixed rotation problems, the fix has to come from
`rotate()` calls informed by 1a's native-source findings (e.g. an
Android-only correction, explicitly scoped and commented as such), never
from trusting `asset.exif.Orientation` cross-platform. Do not add `exif:
true` to the `ImagePicker` launch calls unless 1a's source-read shows a
concrete need for it — it has no purpose otherwise.

Document 1a's actual source findings and (if reached) 1d's device-test
result in the outcome doc. If 1a resolves the question, 1d is skipped and
that's a stronger outcome (documentation-verified with no device time spent)
— say so plainly rather than manufacturing an unnecessary device test.

## Step 2 — Implement `image-prep.ts`

**Rewritten against the current, non-deprecated contextual API**
(`manipulate()` → chained methods → `renderAsync()` → `saveAsync()`) — the
original draft was written against `manipulateAsync(uri, actions,
saveOptions)`, which is deprecated in SDK 54. Confirmed the current shape via
Expo's own SDK 54 docs: `manipulate(source: string | SharedRef<'image'>) →
ImageManipulatorContext`, chainable `.resize({width, height})` /
`.rotate(degrees)` / etc., finalized with `.renderAsync(): Promise<ImageRef>`
(`{width, height}`), saved with `imageRef.saveAsync({format, compress,
base64?}): Promise<ImageResult>` (`{uri, width, height, base64?}`) — `format`
is a plain string literal `'jpeg' | 'png' | 'webp'` in the current API, no
`SaveFormat` enum needed.

```ts
import * as ImageManipulator from 'expo-image-manipulator';

// Claude's vision input caps the useful long edge around 2576px (newer
// models) — anything larger is downscaled server-side before the model
// ever sees it, so this resize discards no fidelity the model would
// otherwise use. 1024px sits comfortably below that cap while cutting
// typical multi-MB camera captures dramatically. Adjust here, not inline,
// if Step 4's before/after photo review finds real detail loss.
const JPEG_QUALITY = 0.8;

const MAX_DIMENSION = 1024;

export async function prepareImageForUpload(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<{ uri: string; name: string; type: string }> {
  const fallback = {
    uri: asset.uri,
    name: asset.fileName ?? 'photo.jpg',
    type: asset.mimeType ?? 'image/jpeg',
  };

  try {
    // Measure post-decode dimensions first (see Step 1b) — this is what
    // makes the resize-axis decision correct regardless of any rotation
    // the native decoder applied, and it doubles as the HEIC→JPEG /
    // EXIF-normalizing pass even when no resize ends up being needed.
    const measured = await ImageManipulator.manipulate(asset.uri).renderAsync();
    const longestEdge = Math.max(measured.width, measured.height);

    if (longestEdge <= MAX_DIMENSION) {
      const saved = await measured.saveAsync({ format: 'jpeg', compress: JPEG_QUALITY });
      return { uri: saved.uri, name: 'photo.jpg', type: 'image/jpeg' };
    }

    const isLandscape = measured.width >= measured.height;
    const resized = await ImageManipulator.manipulate(asset.uri)
      .resize(isLandscape ? { width: MAX_DIMENSION, height: null } : { width: null, height: MAX_DIMENSION })
      // [.rotate(degrees) here too, only if Step 1a/1d finds it's needed —
      // applied on this same fresh context, before resize per the docs'
      // sequential-application model, so the rotated image is what
      // actually gets measured for the resize's width/height targets]
      .renderAsync();
    const saved = await resized.saveAsync({ format: 'jpeg', compress: JPEG_QUALITY });
    return { uri: saved.uri, name: 'photo.jpg', type: 'image/jpeg' };
  } catch (err) {
    const isGuaranteedBackendFailure =
      asset.mimeType === 'image/heic' || asset.mimeType === 'image/heif';
    // Distinct log line for inputs the fallback can't actually rescue —
    // an original HEIC/HEIF falls back to a mimetype the backend's own
    // allowlist (food.js) rejects with a 400, so this isn't a benign
    // "resize failed, original still works" case. Keeping this separate
    // from the generic warn below makes real-world frequency of each
    // class visible rather than lumped together.
    if (isGuaranteedBackendFailure) {
      console.warn('[image-prep] manipulation failed on a HEIC/HEIF source — fallback will still fail server-side', err);
    } else {
      console.warn('[image-prep] resize/compress failed, uploading original photo', err);
    }
    return fallback;
  }
}
```

Two `manipulate(asset.uri)` calls (one to measure, one to actually produce
the resized output) means two native decodes in the oversized-source case —
an intentional, cheap tradeoff (this runs once per user-initiated photo
scan, on-device) in exchange for never having to verify whether re-feeding a
rendered `ImageRef` back into `manipulate()` as a `source` behaves as
expected.

**Cache cleanup**: `saveAsync`'s output lands in the OS cache directory and
is never explicitly deleted by this code. Left to the OS's normal cache
eviction — reasonable at this feature's actual call volume (one temp file
per scan, not a hot loop) — rather than adding cleanup code with no
demonstrated need.

Notes on specific ticket requirements this satisfies:
- **No upscale**: `longestEdge <= MAX_DIMENSION` skips the resize call
  entirely — an already-small image only gets the measure+save pass, which
  is still needed regardless for the HEIC→JPEG normalization guarantee.
- **Single named constant for quality**: `JPEG_QUALITY`, with the reasoning
  in its comment anchored to Claude's documented vision long-edge cap rather
  than an unfalsifiable "detail plateaus" claim (tech-lead review N4) — "tell
  me what you defaulted to and why" is answered inline, not just in the
  outcome doc.
- **Fallback on any failure**: the entire manipulation is in one `try`,
  falling back to the original untouched asset fields (matching what
  `pickAndAnalyze` uses today) — the scan proceeds at the original,
  more-expensive resolution rather than failing outright, with the one
  documented exception (HEIC/HEIF originals) getting a distinguishing log
  line since that fallback is known-futile, not just more expensive.

`log.tsx` change (the only call-site edit):
```ts
const asset = picked.assets[0];
const prepared = await prepareImageForUpload(asset);
setPhotoUri(prepared.uri); // was: asset.uri — review-screen preview should show what's actually uploaded
setStep('analyzing');
try {
  const analysis = await api.analyzePhoto(prepared); // was: { uri: asset.uri, name: asset.fileName ?? 'photo.jpg', type: asset.mimeType ?? 'image/jpeg' }
  ...
```

Do not add `exif: true` to `launchCameraAsync`/`launchImageLibraryAsync` —
per Step 1e, this design never reads picker-parsed EXIF, so that option has
no purpose here.

## Step 3 — HEIC input handling

`ImageManipulator.manipulate(uri).renderAsync()` followed by
`saveAsync({ format: 'jpeg', ... })` should transcode any input format —
including HEIC — to JPEG as part of its normal output-format contract: the
`format` option controls *output* only (`'jpeg' | 'png' | 'webp'`), and the
input is decoded by whatever the platform's native image decoder supports,
which includes HEIC on iOS natively.

**Verification constraint, stated plainly per the ticket's own ask**: this
Windows dev machine cannot produce or open a real HEIC file, and there is no
iOS device available in this session's environment (only the Android
S24 Ultra used in tickets 006/007). Two options, in preference order:
1. If a HEIC test fixture can be obtained (e.g. downloaded royalty-free HEIC
   sample, or converted from an existing JPEG via an online/CLI HEIC
   encoder if one is available in this environment) and Android's
   ImageManipulator can open it (Android decode-HEIC support varies by
   device/API level — check, don't assume), test directly.
2. If neither is possible, this ticket ships the HEIC-handling *code path*
   (untested against a real HEIC file) with the gap stated explicitly in the
   outcome doc as a deferred manual verification step, to be closed the next
   time an iOS device is available (the same "stop and ask / state the
   search space" discipline used for tickets with environment gaps before).
   Do not claim HEIC support is "verified" if it isn't.

## Step 4 — Before/after verification with three representative photos

Need three real or representative test images:
1. A bright, well-lit plate of food.
2. A dim/low-light shot (e.g. restaurant lighting).
3. A close-up of a single food item.

If real camera-captured samples aren't available in this environment, use
existing stock/sample food photos as substitutes and say so in the outcome
doc (matching Step 0's fallback-disclosure discipline).

For each: record original width×height and byte size, run through
`prepareImageForUpload`, record output width×height and byte size. Then
**actually view both the original and the compressed output side by side**
(Read tool on the saved files) and assess whether food identification and
rough portion boundaries are still legible at the new resolution/quality —
not just "the file got smaller." If any of the three shows visibly
mush/artifact-y detail at `JPEG_QUALITY = 0.8`, that's a real finding to
report, not something to paper over by raising the constant without
re-checking file size impact.

## Step 5 — Tests

New file: `app/src/lib/__tests__/image-prep.test.ts`, matching this project's
existing conventions (`jest-expo`, async render not applicable here since
this is a pure-function module — no RNTL needed).

**Mock shape** — must mock the chained contextual API, not the deprecated
`manipulateAsync(uri, actions, saveOptions)` shape the original plan draft's
tests were written against:
```ts
jest.mock('expo-image-manipulator', () => ({
  manipulate: jest.fn(),
}));
// per test: mock `manipulate` to return an object whose `.resize()` and
// `.rotate()` return `this` (chainable) and whose `.renderAsync()` resolves
// to a fake ImageRef `{ width, height, saveAsync: jest.fn().mockResolvedValue({ uri: '...' }) }`
// — assert on what `.resize()`/`.rotate()` were CALLED WITH, not on an
// actions array (there isn't one in this API).
```

Cases required by the ticket:
1. Already-small image (e.g. measured render returns `{width:400,
   height:300}`) → `resize()` is never called; `saveAsync({format:'jpeg',
   compress: JPEG_QUALITY})` is called directly on the first render's
   `ImageRef`, and only one `manipulate()` call happens total (no second
   decode when no resize is needed).
2. Oversized image (measured render returns e.g. `{width:4000,
   height:3000}`) → a second `manipulate()` call happens, `.resize()` is
   called with the correct constrained dimension (width or height,
   whichever axis, with the other explicitly `null`) and the correct
   aspect-preserving target value.
3. Non-square, both orientations: a measured portrait (e.g.
   `{width:2000,height:3000}`) and a measured landscape (e.g.
   `{width:3000,height:2000}`) — confirm `.resize()` is called constraining
   the correct axis in each case (assert on the actual call arguments, not
   just that resize was called) — this is the direct regression test for
   the axis-inversion bug (B5) tech-lead review round 1 found in the
   original draft's `isLandscape` derivation.
4. HEIC input — asset with `mimeType: 'image/heic'` → confirm
   `saveAsync` is still called with `format: 'jpeg'` and the returned `type`
   is `'image/jpeg'` (this test can run without a real HEIC file since it
   only asserts on mocked call arguments, not real decoding — the real-file
   gap from Step 3 is a live-verification gap, not a unit-test gap).
5. EXIF/rotation — shape depends on Step 1's actual finding (1a/1d), written
   once that's known:
   - If no explicit rotation is needed (1c): assert `.rotate()` is never
     called in any test case above.
   - If explicit rotation is needed for some platform/case (1d): assert the
     correct rotate-degrees value is passed to `.rotate()`, and that it's
     called on the SAME context before `.resize()` (order matters — confirm
     against the actual installed library's sequential-application
     behavior, don't assume, since rotating after an aspect-changing resize
     on a non-square image would target the wrong post-rotation dimensions).
6. Fallback path — mock `manipulate(...).renderAsync()` (or `.saveAsync()`)
   to reject, confirm `prepareImageForUpload` returns the original
   `uri`/`name`/`type` unchanged and that `console.warn` fired (spy-assert,
   don't just check the return value) — including a sub-case for a HEIC
   `mimeType` input confirming the distinct "guaranteed backend failure"
   warning text fires (per Step 2's `isGuaranteedBackendFailure` branch).

## Non-goals

(carried from the ticket, restated for the implementer)
- No change to the scan pipeline, the Claude/Anthropic call, or any backend
  code — `backend/src/routes/food.js`'s multer config and mimetype allowlist
  are untouched; the resize step should make every upload comply with the
  existing `image/jpeg` allowlist as a side effect, not because the backend
  changed.
- No change to `analyzePhoto`'s function signature.
- The "confirm before logging" feature idea is out of scope for this ticket.

## Build-time conditions from tech-lead round 2 (APPROVE, conditional — no further plan review needed)

**C1**: the dev-client APK already installed on the S24 Ultra will NOT
contain `expo-image-manipulator` after this merges (only plain Expo Go will,
per the runtime-analysis correction above). Before writing Step 2's final
code, determine whether a missing native module surfaces at **import time**
(would break the whole log screen — ticket 007's exact failure class) or at
**call time** (caught by the existing `try`, degrades cleanly). If import
breaks it, import `expo-image-manipulator` lazily inside the `try` block,
not at module scope. State plainly in the outcome doc that the dev client
is in this broken state until its next rebuild.

**C2**: when describing Step 0/Step 4's live Expo Go verification in the
outcome doc, note that the log screen was running in ticket 007's guarded
no-speech-recognition mode (Expo Go doesn't have `expo-speech-recognition`
either) — the photo path itself is unaffected, but say which mode the
screen was actually in rather than implying a fully-native environment.

**Non-blocking, verify at install time (not yet confirmed since the package
isn't installed)**: Step 2 assumes `format` is a plain string literal
(`'jpeg'`) and that `.resize({width, height: null})` type-checks. Confirm
both immediately after `npx expo install expo-image-manipulator` via `npx
tsc --noEmit`, before writing Step 5's mocks — same "assumed API shape"
risk class that round 1 was about.

## Verification

- `npx jest` from `app/` — full pass, no regressions, plus the new
  `image-prep.test.ts` suite passing.
- `npx tsc --noEmit` — same pre-existing error count only.
- Step 0's real before-numbers, Step 1's empirical EXIF-orientation finding,
  Step 3's HEIC verification-or-honest-gap statement, and Step 4's
  three-photo before/after report — all recorded with actual data in the
  outcome document, not asserted from documentation alone.
