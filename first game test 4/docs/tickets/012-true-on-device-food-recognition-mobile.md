# Ticket 012: True on-device food recognition — mobile

Status: **Drafted, spike findings exist, plan not yet written. Do not
build.** Split out of ticket 011 per tech-lead review — see
`docs/tickets/011-true-on-device-food-recognition.md`'s scope-change note.

## Summary

Ticket 011 ships true on-device (no backend AI call) photo scanning for
web. Mobile keeps calling ticket 010's backend endpoint until this ticket
resolves the native path. The core blocker: `@huggingface/transformers`
(the library ticket 010/011 use) does not run in React Native at all.
`react-native-executorch` (Software Mansion) is the most promising
candidate found — see `docs/outcomes/on-device-clip-feasibility-spike-findings.md`'s
"Follow-up: react-native-executorch mobile spike" section for full detail.

## What's already verified (don't re-spike)

- Install + `expo prebuild` succeed cleanly against this project's real
  Expo SDK 54 / RN 0.81.5 setup, no OneDrive/path errors at that stage.
- A pre-converted CLIP ViT-B/32 model exists in ExecuTorch's `.pte` format
  — no Python conversion step needed.
- Maintenance signals are strong (Software Mansion, same maintainer as
  `react-native-reanimated`/`react-native-screens`, both already in this
  project's dependencies).
- Device floor: Android 13+/iOS 17+, New Architecture only — this project
  already has New Architecture enabled, so that specific requirement is
  already satisfied.
- A worktree with the install/prebuild groundwork already exists at
  `.claude/worktrees/foxbite-executorch-spike` (branch
  `foxbite-executorch-spike`) — **has uncommitted changes as of the last
  check; must be committed before any real EAS build is attempted against
  it, or the build will not contain the native module** (a real finding
  from tech-lead review of the original combined plan — don't repeat it).

## What's NOT verified — this ticket's actual work

1. **The real native Android Gradle compile** — never tested (no Android
   SDK in the spike environment). This is exactly the class of step where
   ticket 010's own outcome doc documented real OneDrive-sync native-build
   friction. Try a **free local Gradle build first** if an Android SDK
   becomes available anywhere in the toolchain, before spending a real EAS
   build credit — a local build tests the same native-compile risk for
   free and with unlimited retries; the EAS cloud credit should be spent
   specifically to produce an installable APK for a real on-device smoke
   test, not to test the compile step itself (a cloud builder doesn't even
   touch the OneDrive path, so it wouldn't validate that specific risk
   anyway).
2. **iOS** — no Mac was available for either spike. Decide explicitly
   whether this ticket covers Android only (with iOS as a further, later
   ticket) before spending any build credit, rather than deferring the
   decision to a step that can't gather iOS information anyway.
3. **Score normalization**: `react-native-executorch`'s
   `useImageEmbeddings`/`useTextEmbeddings` return raw embedding vectors —
   there is no `pipeline()`-equivalent. A hand-rolled cosine similarity
   over those vectors is **not on the same numeric scale** as web's
   `pipeline()` output (which is a softmax over all candidate prompts).
   Ticket 011's confidence thresholds (`HIGH_CONFIDENCE_MARGIN = 0.4`,
   `MEDIUM_CONFIDENCE_MARGIN = 0.15`) were tuned against that softmax
   distribution and will NOT transfer to raw cosine similarity — this
   ticket's plan must either reproduce CLIP's actual softmax math
   (L2-normalize both vectors, dot product, multiply by CLIP's
   `logit_scale`, softmax over all candidates) so ticket 011's shared
   scoring module can be reused unmodified, or derive and justify new
   mobile-specific thresholds from real on-device measurements. Verify
   first whether the ExecuTorch `.pte` export exposes `logit_scale` at
   all — if it doesn't, the plan must say so and pick a documented
   fallback, not guess.
4. **Text embedding cost**: the CLIP text tower is only offered fp32
   (~242MB, no quantized variant per the spike) — but the label set is
   fixed and known at build time (39 prompts). Precompute all 39 text
   embeddings offline (during development, not at runtime) and ship them
   as a small checked-in constant (~80KB) instead of downloading/running
   the text tower on-device at all — this drops the real runtime download
   to just the quantized image tower (~92MB), a clear improvement over the
   naive ~334MB combined download the spike measured. Verify the
   precomputed embeddings come from the exact same model pair as the
   shipped image `.pte` before relying on this.
5. **Native binary isolation**: confirm that adding `react-native-executorch`
   to `app/package.json` does NOT also pull in `@huggingface/transformers`'s
   `onnxruntime-node`/`sharp` native dependencies (it shouldn't — different
   library — but verify explicitly, since ticket 011's web work and this
   ticket's mobile work will coexist in the same `app/package.json`).
6. **The paywall**: same fix as ticket 011 (client-side billing pre-check
   before local inference) applies here too — don't rebuild it
   independently, reuse whatever ticket 011 ships for this.

## Scope (provisional — write a real plan once item 1's build gate is resolved)

1. Resolve the real native compile risk (item 1 above) before any product
   code is written — this is a hard go/no-go gate, same discipline as
   ticket 010's Food-101 accuracy spike.
2. If the gate passes: implement `app/src/lib/food-recognition.ts` (mobile,
   non-web) using `react-native-executorch`, precomputed text embeddings
   (item 4), and CLIP's real softmax math (item 3) feeding into ticket
   011's shared scoring module unmodified.
3. If the gate fails: mobile stays on ticket 010's backend call
   permanently — an acceptable, honest outcome, not a failure. Update this
   ticket's status accordingly and close it as "not pursued" with the
   reasoning recorded.
4. Reuse ticket 011's billing pre-check, candidate labels, nutrition data/
   lookup, and shared scoring module unchanged — this ticket is about
   getting comparable `{label, score}[]` output from a different runtime,
   not re-deciding any of the product logic.

## Non-goals

- Re-deciding the CLIP-zero-shot-plus-confirm-screen product approach.
- Solving CLIP's non-food-confidently-wrong failure mode at the model layer.
- iOS, unless item 2 above explicitly includes it after a real decision.
- Backend hosting/deployment, multi-item meal recognition.

## Pipeline

Full ticketed-change + gated-build cycle, consistent with tickets 004-011:
plan → tech-lead review → explicit user go-ahead (including a SEPARATE,
explicit sign-off before spending any real EAS build credit) → Sonnet build
→ Sonnet QA → Opus tech-lead → Opus CTO verdict → outcome/verdict docs →
commit only on explicit request.
