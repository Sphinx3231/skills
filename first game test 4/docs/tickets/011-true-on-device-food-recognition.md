# Ticket 011: True on-device food recognition — web

Status: **Plan approved (web-only scope, conditional on 5 doc/spec fixes,
all applied) — cleared to build, awaiting explicit user go-ahead.**

**Scope change note**: this ticket originally covered both web and mobile.
Tech-lead review of the combined plan recommended splitting it, because web
has a fully verified, no-open-risk path today while mobile still depends on
an unproven real EAS build (native Android compile, never tested — see
`docs/outcomes/on-device-clip-feasibility-spike-findings.md`'s
`react-native-executorch` section). The user agreed to split. Mobile is now
tracked separately as `docs/tickets/012-true-on-device-food-recognition-mobile.md`,
gated on that build test. This ticket covers **web only**.

## Summary

Ticket 010 (merged) runs CLIP zero-shot classification **server-side** for
photo scans on all platforms, behind FoxBite's existing mandatory
confirm-before-log review screen. The user's goal is zero backend AI
dependency. A feasibility spike (`docs/outcomes/on-device-clip-feasibility-spike-findings.md`)
verified — by actually running it in a headless browser via WASM — that
`@huggingface/transformers` (the exact library ticket 010 already uses)
can run the same CLIP model entirely in-browser, no server call, on web.
This ticket ships that for the web platform. Mobile keeps calling ticket
010's backend endpoint for now (an explicit, disclosed interim state, not
a silent gap) until ticket 012 resolves the native path.

## A real gap the plan review surfaced: the paywall

`POST /food/analyze`'s `requireActiveAccess` middleware is currently the
**only** enforcement point for the 30-day trial → subscription gate on
photo scanning. Running classification entirely client-side, with no
network call, removes that enforcement path entirely — an expired-trial
user's photo scan would silently become free. **Decision (user-confirmed)**:
add a client-side billing check — call the existing, already-authenticated
`GET /billing/status` (already used by `companion.tsx:54`) before running
local inference, and block the scan with the same paywall UI `log.tsx`
already shows for a 402 today. This is technically bypassable by a
modified client, same as most client-side gates, but preserves the
intended UX and keeps this a paid feature as designed.

## Scope

1. Web-only recognition module (`app/src/lib/food-recognition.web.ts`)
   running `@huggingface/transformers`'s zero-shot-image-classification
   pipeline in-browser, reusing ticket 010's exact model
   (`Xenova/clip-vit-base-patch32`) and candidate label list.
2. Shared, platform-agnostic scoring/decision module ported from ticket
   010's backend `local-food-analysis.js` (anchor-in-top-K detection,
   confidence-from-margin, `foodName`-only-from-nutrition-table safety
   invariant) plus the nutrition lookup function itself — not just the
   data file.
3. A pre-scan client-side billing check (see above), gating the local
   inference path the same way `requireActiveAccess` gates it today.
4. `log.tsx`'s `pickAndAnalyze()` (web build only) calls the new local
   module instead of `api.analyzePhoto()`; everything from `setResult(...)`
   onward — the review screen, `confirmSave()`, ticket 010's four targeted
   deltas — is unchanged. Mobile's `pickAndAnalyze()` path is untouched and
   keeps calling the backend.
5. Correct the stale rationale in `app/src/lib/image-prep.ts` for the
   HEIC-backend-rejection branch and the `MAX_DIMENSION` upload-size
   comment, since web's local path no longer goes through the backend's
   mimetype allowlist or benefits from upload-size reduction the same way.

## Non-goals

- Mobile — tracked separately in ticket 012, gated on a real EAS build
  test not yet run.
- iOS — not applicable to this ticket (web-only); ticket 012 to decide its
  own iOS scope separately, with real device access.
- Re-deciding the CLIP-zero-shot-plus-confirm-screen product approach —
  unchanged from ticket 010.
- Solving CLIP's non-food-confidently-wrong failure mode at the model
  layer — still an open, named residual risk from ticket 010, unrelated to
  where the model executes.
- Deleting `POST /food/analyze`/backend recognition code — stays load-bearing
  for mobile until ticket 012 resolves that path; not touched here.
- Backend hosting/deployment, multi-item meal recognition — unrelated,
  pre-existing.

## Acceptance criteria

- [ ] On web, `pickAndAnalyze()` runs CLIP classification entirely
      in-browser — confirmed via `run-foxbite-web`, not assumed — with zero
      network call to `/food/analyze` for the photo-scan path.
- [ ] An expired-trial web user is still blocked from scanning, verified
      against a real expired test account, not assumed from the client
      check's presence alone.
- [ ] `foodName` can only ever originate from the nutrition-reference data
      or be empty — same invariant as ticket 010, verified in the ported
      code, not just copied by assumption.
- [ ] Every non-anchor candidate label has a corresponding nutrition row —
      the startup/test invariant from ticket 010 is ported, not dropped.
- [ ] Mobile's existing (server-side) photo-scan behavior is completely
      unchanged — verified, not assumed, since this ticket only branches
      the web build's code path.
- [ ] Cold-start model load time and total download size are measured and
      reported for the real bundled web app (not just the spike's bare CDN
      test), with a visible loading/progress state during the ~15s+ first
      load rather than a bare unlabeled spinner.
- [ ] New frontend tests pass, including a real check that the `.web.ts`
      module is actually exercised (this project's Jest config does not
      resolve `.web.ts` automatically — the plan must test it by explicit
      path import, not rely on Jest's platform resolution).
- [ ] Outcome doc restates ticket 010's non-food-confidently-wrong and
      unlisted-food residual risks unchanged, and states plainly this
      ticket only changes where web's model executes.

## Pipeline

Full ticketed-change + gated-build cycle, consistent with tickets 004-010:
plan → tech-lead review → explicit user go-ahead → Sonnet build → Sonnet QA
→ Opus tech-lead → Opus CTO verdict → outcome/verdict docs → commit only on
explicit request.
