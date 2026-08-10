# Ticket 006: Settings gear icon only reachable from Companion tab

Status: **In progress** (plan being written)

## Summary

The Settings gear icon (fixed by ticket 004's navigation restructure and
ticket 005's tab-bar layering fix) only exists on the Companion screen's
header row. The Today and Log tabs have no way to reach Settings at all
without first switching to Companion.

The user asked for Settings to be reachable from every tab, not just
Companion.

## Current state (confirmed by reading the actual screens)

- **Companion** (`app/src/app/(tabs)/companion.tsx`): has a header row —
  `"Your companion"` title + gear icon (`onPress={() => router.push('/settings')}`,
  `testID="settings-gear-button"`).
- **Today** (`app/src/app/(tabs)/index.tsx`): has a header row — eyebrow
  "THE DEN" + `"Today"` title on the left, a `"Sign out"` link on the
  right. No gear icon.
- **Log** (`app/src/app/(tabs)/log.tsx`): has no header row at all — just
  a stacked eyebrow ("QUICK SNARE") + `"Log a meal"` title, no icon of any
  kind next to it.

User's explicit choice on how to handle Today's existing "Sign out" link
(asked via AskUserQuestion): **add the gear icon alongside "Sign out"**,
not replace it — no change to the existing sign-out behavior or its
placement.

## Pipeline

Full ticketed-change + gated-build cycle, consistent with tickets
003–005: plan → tech-lead review → explicit user go-ahead → Sonnet build
→ Sonnet QA (including live visual verification, per the lesson from
ticket 005 that a DOM-level click succeeding is not the same as a human
being able to see and click something) → Opus tech-lead → Opus CTO
verdict → outcome/verdict docs → commit only on explicit request.
