# Ticket 004: Settings screens are unreachable — navigator never restructured

Status: **Complete** — plan approved (2 tech-lead review rounds), built,
independently QA-verified (own live click-through), tech-lead approved the
diff, CTO verdict: MERGE. See `docs/outcomes/settings-navigation-outcome.md`
and `docs/outcomes/settings-navigation-verdict.md`.

## Summary

The User Settings & Wardrobe feature (ticket 003) shipped with all 4
settings screens correctly implemented and individually tested, but they
are **structurally unreachable on every platform**, not just web. The
Companion screen's gear icon calls `router.push('/settings')`, but the
root layout (`app/src/app/_layout.tsx`) renders `<AppTabs />`
(`expo-router/unstable-native-tabs`'s `NativeTabs`, declaring only
`index`/`log`/`companion`) directly, with no enclosing `Stack` navigator
that could accept `/settings` as a pushed screen. Confirmed live: signing
in and navigating to `/settings`, `/settings/goals`, `/settings/appearance`,
or `/settings/wardrobe` in a real browser session silently falls back to
the Today dashboard every time.

This escaped ticket 003's entire gated-build pipeline (build, QA,
tech-lead, CTO all reported clean) because every test renders these screen
components in isolation (`render(<GoalsScreen />)`), which proves the
screen itself works but never exercises the real cross-screen navigation
tree the way an actual click does.

## Root cause

Confirmed via investigation (see `docs/plans/settings-navigation-plan.md`
for full detail): this codebase has zero existing precedent for a `<Stack>`
navigator or an Expo Router `(group)` folder. `NativeTabs` is being used
as if it were the entire app's router, when it can only ever resolve the
3 screens explicitly declared as `<NativeTabs.Trigger>` entries.

## Pipeline

Full ticketed-change + gated-build cycle per the user's explicit choice
(this is a bigger, riskier change than the two prior hotfixes — it
restructures the root navigator for the first time): plan → tech-lead
review → explicit user go-ahead → Sonnet build → Sonnet QA → Opus tech-lead
→ Opus CTO verdict → outcome/verdict docs → commit only on explicit
request. Given the last ticket's lesson, this one's verification must
include a **real live navigation click-through** (headless browser through
actual sign-in), not just unit tests, before any pipeline stage is allowed
to claim success.
