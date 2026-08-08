# Ticket 003: User Settings & Wardrobe Customization

Status: **In progress** (plan being written)

## Summary

A dedicated per-user settings system: daily nutrition targets (calories,
protein/carbs/fats, unit preference), app theme (woodland_dusk / dark /
system) and accessibility (reduce-motion override), and wardrobe equip
state (which unlocked scarf/hat/crown/backpack are currently worn, not
just unlocked). Settings are scoped strictly to `user_id`, cached locally
for instant startup, and synced asynchronously to the backend.

## Architecture decisions confirmed with the user before planning

1. **Local storage**: `expo-sqlite` (a real local SQLite DB inside Expo) —
   the spec's literal ask for "local SQLite" is real, but `better-sqlite3`
   (Node-only native addon) cannot run in React Native. `expo-sqlite` is
   the correct client-side equivalent and is not yet installed.
2. **Wardrobe slots**: keep the 4 existing independent slots (scarf, hat,
   crown, backpack) rather than merging hat+crown into one slot as the
   spec's literal wording implied — matches the app's actual unlock data
   (`STREAK_UNLOCKS` has all 4 as separate items). This ticket adds an
   equip/unequip toggle per slot; today, unlocked always means worn.
3. **Theme naming**: `woodland_dusk` is a rename of the existing static
   light palette, not a new palette to design. The picker becomes
   woodland_dusk / dark / system (system = today's OS-driven behavior).

## Scope

Full detail lives in `docs/plans/user-settings-plan.md` once written.
Covers: backend `user_settings` table + `GET`/`PATCH /api/v1/user/settings`,
client `expo-sqlite` local cache + optimistic updates with 500ms debounced
sync, Goals & Targets screen, Appearance & Theme screen (wired through a
new theme-override context touching all 4 places that currently read
`useColorScheme()` directly), reduce-motion override layered into the
existing `useReduceMotion()` hook, and a Wardrobe screen equip grid wired
into `Foxxy`/`FoxWardrobeOverlay`.

## Pipeline

Ticketed-change + gated-build, same as tickets 001/002: plan → tech-lead
review → explicit user go-ahead → Sonnet build → Sonnet QA → Opus tech-lead
→ Opus CTO verdict (no Fable on this plan) → outcome/verdict docs → commit
only on explicit request.
