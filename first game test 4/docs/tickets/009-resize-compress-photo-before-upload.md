# Ticket 009: Resize/compress meal photos on-device before upload

Status: **Plan approved** (round 2, conditional on two build-time additions) — awaiting user go-ahead to build.

## Summary

FoxBite is preparing for public release at hundreds to low-thousands of AI
photo scans per day. Photos currently upload at (near) native camera
resolution — multi-megabyte JPEGs with no resize step anywhere in the
pipeline — which costs money (larger vision-API input) and upload time for
no accuracy benefit; a 4000px-long-edge photo doesn't improve food
recognition or portion estimation over a ~1024px one.

**Scope is image handling only.** Do not touch the scan pipeline, the model
call (`backend/src/lib/anthropic.js`), the backend, or anything besides how
the photo is prepared on-device before `api.analyzePhoto()` is called.

## Current state (confirmed by reading the code)

- **Capture site**: `app/src/app/(tabs)/log.tsx:67-91`, `pickAndAnalyze()`.
  Camera and gallery selection share the exact same code path after
  permission request — only `launchCameraAsync` vs `launchImageLibraryAsync`
  differ, both called with `{ quality: 0.7, base64: false }`, no
  `maxWidth`/`maxHeight`/`allowsEditing`/`exif` options.
- **No resize step exists today**, on-device or server-side. `quality: 0.7`
  is JPEG compression ratio only, not a pixel-dimension control — photos
  leave the device at native capture resolution (commonly 3000-4000px long
  edge on modern phones).
- **Server-side** (`backend/src/routes/food.js:9,109-110`): `multer` enforces
  an 8MB size cap and rejects any `mimetype` other than `image/jpeg`,
  `image/png`, `image/webp` with a 400 — HEIC is not accepted today. Expo's
  own docs do not clearly guarantee `quality: 0.7` always forces a JPEG
  re-encode of an original HEIC library asset, so an occasional HEIC upload
  reaching that 400 today is plausible, not just theoretical.
- **Upload interface to preserve**: `app/src/lib/api.ts:55-60`,
  `analyzePhoto({ uri, name, type })` builds a `FormData` and POSTs it. This
  function's signature must not change — only what's passed to `uri`/`name`/
  `type` changes.
- **Dependency gap**: `expo-image-manipulator` is NOT currently installed.
  Confirmed via Expo's SDK 54 docs: it IS listed as "Included in Expo Go" —
  adding it will not reintroduce ticket 007's class of bug (a native module
  missing from Expo Go silently dropping a whole tab). `expo-file-system` is
  also not installed and may be needed for pre/post file-size stat.

## Scope

1. **Resize on-device before upload**: longest edge to ~1024px, preserving
   aspect ratio. Skip (no-op) if source is already at or below target — never
   upscale.
2. **JPEG compression** at a single named constant quality value (not
   hardcoded inline), documented with the reasoning for the chosen default.
3. **EXIF handling**: read the orientation tag, apply the rotation, then
   strip the rest of the EXIF metadata from the output. A sideways photo
   must not ship sideways.
4. **HEIC input**: convert to JPEG. Verification caveat: this dev environment
   has no way to produce a real HEIC test file (no iOS device attached) —
   genuine HEIC verification needs a real iPhone gallery photo, noted as a
   deferred/manual verification step if unavailable during the build.
5. **Preserve `analyzePhoto`'s existing call interface** — `log.tsx` and
   everything above it should not need to change beyond the URI it passes in.
6. **Error handling**: any resize/manipulation failure falls back to
   uploading the original unmodified asset rather than failing the scan
   outright — a more expensive scan beats a broken one. Log when this
   fallback fires (so real-world fallback frequency is visible later).
7. **Windows/OneDrive path caveat**: this project lives under
   `C:\Users\El Samaka\OneDrive\Desktop\Claude\first game test 4` — a
   OneDrive-synced path containing spaces. Flag in the plan whether
   `expo-image-manipulator` (or any alternative considered) has any known
   issue with spaces in the project path, OneDrive's on-demand file sync, or
   Windows-specific temp-file handling, before it's chosen.

## Non-goals

- No change to the scan pipeline, the Claude/Anthropic call, or any backend
  code.
- No change to `analyzePhoto`'s function signature or FormData shape.
- Not addressing the separate "confirm before logging" feature idea raised
  earlier (tracked in memory as a follow-up idea, not this ticket).

## Acceptance criteria

- [ ] Report (delivered before implementation) covers: capture site +
      current options, current dimensions/file size behavior, whether
      resize/compression happens today, and confirmation that camera +
      gallery share one path.
- [ ] Resize implemented: longest edge ~1024px, aspect ratio preserved, no
      upscaling of already-small sources.
- [ ] JPEG quality is a single named constant at the top of the module, with
      the chosen default explained.
- [ ] EXIF orientation read and applied before EXIF data is stripped.
- [ ] HEIC input converts to JPEG (or the plan documents why/how this is
      verified given the dev-environment constraint).
- [ ] `analyzePhoto`'s interface is unchanged; nothing above the new module
      needs to know the implementation changed.
- [ ] Resize failure falls back to uploading the original, with a log line
      marking the fallback.
- [ ] No Windows/OneDrive-path-related breakage in the chosen library.
- [ ] Before/after dimensions and byte sizes reported for three representative
      test photos (bright well-lit plate, dim shot, close-up of one item),
      with a genuine (not just "files got smaller") check that compressed
      output still shows the detail a vision model needs.
- [ ] New tests: already-small image (no-op), oversized image, non-square
      aspect ratio in both orientations, HEIC input, EXIF rotation applied
      correctly, and the failure-fallback path — matching this project's
      existing frontend test conventions (`jest-expo` + RNTL v14, async
      render/fireEvent).

## Pipeline

Full ticketed-change + gated-build cycle, consistent with tickets 004-008:
plan → tech-lead review → explicit user go-ahead → Sonnet build → Sonnet QA
→ Opus tech-lead → Opus CTO verdict → outcome/verdict docs → commit only on
explicit request.
