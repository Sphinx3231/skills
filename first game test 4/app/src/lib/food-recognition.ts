import * as api from './api';

// Native/default recognition module (ticket 011, Step 4) — resolved by
// Metro on iOS/Android (and by Jest, which does not do platform-extension
// resolution at all, so this file is also what every existing log.test.tsx
// case exercises today). This is a thin, unconditional wrapper around
// today's api.analyzePhoto() call — mobile's photo-scan behavior is
// provably untouched by this ticket, not just untouched by inspection,
// since there is no branch here to have gotten wrong.
//
// food-recognition.web.ts (the web twin, same exported signatures) is what
// actually changes for this ticket. Ticket 012 will later swap mobile onto
// a real on-device implementation by replacing ONLY this file's contents —
// zero log.tsx churn either time.
export function classifyFoodPhoto(photo: { uri: string; name: string; type: string }): Promise<api.PhotoAnalysis> {
  return api.analyzePhoto(photo);
}

export type ModelLoadProgress =
  | { status: 'downloading'; progress: number }
  | { status: 'ready' }
  | { status: 'error'; message: string };

// Mobile has no cold local-model-load step (it calls the backend), so this
// never fires — a permanent no-op subscription, kept only so log.tsx can
// call the same function on both platforms with no Platform.OS check.
export function onModelLoadProgress(_callback: (progress: ModelLoadProgress) => void): () => void {
  return () => {};
}
