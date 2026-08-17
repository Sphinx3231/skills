// Web recognition module (ticket 011, Step 2/3) — resolved by Metro on web
// only, via the settings-db.ts/settings-db.web.ts platform-extension
// precedent already established in this codebase. Runs CLIP zero-shot
// classification entirely in-browser via WASM — no call to
// POST /food/analyze for the photo-scan path.
//
// Deliberately NO `import()`/`require()` of `@huggingface/transformers`
// anywhere in this file (tech-lead condition, ticket 011 plan Step 2). This
// project's Jest/Babel setup cannot intercept a dynamic `import()` for
// mocking — log.test.tsx's own subscribe() test documents this exact
// failure verbatim ("A dynamic import callback was invoked without
// --experimental-vm-modules"), which is why image-prep.ts deliberately uses
// a lazy `require()` instead for its own native-module problem. Neither
// fix applies here: a `require()` can't fetch a CDN URL, and a bundler
// dynamic `import()` would need the package to be Metro-resolvable, which
// Step 0's CDN-loading decision deliberately avoids (see +html.tsx). The
// actual fix: +html.tsx's CDN `<script type="module">` is pure HTML,
// outside Metro/Jest's transform entirely — it loads the library and
// assigns the ready classifier to a `window` global once loaded. This
// module only ever reads that global, so there's nothing for Jest to fail
// to intercept — testing it means mocking the global directly (a plain
// object/Promise assignment), not mocking a module.
import * as api from './api';
import { CANDIDATE_LABELS } from './food-candidate-labels';
import {
  analyzeFoodClassification,
  type ClassificationResult,
  type FoodAnalysisResult,
} from './food-recognition-shared';

type ClipClassifier = (
  image: string,
  candidateLabels: string[],
  options?: { hypothesis_template?: string }
) => Promise<ClassificationResult[]>;

declare global {
  interface Window {
    __foxbiteClipPipeline?: ClipClassifier;
    __foxbiteClipPipelineReady?: Promise<ClipClassifier>;
    __foxbiteClipProgressState?: RawProgressEventDetail;
  }
}

const PROMPTS = CANDIDATE_LABELS.map((l) => l.prompt);

async function getClassifier(): Promise<ClipClassifier> {
  if (!window.__foxbiteClipPipelineReady) {
    throw new api.ApiError(
      0,
      'The food-recognition model failed to load — check your connection and try again.'
    );
  }
  return window.__foxbiteClipPipelineReady;
}

// Ticket 011's client-side billing pre-check (plan Step 3). Running
// classification entirely client-side, with no network call, would
// otherwise remove the backend's only enforcement point
// (`requireActiveAccess` on POST /food/analyze) for the 30-day trial ->
// subscription gate — an expired-trial user's scan would silently become
// free. This reuses the existing, already-authenticated GET /billing/status
// call (companion.tsx already makes the identical call) and checks
// `status === 'expired'` exactly, matching requireActiveAccess's own check,
// not a `daysLeft` computation that could diverge for active subscribers.
// Run on every scan attempt (not cached from screen load) — a trial that
// expires mid-session must not let the rest of that session scan free.
//
// Fail-closed: thrown as the SAME shape (`ApiError` with `status === 402`
// and a `{ billing }` body) the existing 402 branch in log.tsx's
// pickAndAnalyze() already handles for mobile's server-side 402 — so no
// change to log.tsx's catch logic is needed at all, on top of not needing a
// new branch for the success path either. If getBillingStatus() itself
// throws (network down, backend unreachable), this does NOT fall through to
// running local inference — it blocks with an honest, network-specific
// ApiError message instead, which surfaces via log.tsx's existing
// `err instanceof api.ApiError ? err.message : ...` fallback. Fail-open here
// would make "the network is down" an accidental one-step paywall bypass —
// not acceptable, and this check is client-side and technically bypassable
// by a modified client regardless (documented, not hidden).
async function assertActiveAccess(): Promise<void> {
  let billing: api.BillingStatus;
  try {
    billing = await api.getBillingStatus();
  } catch {
    throw new api.ApiError(0, "Couldn't check your subscription — try again when you're back online.");
  }
  if (billing.status === 'expired') {
    throw new api.ApiError(402, 'Your free trial has ended', { error: 'Your free trial has ended', billing });
  }
}

// Ticket 014 changed log.tsx's shared review UI to expect `{ items: [...] }`
// from every classifyFoodPhoto() implementation, native and web alike — this
// module's own CLIP scoring/decision logic (analyzeFoodClassification, in
// food-recognition-shared.ts) is untouched and still only ever produces one
// result, so this just wraps that single result as a one-item array (or zero
// items for its existing "couldn't identify anything" empty-foodName case)
// rather than changing what gets identified.
function toPhotoAnalysis(result: FoodAnalysisResult): api.PhotoAnalysis {
  if (!result.foodName) return { items: [] };
  return {
    items: [
      {
        foodName: result.foodName,
        // The local CLIP pipeline has no natural-language portion estimate
        // of its own (its nutrition rows are one-standard-serving database
        // defaults, already called out via `caveat` below) — left blank
        // rather than fabricating one.
        portionDescription: '',
        calories: result.calories,
        proteinG: result.proteinG,
        carbsG: result.carbsG,
        fatG: result.fatG,
        confidence: result.confidence,
        notes: result.notes,
        caveat: result.caveat ?? null,
      },
    ],
  };
}

export async function classifyFoodPhoto(photo: { uri: string; name: string; type: string }): Promise<api.PhotoAnalysis> {
  await assertActiveAccess();

  let results: ClassificationResult[];
  try {
    // `getClassifier()` is inside this try too: if the CDN script ran but
    // the model download itself failed, `window.__foxbiteClipPipelineReady`
    // is a rejected promise, and awaiting it here throws a raw library
    // error — that must surface as the same honest "couldn't classify"
    // message below, not the misleading "Could not reach the server."
    // string a call-site catch would otherwise print for an unrecognized
    // error shape.
    const classifier = await getClassifier();
    // `photo.uri` is prepareImageForUpload's web output — a `blob:` object
    // URL (confirmed by reading expo-image-manipulator's web
    // ImageManipulatorImageRef.saveAsync, which calls
    // `URL.createObjectURL(blob)`), not a Buffer like ticket 010's backend
    // input. transformers.js's RawImage input accepts a URL string (it
    // fetches it internally), which a `blob:` URL satisfies in-browser.
    results = await classifier(photo.uri, PROMPTS, {
      // Required — without this, the library's default hypothesis_template
      // ('This is a photo of {}') double-wraps CANDIDATE_LABELS[].prompt
      // (already a complete sentence like "a photo of pizza") into
      // nonsense like "This is a photo of a photo of pizza". Same gotcha
      // ticket 010's backend found and fixed; same library, same fix.
      hypothesis_template: '{}',
    });
  } catch (err) {
    // getClassifier()'s own "model failed to load" ApiError (window global
    // never set) is deliberately thrown with a more specific message than
    // the generic one below — re-throw it as-is rather than flattening it.
    // Anything else here (a rejected __foxbiteClipPipelineReady promise, or
    // the classifier call itself throwing) is an unrecognized error shape
    // and gets the honest, non-"server" fallback message.
    if (err instanceof api.ApiError) throw err;
    throw new api.ApiError(
      0,
      'Could not classify this photo — try again.',
      { originalError: err instanceof Error ? err.message : String(err) }
    );
  }

  return toPhotoAnalysis(analyzeFoodClassification(results));
}

export type ModelLoadProgress =
  | { status: 'downloading'; progress: number }
  | { status: 'ready' }
  | { status: 'error'; message: string };

type RawProgressEventDetail =
  | { status: 'initiate' | 'download' | 'done'; file?: string }
  | { status: 'progress'; file?: string; progress?: number; loaded?: number; total?: number }
  | { status: 'ready' }
  | { status: 'error'; message: string };

function translateProgressDetail(detail: RawProgressEventDetail): ModelLoadProgress {
  if (detail.status === 'ready') return { status: 'ready' };
  if (detail.status === 'error') return { status: 'error', message: detail.message };
  if (detail.status === 'progress') {
    return { status: 'downloading', progress: typeof detail.progress === 'number' ? detail.progress : 0 };
  }
  // 'initiate' | 'download' | 'done' — a file-level lifecycle event with no
  // meaningful percentage yet; report 0% so the UI can at least switch out
  // of "nothing is happening" as soon as the first one arrives.
  return { status: 'downloading', progress: 0 };
}

// Subscribes to +html.tsx's `foxbite-clip-progress` CustomEvent (dispatched
// on `window` by the CDN script's progress_callback) and translates it into
// a small, UI-friendly shape. Returns an unsubscribe function. Used to drive
// a real loading-progress state during the ~15s+ first cold model load
// (measured by the feasibility spike) instead of a bare unlabeled spinner.
//
// Real live verification (ticket 011, Step 6) found the CDN script starts
// downloading the model as soon as the page loads (+html.tsx's script has
// no dependency on sign-in or the Log tab being mounted) — so a caller that
// subscribes late (e.g. after signing in, well after the download already
// finished) would otherwise never see anything, since a CustomEvent has no
// memory of what already fired. Fixed by synchronously replaying
// `window.__foxbiteClipProgressState` (the latest known state, updated by
// +html.tsx alongside every dispatched event) to the callback immediately
// upon subscription, before also listening for whatever happens next.
export function onModelLoadProgress(callback: (progress: ModelLoadProgress) => void): () => void {
  if (window.__foxbiteClipProgressState) {
    callback(translateProgressDetail(window.__foxbiteClipProgressState));
  }

  function handleEvent(event: Event) {
    const detail = (event as CustomEvent<RawProgressEventDetail>).detail;
    if (!detail) return;
    callback(translateProgressDetail(detail));
  }

  window.addEventListener('foxbite-clip-progress', handleEvent);
  return () => window.removeEventListener('foxbite-clip-progress', handleEvent);
}
