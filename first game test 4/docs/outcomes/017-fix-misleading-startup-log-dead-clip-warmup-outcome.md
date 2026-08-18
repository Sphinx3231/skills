# Outcome: Fix misleading startup log and dead local-CLIP warm-up

Ticket: [docs/tickets/017-fix-misleading-startup-log-dead-clip-warmup.md](../tickets/017-fix-misleading-startup-log-dead-clip-warmup.md)

No separate plan document was authored — the ticket itself already specifies
scope, non-goals, and acceptance criteria at plan-document detail, and both
options it offered for the two changes ("update or remove the log message";
"remove or gate the warm-up") were resolved directly in `backend/src/index.js`
per the choices below.

## What changed

Both changes are confined to `backend/src/index.js`. Nothing in
`backend/src/lib/local-food-analysis.js` or `backend/src/lib/local-food-recognition.js`
was touched — their own implementations and test files are untouched, per
the ticket's explicit non-goal.

### 1. Startup log message

**Before:**
```
ANTHROPIC_API_KEY not set — auth, dashboard, and companion all work, and
/food/analyze (photo scan) now runs a local CLIP model with no API key
needed, but /food/analyze-text will fail until it's configured.
```
This was false as of ticket 014: `/food/analyze` calls
`analyzeFoodPhotoMultiItem` (Claude vision) unconditionally, with no
fallback to the local CLIP model, so without `ANTHROPIC_API_KEY` set the
route 502s on every call — the opposite of what the log claimed.

**After:**
```
ANTHROPIC_API_KEY not set — auth, dashboard, and companion all work, but
/food/analyze (photo scan, Claude vision) and /food/analyze-text will both
fail until it's configured. There is no local-model fallback.
```
Chose to fix the message in place rather than remove it — the underlying
fact (this env var gates two routes) is still true and worth surfacing at
boot; only the CLIP-fallback claim was wrong.

### 2. Local-CLIP warm-up at boot

Removed the `getClassifier()` pre-warm call (and its `import { getClassifier }
from "./lib/local-food-recognition.js"`) that ran before `app.listen()`.
This call is what triggered the ~35s model-load spike at every boot even
though no route has called `local-food-recognition.js`/`local-food-analysis.js`
since ticket 014 reverted `/food/analyze` to Claude vision. `app.listen()`
now runs immediately, with a comment explaining the history (ticket
010/011 added the warm-up, ticket 014 made it unreachable via any route,
ticket 017 removed the now-pointless boot cost) so a future reader isn't
left wondering why the CLIP files still exist uncalled.

Chose outright removal over gating behind a default-off flag: the only
consumers of `getClassifier()` are `local-food-analysis.js`'s own call
chain and its test suite (which injects a fake `pipelineFactory` and never
touches this boot-time call site at all), so a flag would add a knob with
no route ever reading it — dead configuration surface for a hypothetical.
If a future ticket resurrects `/food/analyze`'s local-CLIP path, re-adding
the pre-warm call is a two-line change at that point.

## Verification of "no route calls the local CLIP path"

Confirmed via `grep` that `local-food-recognition.js`/`local-food-analysis.js`
are referenced only by: each other, their own test files, and (before this
change) `index.js`'s now-removed import — `backend/src/routes/food.js` has
no reference to either file, consistent with the ticket's premise.

## Test results

All numbers are real runs in this environment (`backend/`, PowerShell/Git
Bash on Windows), not estimated.

**`node --test --experimental-test-coverage --experimental-test-module-mocks`:**
- **124/124 tests passing, 5 suites, 0 failed, 0 cancelled, 0 skipped.**
- `local-food-analysis.js`'s own test suite (`test/local-food-analysis.test.js`)
  passed untouched: 15/15 (anchor top-1/top-2/top-3, anchor-outside-window,
  matched/unmatched-nutrition, empty-classifier, and the confidence-margin
  boundary tests), unmodified per the ticket's non-goal.
- `local-food-recognition.js`'s own test suite (`test/local-food-recognition.test.js`)
  also passed untouched: 7/7 (`resolveModelCacheDir`'s three env-precedence
  cases, `getClassifier`/`classifyFoodPhoto`'s injection-seam tests).
- Coverage (all files): **99.24% lines / 97.29% branch / 97.96% funcs** —
  above this project's ~98%-lines convention (the one file below 100% lines,
  `local-food-recognition.js` at 93.90%, is the `defaultPipeline`'s dynamic
  `import("@huggingface/transformers")` branch, lines 38-42 — untouched by
  this ticket and pre-existing, deliberately excluded from test coverage per
  that file's own top-of-function comment explaining why a real transformers
  import must never run inside the test process).
- `src/index.js` itself does not appear in the coverage report at all,
  before or after this change — no test file imports it directly (confirmed
  via grep across `backend/test/`), consistent with how it was already
  untested prior to this ticket. Route-level behavior (`/food`, `/companion`,
  `/billing`, `/user`) is instead exercised by each route's own test file
  constructing its own minimal `express()` app, which is unaffected by
  `index.js`'s startup-sequence changes.

## Regression test for the warm-up removal — judgment call

No new test file was added for `index.js`'s startup sequence. Reasoning:
`index.js` has no existing test coverage of any kind (not even the
`ANTHROPIC_API_KEY`/`CLERK_SECRET_KEY` presence-check warnings that predate
this ticket), and it isn't structured to be testable without either (a)
actually starting a real HTTP listener inside the test process — a pattern
no existing test in this suite uses, since every route test builds its own
throwaway `express()` app instead of importing `src/index.js` — or (b)
retrofitting `index.js` to export its side-effecting setup as an importable,
mockable function, which is a larger refactor than this ticket's scope
("remove the dead warm-up call") calls for. Given the project's own
established pattern of testing route logic in isolation rather than the
composed `index.js` entrypoint, adding a first-ever `index.js` test just for
this one change would be inconsistent with the existing test architecture
rather than reinforcing it. The change itself (deleting a function call and
its import) is small enough that a manual code read plus the full existing
suite staying green was judged sufficient confirmation; this is noted here
explicitly as a deliberate choice rather than an oversight, per the task's
own instruction to use judgment on this point.

## Files changed

- `backend/src/index.js` — removed the `getClassifier` import and its
  boot-time pre-warm call; rewrote the `ANTHROPIC_API_KEY`-missing warning
  to describe the current Claude-vision-only reality for `/food/analyze`
  and `/food/analyze-text`, with no local-model fallback claim; added a
  comment at the former warm-up call site explaining the ticket
  010/011/014/017 history for a future reader.

## Not touched (per ticket scope)

- `backend/src/lib/local-food-analysis.js` and
  `backend/src/lib/local-food-recognition.js` — implementations and their
  test files (`test/local-food-analysis.test.js`,
  `test/local-food-recognition.test.js`) left exactly as they were; both
  still work standalone via direct import + injected `pipelineFactory`
  fakes, just no longer invoked from `index.js`'s boot path.
- `backend/src/routes/food.js` / `backend/src/lib/anthropic.js` — which
  engine `POST /food/analyze` actually calls is unchanged (still Claude
  vision, unconditionally), per the ticket's explicit non-goal.
