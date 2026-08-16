import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// Ticket 011, Step 0: this file did not exist before this ticket — Expo
// Router only requires a +html.tsx for the web platform, and nothing prior
// to this ticket needed to customize the web HTML shell. It now exists
// solely to host the CDN-loaded `@huggingface/transformers` script below.
//
// Why a CDN <script type="module"> and not an app/package.json dependency:
// @huggingface/transformers's own `dependencies` include `onnxruntime-node`
// and `sharp` — native Node binaries. Installing the package into
// app/package.json would drag those into every `npm install`, including a
// future mobile EAS build that never uses this web-only path (ticket 012's
// territory). Loading it from jsDelivr here, as pure HTML outside Metro's
// bundle entirely, is the only way that actually keeps those native
// binaries out of the app's install graph. Named tradeoff: this introduces
// a runtime dependency on jsDelivr's CDN for a feature framed as "no
// server" — an accepted cost, since model weights already stream from the
// Hugging Face Hub at runtime regardless of loading strategy.
//
// This script sets a few globals once it runs:
//   - `window.__foxbiteClipPipelineReady`: a Promise that resolves to the
//     ready-to-call classifier function. food-recognition.web.ts awaits
//     this — it never imports the library itself (see that file's own
//     comment for why: this project's Jest/Babel setup cannot intercept a
//     dynamic `import()` for mocking, so the library is deliberately kept
//     out of the TS/JS module graph entirely).
//   - A `foxbite-clip-progress` CustomEvent, dispatched on `window` for
//     every progress_callback tick plus a final 'ready' (or 'error')
//     event — food-recognition.web.ts subscribes to this to drive the
//     cold-load progress UI (the model download is ~150MB+ and took ~14s
//     cold in the feasibility spike; a bare unlabeled spinner for that long
//     reads as broken).
//   - `window.__foxbiteClipProgressState`: the LATEST progress detail,
//     updated alongside every dispatched event. Real live verification
//     (ticket 011, Step 6, `run-foxbite-web`) found that this script starts
//     downloading the model as soon as the page loads — before sign-in,
//     before the Log tab is ever mounted — so a plain fire-and-forget
//     CustomEvent alone would silently lose every progress tick that
//     happened before food-recognition.web.ts's onModelLoadProgress()
//     subscribes (e.g. a user who signs in only after the download already
//     finished would never see a 'ready' event fire at all once they reach
//     the Log tab). Keeping the latest state queryable lets a late
//     subscriber synchronously catch up to whatever's already true instead
//     of only hearing about what happens next.
const CLIP_LOADER_SCRIPT = `
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

function reportProgress(detail) {
  window.__foxbiteClipProgressState = detail;
  window.dispatchEvent(new CustomEvent('foxbite-clip-progress', { detail }));
}

window.__foxbiteClipPipelineReady = pipeline(
  'zero-shot-image-classification',
  'Xenova/clip-vit-base-patch32',
  {
    // transformers.js defaults to the browser/WASM quantized (q8) model
    // variant unless overridden — NOT overridden here, so this stays the
    // same ~153.7MB combined download the feasibility spike measured, not
    // the ~606MB fp32 file ticket 010's backend downloads server-side.
    progress_callback: (data) => reportProgress(data),
  }
)
  .then((classifier) => {
    window.__foxbiteClipPipeline = classifier;
    reportProgress({ status: 'ready' });
    return classifier;
  })
  .catch((err) => {
    reportProgress({ status: 'error', message: err && err.message ? err.message : String(err) });
    throw err;
  });
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        {/* Disables body scrolling on web, matching every other Expo Router
            web shell — RN's own ScrollView components handle scrolling. */}
        <ScrollViewStyleReset />
        {/* eslint-disable-next-line react/no-danger */}
        <script type="module" dangerouslySetInnerHTML={{ __html: CLIP_LOADER_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
