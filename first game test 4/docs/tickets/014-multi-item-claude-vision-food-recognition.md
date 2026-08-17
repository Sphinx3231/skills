# Ticket 014: Multi-item food recognition via Claude vision

## Status

In progress.

## Background

Ticket 010 moved `POST /food/analyze` off Claude vision (`analyzeFoodPhoto` in
`backend/src/lib/anthropic.js`) onto a free, on-device CLIP zero-shot pipeline
(`analyzeFoodPhotoLocally`) specifically to remove the per-photo-scan Claude
API cost. `analyzeFoodPhoto` was left in the codebase, commented as
superseded, but has not been called from any route since.

Ticket 013 spent four rounds trying to get real multi-item, open-vocabulary
food recognition running entirely client-side/on-device (Wikipedia/DuckDuckGo
nutrition lookup, USDA FoodData Central, Florence-2, DETR, OWL-ViT, OWLv2,
and a CLIP-crop grid approximation). All five vision-model/architecture
attempts failed on hard, measured grounds — either a structural model
limitation (OWL-ViT/OWLv2 fail to load via ONNX export at all; DETR's 91-class
closed vocabulary; Florence-2 hallucinating/fragmenting items) or an immovable
latency wall (CLIP-crop grids took 11.4-22.5s against an 8s ceiling; expanding
CLIP's vocabulary 36→400 prompts caused a 7.77x latency increase). Ticket 013
was explicitly parked with no working replacement.

External research into current (2026) state of the art confirmed the
"real" solution to this class of problem (SAM2/YOLOWorld + monocular depth +
a GPU-backed inference server) is a legitimate but heavy architecture — a new
GPU-hosted serving surface FoxBite doesn't currently have or need for
anything else. Given `analyzeFoodPhoto` already exists, already handles
open-vocabulary recognition (an LLM, not a closed-set classifier), and
already emits a `confidence` field, extending it to return **multiple
separate items instead of one merged item** gets most of the value ticket 013
was chasing without any new infrastructure — at the cost of reintroducing a
per-scan Claude API call. This is accepted: `POST /food/analyze` is already
gated behind `requireActiveAccess` (trial/subscription), so the cost lands on
paying/trialing users, consistent with how the rest of the app treats this
route as "the one thing that costs us money per call."

## Goal

Replace the single, merged-into-one-entry food analysis result with an array
of separately identified items, each carrying its own rough portion estimate,
nutrition, and confidence — while keeping the mandatory human-confirm-before-
log step ticket 010 established as the durable mitigation for unreliable
model self-certification (this ticket does not attempt conformal prediction,
OOD rejection, or any other calibration technique from the research — Claude's
own `confidence` field plus human confirmation remains the approach).

## Scope

- **`backend/src/lib/anthropic.js`**: revive `analyzeFoodPhoto` (drop the
  "superseded" comment) and change its prompt/response contract:
  - Prompt: identify each distinct food item separately instead of combining
    them into one `foodName`. Each item gets its own rough portion estimate
    in natural language (e.g. "about 1 cup", "a medium fillet, ~150g") since
    there's no depth/reference-object data available — call this out in the
    prompt as an estimate, not a precise measurement.
  - Response shape: `{"items": [{"foodName": string, "portionDescription":
    string, "calories": number, "proteinG": number, "carbsG": number,
    "fatG": number, "confidence": "low"|"medium"|"high", "notes": string},
    ...]}`. Zero items (or a single `"Unknown"`/low-confidence item, your
    call on which reads cleaner) when no food is identifiable.
  - Rename the function if the contract change makes the old name misleading
    (e.g. `analyzeFoodPhotoMultiItem`); update its one call site.
- **`backend/src/routes/food.js`**: point `POST /food/analyze` at the revived
  function instead of `analyzeFoodPhotoLocally`. Response shape changes from
  a flat object to `{ items: [...] }` — find and update every client
  consumer of this endpoint's response shape (grep the client for the
  `/food/analyze` fetch call and its result-handling code; likely the photo
  scan screen/flow under `app/src/`).
- **Client**: the confirm-before-log screen needs to show and let the user
  edit/remove each item independently before logging, then log **one
  `food_log` row per confirmed item** (no schema change needed —
  `food_logs` already supports arbitrary per-row inserts; this is a client
  loop over the confirmed items array calling whatever the existing
  single-item log-save path is, or a small batch variant of it).
- **`analyzeFoodPhotoLocally`** (ticket 011's CLIP pipeline) and its
  supporting files stay in the codebase, unchanged and uncalled from this
  route — same "kept for reference, not deleted" treatment ticket 010 gave
  the original `analyzeFoodPhoto`.

## Non-goals

- No monocular depth estimation, reference-object scale calibration, or any
  other real (pixel-measured) portion/volume estimation — portions are the
  LLM's visual-language estimate only, same precision ceiling as the
  existing text-description-based `analyzeFoodText` already has.
- No SAM2/YOLOWorld/GPU-serving pipeline, conformal prediction, Mahalanobis/
  energy-based OOD rejection, or evidential deep learning — these remain
  documented as the "if this turns out insufficient" escalation path, not
  built here.
- No change to `analyzeFoodText` (voice/typed description) — still returns a
  single merged item; multi-item text descriptions are out of scope for this
  ticket.

## Acceptance criteria

- A photo of a real multi-item plate (e.g. chicken + rice + broccoli) returns
  multiple separate items from `POST /food/analyze`, not one merged entry.
- Each returned item has its own portion description, macros, and confidence.
- A photo with no identifiable food still returns a sane, low-confidence /
  empty result (no crash, no fabricated high-confidence guess).
- The confirm-before-log UI shows all returned items and lets the user
  adjust or remove any of them before saving; saving writes one `food_logs`
  row per confirmed item.
- Regression coverage for the new prompt/schema, the route's array handling,
  and the client's multi-item confirm/save flow, at the project's normal
  coverage floor.
- `analyzeFoodPhotoLocally`/CLIP pipeline continues to build and pass its
  existing tests even though nothing calls it anymore from this route.
