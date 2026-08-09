# Ticket 005: Web tab bar visually covers screen content (Settings gear icon unreachable by a real user)

Status: **In progress** (plan being written)

## Summary

On web, the custom tab bar (`app/src/components/app-tabs.web.tsx`) is
absolutely positioned on top of the screen content instead of occupying
its own space in the layout. Any screen whose first content sits at the
very top of the scroll area — currently, the Companion screen's
`"Your companion"` title and its Settings gear icon — is visually hidden
underneath the opaque tab-bar pill. A real user cannot see or click it.

Confirmed live in a genuinely fresh Incognito browser window (ruling out
any cache explanation): the Companion screen shows the "Expo Starter" nav
bar, then jumps straight to the trial banner and fox card, with no
`"Your companion"` title and no gear icon visible anywhere. Confirmed via
fetching the actual served dev bundle that the code for both IS present
and current (not a stale-bundle issue) — this is a pure visual layering
bug.

## Root cause

`app-tabs.web.tsx` renders:

```tsx
<Tabs>
  <TabSlot style={{ height: '100%' }} />   {/* screen content, first in DOM */}
  <TabList asChild>
    <CustomTabList>...</CustomTabList>      {/* nav bar, second in DOM */}
  </TabList>
</Tabs>
```

`CustomTabList`'s outer wrapper (`tabListContainer`) is
`position: 'absolute', width: '100%'`. Being the later DOM sibling, its
pill-shaped `innerContainer` paints over whatever content is underneath it
in `TabSlot`, rather than that content flowing below it. Every screen's
top content sits exactly where the nav bar overlaps.

## Why the gated-build pipeline for ticket 004 didn't catch this

The pipeline's Playwright verification hit this exact overlay earlier (as
a click-target interception on the "Docs" external link) and worked
around it with a DOM-level `click()` dispatch, which bypasses the
occlusion/visibility check a real click (or a real user's eyes) would be
subject to. The workaround was correctly diagnosed as "not an app bug" at
the time for the *click interception* symptom, but the deeper
implication — that the same overlay also visually hides the target
element from a human — was not separately checked. Ticket 004's plan
explicitly flagged the "Expo Starter"/"Docs" branding as a pre-existing,
out-of-scope cosmetic issue; this ticket corrects that categorization for
the layering behavior specifically (the branding/Docs-link content itself
is still out of scope here).

## Explicitly out of scope

- `app-tabs.web.tsx`'s hardcoded "Expo Starter" branding text and the
  "Docs" external link content — unrelated to the layering bug, no need to
  touch either.
- `app-tabs.tsx` (native `NativeTabs`) — native's tab bar is a platform
  primitive that doesn't have this problem; web-only fix.
- Any change to individual screens' own layout/styles — the fix belongs in
  the shared tab-bar component so it doesn't need repeating per screen.

## Pipeline

Full ticketed-change + gated-build cycle, consistent with tickets 003/004:
plan → tech-lead review → explicit user go-ahead → Sonnet build → Sonnet QA
(including a **real, visual** — not just DOM-click — verification: a
screenshot showing the title/gear icon actually visible above the fold,
not just clickable via a workaround) → Opus tech-lead → Opus CTO verdict →
outcome/verdict docs → commit only on explicit request.
