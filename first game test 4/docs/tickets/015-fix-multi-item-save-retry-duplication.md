# Ticket 015: Fix multi-item save retry duplication

## Status

Backlog.

## Background

Ticket 014 added a multi-item photo-scan review step
(`app/src/app/(tabs)/log.tsx`, step `'review-items'`) whose save action,
`confirmSaveItems()`, loops over the confirmed `items` array and calls
`api.createLog` once per item — no batch endpoint, per that ticket's
explicit scope decision.

That ticket's outcome doc already documented a known limitation: if
`createLog` fails partway through the loop, there is no transactional
rollback, so whichever items already saved remain as real `food_logs` rows.

During tech-lead review of ticket 014, a second, distinct, user-facing bug
was found that follows directly from this: when the loop fails partway
through, `confirmSaveItems()`'s catch block sets an error message and
returns the user to the `'review-items'` screen with the **entire, unpruned
`items` array still shown**, including the items that already saved
successfully before the failure occurred. If the user reads the error and
retaps "Save all N" to retry, the loop runs again over every item —
re-saving the ones that already succeeded on the first attempt, in addition
to the ones that genuinely still need saving. The result is duplicate
`food_logs` rows, and duplicate calories/macros counted for that day, for
any item that had already saved before the original failure.

This is not the same as the "no rollback" limitation itself (an orphaned
write with no user action involved) — it is an additional, actively
reachable duplication triggered by the user's own retry, which is worse
because it happens silently: nothing in the UI tells the user which items
already saved vs. which are still pending, so retrying looks like the only
reasonable thing to do after seeing an error.

## Goal

Retrying a save after a partial multi-item save failure should not
re-save items that already saved successfully.

## Scope

- `app/src/app/(tabs)/log.tsx`'s `confirmSaveItems()` and the
  `'review-items'` UI it drives.
- Fix must ensure a retry only attempts to save items that have not yet
  been successfully saved.

Candidate approaches (not prescribing one — whoever picks this up should
choose based on what's cleanest against the current `items`/`ReviewItem`
state shape):

- Prune already-succeeded items out of the `items` array as each
  `createLog` call resolves, so a retry's loop only ever contains items
  that still need saving (and the UI reflects "N of M saved" as it goes).
- Track a per-item saved/pending/failed status in `ReviewItem` state
  (rather than removing items from the array), and skip already-saved
  items on retry while still showing them to the user as "already saved."
- Replace the client-side loop with a real batch-save endpoint on the
  backend that performs the multi-item save atomically (or at least
  reports back per-item success/failure so the client never has ambiguous
  state) — a larger change than the two options above, but removes the
  underlying "no rollback" limitation at the same time.

## Non-goals

- Full transactional atomicity across the batch (i.e., "all items save or
  none do") is not required to close this ticket — only that a retry never
  re-saves an item that already succeeded. A real atomic batch endpoint
  (the third candidate approach above) would also satisfy this, but a
  lighter client-side fix that only prevents duplication is acceptable.
- No changes to the single-item `result`/`confirmSave()` path used by
  voice/barcode — that path saves exactly one item per attempt and does
  not have this loop-based failure mode.

## Acceptance criteria

- Simulate a multi-item save where `createLog` succeeds for the first
  item(s) and then fails partway through: after the failure, retapping
  "Save all N" (or equivalent) does not call `api.createLog` again for any
  item that already succeeded.
- The user is not left with duplicate `food_logs` rows for previously-saved
  items after a retry.
- The UI gives the user some indication of what still needs saving on
  retry (exact presentation left to whoever implements this, but it must
  not silently imply "nothing has been saved yet" when some items have).
- Regression coverage for the retry-after-partial-failure path added to
  `app/src/app/(tabs)/__tests__/log.test.tsx`, at the project's normal
  coverage floor.
