# Ticket 017: Fix misleading startup log and dead local-CLIP warm-up

## Status

Backlog.

## Background

Found during live verification of tickets 014/015 (multi-item Claude vision
food recognition). `backend/src/index.js` logs a startup message claiming
`POST /food/analyze` "now runs a local CLIP model with no API key needed" —
this was true as of ticket 010/011, but ticket 014 reverted the route to
call `analyzeFoodPhotoMultiItem` (Claude vision) unconditionally, with no
fallback to the local model. The startup message was never updated to
reflect that, so it's now actively false: without `ANTHROPIC_API_KEY` set,
the route will 502 on every call, contradicting what the log claims.

Separately, `backend/src/lib/local-food-analysis.js` (ticket 010/011's local
CLIP pipeline) still runs its model warm-up at boot (per its own code
comment, taking on the order of ~35 seconds) even though no route calls it
anymore since ticket 014 — pure wasted boot time with no functional benefit,
and dead code from the request-serving path's perspective (its own tests
still exercise it directly, so it isn't fully dead, just unreachable via any
HTTP route).

## Goal

Startup logging accurately reflects which engine `POST /food/analyze`
actually calls, and boot time isn't spent warming up a model no route uses.

## Scope

- Update the startup log message in `backend/src/index.js` to describe the
  current reality (Claude vision, requires `ANTHROPIC_API_KEY`, no
  fallback) — or remove the message if it's more trouble to keep accurate
  than it's worth; either is acceptable, plan phase's call.
- Remove (or explicitly gate behind a flag that's off by default) the
  local-CLIP warm-up call at boot, since no route currently exercises it.
  Do NOT delete `local-food-analysis.js` itself or its own tests — same
  "leave the superseded engine in place, uncalled" precedent already
  established by tickets 010 and 014 for their respective replaced
  functions.

## Non-goals

- No change to which engine `POST /food/analyze` actually calls — that's
  ticket 014's decision, not in scope here.
- No change to `local-food-analysis.js`'s own implementation or tests.

## Acceptance criteria

- Backend startup output no longer claims a local/no-API-key path is active
  for `/food/analyze` when it isn't.
- Boot time no longer includes the local-CLIP warm-up unless some future
  route actually calls it again.
- `local-food-analysis.js`'s own existing test suite still passes untouched.
