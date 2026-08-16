// `expo-image-manipulator` is intentionally NOT imported at module scope.
//
// C1 (tech-lead round 2 build-time condition): the team's S24 Ultra
// currently has a custom dev-client APK installed (built for ticket 007)
// that predates this dependency and will NOT contain it until its next
// rebuild. Reading `expo-modules-core`'s `requireNativeModule` (which
// `expo-image-manipulator`'s `NativeImageManipulatorModule.ts` calls at
// ITS OWN module scope, i.e. as a side effect of merely importing
// `expo-image-manipulator`) shows it THROWS synchronously when the native
// module can't be found:
//
//   export function requireNativeModule<ModuleType = any>(moduleName: string): ModuleType {
//     const nativeModule = requireOptionalNativeModule<ModuleType>(moduleName);
//     if (!nativeModule) {
//       throw new Error(`Cannot find native module '${moduleName}'`);
//     }
//     return nativeModule;
//   }
//
// A static top-level `import * as ImageManipulator from 'expo-image-manipulator'`
// would therefore throw at IMPORT time on that dev-client build — exactly
// ticket 007's failure class (a missing native module taking down the
// whole Log screen via a module-scope crash, not a caught runtime error).
// Importing it lazily inside the `try` block below means that throw is
// caught by this function's own error handling and falls back to the
// original photo, instead of crashing the screen. Until the dev client is
// rebuilt, every scan on that APK will silently take the fallback path
// below (logged via the console.warn) — see the outcome doc; this state is
// source-verified (requireNativeModule's synchronous-throw behavior read
// directly from source, per above), not confirmed empirically on a real
// dev-client APK (Expo Go, which DOES bundle this native module, was used
// for all other verification in this ticket).

// Historical rationale (Claude vision, retired by ticket 010): Claude's
// vision input capped the useful long edge around 2576px, so 1024px sat
// comfortably below that cap while cutting typical multi-MB camera captures
// dramatically before the upload. Ticket 010 replaced Claude with a local
// CLIP classifier (ticket 010, backend-side) and ticket 011 replaced that
// with an in-browser CLIP classifier on web — CLIP's own preprocessing
// resizes to a small fixed input size (224x224) regardless, so this
// constant's cap doesn't protect model fidelity for either path today. It's
// kept at 1024px anyway because it still meaningfully shrinks the
// bytes actually uploaded to the backend on mobile (still relevant there —
// mobile still calls POST /food/analyze) and the bytes handed to the
// in-browser classifier on web (smaller image = less client-side decode/
// preprocessing work, even though the model's own resize would happen
// regardless). Not upload-size-motivated in the "reduce a network transfer"
// sense on web specifically, since web's classification never leaves the
// browser — see local-food-analysis's non-goals note. Adjust here, not
// inline, if a future photo review finds real detail loss.
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
    // Lazy require (not a static top-level `import`, and not a dynamic
    // `import()` either — this project's Jest/Babel setup doesn't
    // transpile `import()` to something Node's CJS runtime can execute
    // without `--experimental-vm-modules`, and Metro's own async-import
    // support isn't confirmed configured for this app either). A plain
    // `require()` inside this function body is the standard React
    // Native idiom for deferring a native module's load to call time: it
    // runs synchronously when this line executes (not at module load),
    // so a missing native module throws here — inside this `try` — same
    // as it would from any other statement in this block. See the
    // module-scope comment above (C1) for why that matters.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ImageManipulator, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');

    // Measure post-decode dimensions first (see Step 1b) — this is what
    // makes the resize-axis decision correct regardless of any rotation
    // the native decoder applied, and it doubles as the HEIC->JPEG /
    // EXIF-normalizing pass even when no resize ends up being needed.
    //
    // Step 1a's source-read confirmed both platforms already normalize
    // orientation on decode inside this call, before any explicit
    // rotate() would ever run: iOS's native module unconditionally adds
    // an `ImageFixOrientationTransformer` to every context the instant
    // `manipulate()` is called (expo-image-manipulator/ios/
    // ImageManipulatorModule.swift), and Android's `manipulate()` loads
    // the bitmap via Glide (expo-image-loader's `ImageLoaderModule.kt`,
    // `Glide.with(context).asBitmap().load(url)`), which auto-applies
    // EXIF orientation during decode by default (no `.dontTransform()`
    // or other override present to disable that). No explicit
    // `.rotate()` call is needed here on either platform.
    const measured = await ImageManipulator.manipulate(asset.uri).renderAsync();
    const longestEdge = Math.max(measured.width, measured.height);

    if (longestEdge <= MAX_DIMENSION) {
      const saved = await measured.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
      return { uri: saved.uri, name: 'photo.jpg', type: 'image/jpeg' };
    }

    // Deliberately OMIT the unconstrained axis key entirely rather than
    // setting it to `null` — live web verification (this ticket's Step 4
    // harness) found `expo-image-manipulator`'s web `resize` action checks
    // `width !== undefined` / `height !== undefined` (web/actions/
    // ResizeAction.web.ts), so an explicit `null` on the unconstrained axis
    // is treated as a *real* requested value (not "auto"), producing a
    // zero/NaN target dimension and throwing `IndexSizeError` inside
    // `createImageData` — caught by this function's own try/catch, but
    // silently falling back to the original photo on every oversized-image
    // resize on web. Native Android's `ResizeTransformer.kt` uses a plain
    // Kotlin `!= null` check (fine with either `null` or an omitted key),
    // so this omission is safe there too — it just also sidesteps the
    // web-specific bug instead of relying on a platform-conditional fix.
    const isLandscape = measured.width >= measured.height;
    const resized = await ImageManipulator.manipulate(asset.uri)
      .resize(isLandscape ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION })
      .renderAsync();
    const saved = await resized.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    return { uri: saved.uri, name: 'photo.jpg', type: 'image/jpeg' };
  } catch (err) {
    // Distinct log line for inputs the fallback can't actually rescue. On
    // mobile this still means exactly what it always has: a HEIC/HEIF
    // fallback carries a mimetype the backend's own allowlist (food.js)
    // rejects with a 400, so it isn't a benign "resize failed, original
    // still works" case there. On web (ticket 011) there is no backend
    // allowlist in this path at all — the fallback goes straight to the
    // in-browser CLIP classifier instead — but a HEIC/HEIF source is still
    // effectively guaranteed to fail there too, since most browsers'
    // canvas/image decoders can't read HEIC either; it just fails at
    // classification time instead of at a mimetype-allowlist check. Either
    // way this is not a benign fallback, so it's still worth its own log
    // line rather than being lumped in with the generic warn below.
    const isGuaranteedDownstreamFailure =
      asset.mimeType === 'image/heic' || asset.mimeType === 'image/heif';
    if (isGuaranteedDownstreamFailure) {
      console.warn('[image-prep] manipulation failed on a HEIC/HEIF source — fallback will still fail downstream (backend allowlist on mobile, browser decode on web)', err);
    } else {
      console.warn('[image-prep] resize/compress failed, uploading original photo', err);
    }
    return fallback;
  }
}
