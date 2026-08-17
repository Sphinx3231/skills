# Outcome: Fix multi-item save retry duplication

Ticket: [docs/tickets/015-fix-multi-item-save-retry-duplication.md](../tickets/015-fix-multi-item-save-retry-duplication.md)

No separate plan document was authored for this ticket — it is a small,
self-contained frontend bug fix with the ticket itself already specifying
scope, non-goals, candidate approaches, and acceptance criteria at
plan-document detail.

## What changed

`app/src/app/(tabs)/log.tsx`'s `confirmSaveItems()` (the multi-item
photo-scan save loop added in ticket 014) no longer leaves the full,
unpruned `items` array in place after a partial-failure retry.

**Approach chosen: prune already-succeeded items out of state as the loop
fails** (the first of the ticket's three candidate approaches), not the
per-item-status-tracking approach or a new batch endpoint. Reasoning:

- The ticket's acceptance criteria require (a) a retry never re-calls
  `api.createLog` for an already-succeeded item, and (b) the UI must not
  "silently imply nothing has been saved yet" when some items have. Pruning
  satisfies both without introducing a new per-item status enum on
  `ReviewItem`: removing saved items from the array is itself visible
  feedback (the card disappears, the remaining count drops, "Save all N"
  relabels to "Save all N-1" or "Save to today" for a single remaining
  item), and the error message names how many items already saved.
- It fits the existing `items`/`ReviewItem` state shape exactly as it already
  is — no new fields, no new UI states, minimal diff.
- The ticket's non-goals explicitly say full atomicity is not required and a
  "lighter client-side fix that only prevents duplication is acceptable" —
  a real batch endpoint (the third candidate) is a materially larger change
  than what's needed to close this ticket, and was not pursued.

### Before / after behavior

**Before**: `confirmSaveItems()` looped over `items`, calling `api.createLog`
once per item. On a failure partway through, the `catch` block only set an
error message and returned to `'review-items'` — `items` itself was never
touched, so it still contained every item, including ones whose
`api.createLog` call had already resolved successfully. Retapping "Save all
N" re-ran the loop over the same full array, resubmitting (and thus
duplicating as new `food_logs` rows) every item that had already saved.

**After**: `confirmSaveItems()` tracks a local `savedKeys: string[]` array,
pushing an item's `key` onto it immediately after its `api.createLog` call
resolves. On a caught failure, `setItems` filters out any item whose `key`
is in `savedKeys` before returning to `'review-items'`, so:
- The review screen only shows the items that still need saving.
- The "Save all N" button's count and the loop's iteration set both reflect
  only the remaining, unsaved items — a retry can never resubmit anything
  that already succeeded.
- The error message is suffixed with `(N item(s) already saved and won't be
  re-saved.)` whenever `savedKeys.length > 0`, so the screen never reads as
  "nothing has been saved yet" when some items have. When the failure
  happens on the very first item (`savedKeys.length === 0`), the message is
  unchanged from before (no suffix) — this keeps the existing single-item
  save-failure test's exact-text assertion (`'Could not save this entry.'`)
  passing unmodified.

No backend changes were needed or made — this is a client-only fix, entirely
within `confirmSaveItems()`. The single-item `result`/`confirmSave()` path
used by voice/barcode is untouched, per the ticket's non-goals.

## Red-before / green-after proof

A new regression test was added to
`app/src/app/(tabs)/__tests__/log.test.tsx`: `"ticket 015: retrying after a
partial multi-item save failure does not re-save the item(s) that already
succeeded"`. It mocks `api.createLog` to resolve for item 1 ("Grilled
chicken") and reject for item 2 ("Steamed rice"), taps "Save all 2", asserts
the pruned state and the "already saved" error message, then taps the
resulting "Save to today" (now showing only the pending item) and asserts
`api.createLog` is called exactly once more, for item 2 only — never again
for item 1.

- **Red**: the fix in `log.tsx` was temporarily reverted (`git stash push --
  app/src/app/(tabs)/log.tsx`) and the new test run in isolation
  (`npx jest log.test.tsx -t "ticket 015"`). It failed as expected: the
  screen still showed both "Grilled chicken" and "Steamed rice" (item 1
  never pruned), the button still read "Save all 2", and the error text was
  the plain `"Could not save this entry."` with no "already saved" suffix —
  confirming the test reproduces the actual bug against the pre-fix code.
- **Green**: the fix was restored (`git stash pop`) and the same test rerun
  — passed. The full `log.test.tsx` file was then rerun in full: **65/65
  tests passing**.

## Test results

All numbers are from real runs in this environment, not estimated.

**Frontend** (`npm run test:coverage`, i.e. `jest --coverage`):
- **379/379 tests passing, 0 failed, 44 suites.**
- Coverage (all files): **98.49% statements / 90.68% branches / 98.46%
  functions / 99.52% lines** — above this project's floor (~97%
  statements / 99% lines / 88%+ branches).
- `app/src/app/(tabs)/log.tsx` specifically: **98.33% statements / 84.3%
  branch / 98.21% functions / 99.09% lines.** The two remaining uncovered
  lines (850, 853 in the coverage report's post-edit line numbering) are
  `TrialEndedPaywall`'s native `await import('expo-web-browser')` branch —
  pre-existing, already documented in this codebase as untestable under
  Jest without `--experimental-vm-modules`, unrelated to this ticket.

No backend test run was needed — no backend files were changed by this
ticket, so `node --test` was not rerun.

## In scope vs. not

- The ticket's scope section names only `confirmSaveItems()` and the
  `'review-items'` UI it drives, plus a regression test in
  `log.test.tsx`. Both were done.
- The ticket text does not mention a "multi-item raw-capture survives
  edits" test gap anywhere in its background, goal, scope, non-goals, or
  acceptance criteria — that phrase does not appear in the ticket. No such
  test was added here, to avoid inventing work beyond what the ticket
  actually lists. (Ticket 014's raw-capture behavior for multi-item scans —
  `ReviewItem.raw` staying untouched by `updateItem` edits — already has its
  own coverage from ticket 014's original test suite, e.g. the "editing one
  item's field must not affect the other item's value" test; nothing about
  this ticket's fix touches that behavior.)

## Deferred / known limitations (unchanged from ticket 014, explicitly a non-goal here)

- **No transactional atomicity across the batch.** A failure partway through
  still leaves the successfully-saved items as real `food_logs` rows with no
  server-side rollback — this ticket's non-goals explicitly exclude solving
  that; it only had to stop the *retry* from re-saving those same rows a
  second time, which it does.
- **No batch-save endpoint.** The third candidate approach (a real atomic
  batch endpoint reporting per-item success/failure) would also satisfy this
  ticket and would additionally close the "no rollback" limitation, but is a
  larger backend change not required to meet this ticket's acceptance
  criteria — left as a possible future ticket if the orphaned-write
  limitation itself needs solving later.

## Files changed

- `app/src/app/(tabs)/log.tsx` — `confirmSaveItems()`: added local
  `savedKeys` tracking during the save loop; on a caught failure, prunes
  already-succeeded items out of `items` state before returning to
  `'review-items'`, and appends an "already saved" count to the error
  message when applicable.
- `app/src/app/(tabs)/__tests__/log.test.tsx` — new regression test:
  "ticket 015: retrying after a partial multi-item save failure does not
  re-save the item(s) that already succeeded."

## Not touched (per ticket scope)

- No backend files — this ticket's scope and fix are entirely
  frontend/client-side.
- `confirmSave()` / the single-item `'review'` step (voice/barcode) —
  untouched, per the ticket's non-goals.
