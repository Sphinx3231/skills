# Plan: fix residual voice/barcode findings before merge

Branch: `foxbite-voice-barcode` (same branch, same ticket — continuation of
[Sphinx3231/skills#2](https://github.com/Sphinx3231/skills/issues/2), not a
new ticket, since nothing from that ticket has merged yet). Gated-build +
ticketed-change combined, per the user's standing instruction.

## Context

The voice-barcode feature passed QA, two tech-lead review rounds, and a CTO
verdict of **MERGE** (`docs/outcomes/voice-barcode-verdict.md`). All findings
below were explicitly logged as **non-blocking** by those reviewers — the
user has now asked to fix all of them anyway before merging, plus confirm
coverage holds at/above 90% on every metric after the fixes (it already is:
backend 98.81%/95.73%/100%, frontend 98.10/90.13/97.98/99.44 — this plan's
job is to not regress below 90% on any axis while fixing 8 items, not to
newly reach it).

## Findings to fix (compiled from QA, tech-lead, and CTO review docs)

1. **No boundary tests for 8-digit/14-digit barcodes** (QA). The regex
   `/^\d{8,14}$/` in `backend/src/routes/food.js` is correct by inspection
   but only a non-numeric malformed case is tested. Add tests for exactly
   7 digits (reject), exactly 8 digits (accept), exactly 14 digits (accept),
   exactly 15 digits (reject).
2. **No guard against rapid double-tap on Voice Input / Barcode Hunt tiles
   before permission resolves** (QA). `startBarcodeHunt`/`startVoiceInput`
   in `app/src/app/log.tsx` have no in-flight lock while their permission
   promise is pending. Add an in-flight ref guard (mirror the existing
   `barcodeScannedRef`/`voiceSubmittedRef` pattern) so a second tap while a
   permission request is outstanding is a no-op.
3. **No `end`-event handler on voice recognition** (tech-lead). Silence with
   no final result leaves the UI stuck in `listening` state with no error
   shown, recoverable only via manual Cancel. Add a handler for
   `useSpeechRecognitionEvent('end', ...)` that, if no final transcript was
   submitted, surfaces a clear "Didn't catch that, try again" state instead
   of a silent hang.
4. **`stop()` never called after a successful final result** (CTO). On
   native Android the mic may stay open after the UI has moved on to the
   review step. Call `ExpoSpeechRecognitionModule.stop()` immediately after
   a final transcript is accepted, not just on Cancel/error.
5. **No length cap on `/food/analyze-text`'s description** (tech-lead) and
   **no prompt-injection hardening** (CTO, same endpoint, self-inflicted
   blast radius only — it's the user's own AI cost, not a security hole
   against other users). Two concrete sub-fixes:
   - Cap `description` server-side at 500 chars (after `trim()`) — far more
     than a spoken food description needs — with a 400 on excess, checked
     before any call to `analyzeFoodText`.
   - In `analyzeFoodText`'s prompt, stop interpolating the raw string into
     the trailing instruction line as `Description: ${description}` does
     today. Instead wrap the user-supplied text in explicit delimiters
     (e.g. `<description>…</description>`) and state directly that
     everything inside the tags is data to estimate nutrition from, never
     instructions to follow, regardless of what it contains. The photo flow
     never needed this framing (the image is a separate content block, not
     interpolated text), so there is no existing pattern to mirror — this
     is new framing, written from scratch for this text path.
   - Acceptance criterion for this item must assert on the actual payload
     handed to the mocked Anthropic client (the prompt string it received),
     not just "documented in the outcome doc" — a test that inspects the
     mock call args for the delimiter and the framing instruction.
6. **No timeout on the Open Food Facts fetch** (CTO). A hung upstream holds
   the request open indefinitely. Add an `AbortController` timeout (e.g. 8s)
   around the `fetch` call in `GET /food/barcode/:code`, mapping an abort to
   the existing 502 "Could not reach the barcode lookup service" response.
7. **Mixed-basis macro zeroing shows a confident "0g protein" when data is
   actually just missing** (CTO). **Tech-lead correction to the original
   fix idea**: do NOT gate the existing 404 on all four keys — `extractNutrition`
   already correctly gates the 404 on energy alone (`energy-kcal_100g`/
   `_serving`), and calories are this app's primary metric (drives
   `daily_calorie_goal` and the whole dashboard), so a product with real
   kcal but one missing macro must not become a false "no nutrition data"
   404. Instead: when a basis is picked and calories are present but one or
   more of protein/carbs/fat is absent (not just falsy/zero — genuinely
   absent from the nutriments object), name the missing macro(s) in the
   existing `caveat` field, e.g. "Protein and fat aren't on file for this
   product — shown as 0, edit before saving." This reuses the already-approved
   `caveat` mechanism (no new UI) and is honest instead of either a silent
   confident zero or a false 404 — the review card is editable precisely for
   this case. Only the true "energy key itself is absent" case still 404s.

## Explicitly out of scope

- Real on-device Android voice/camera hardware verification — still not
  possible from this environment, unchanged from the original plan and
  outcome doc's disclosed limitation.
- Any change to the Foxxy companion, design-refresh, or unrelated screens.
- Re-opening the `caveat` field design or any already-approved architecture
  decision from the original plan.

## Acceptance criteria

- [ ] Barcode length boundary tests (7/8/14/15 digits) added and passing.
- [ ] Double-tap on Voice Input or Barcode Hunt before permission resolves
      triggers exactly one permission request / one flow start, proven by a
      test that fires the tap twice and asserts a single call — mutation-test
      it (temporarily remove the guard, confirm the test goes red).
- [ ] Voice recognition's `end` event with no final result surfaces a clear,
      dismissable "didn't catch that" state instead of hanging in `listening`
      forever — proven by a test.
- [ ] `ExpoSpeechRecognitionModule.stop()` is called on successful final
      transcript, proven by a test asserting the mock was called.
- [ ] `/food/analyze-text` rejects descriptions over the 500-char cap with
      400 before calling Claude, proven by a test asserting no Claude call
      was made for an oversized input.
- [ ] The text-analysis prompt wraps user input in explicit delimiters with
      an instruction that it is data, never instructions to follow, proven
      by a test that inspects the mocked Anthropic client's actual call
      args for the delimiter and framing text — not just documented prose.
- [ ] `GET /food/barcode/:code` times out and 502s on a hung upstream,
      proven by a test using a fetch mock that never resolves within the
      timeout window.
- [ ] A barcode with real energy/calorie data but a missing individual
      macro (protein/carbs/fat absent, not just zero) returns 200 with the
      missing macro(s) named in `caveat` — not zeroed silently, and not a
      false 404 — proven by a test. A barcode missing the energy key itself
      still 404s as "no nutrition data on file," proven by a separate test.
- [ ] Full `npx jest --coverage` in `app/` and the backend's `npm run
      test:coverage` stay at or above 90% on every reported metric (stmts/
      branch/funcs/lines), and do not regress below their current baselines
      (backend 98.81%/95.73%/100%; frontend 98.10/90.13/97.98/99.44).
- [ ] `npx tsc --noEmit` shows no new errors beyond the same 3 pre-existing
      ones.

## Review

Same gated-build pipeline as the original ticket: Sonnet build → Sonnet QA →
Opus tech-lead → Opus CTO verdict (Fable unavailable on this plan, same
independence caveat as before — noted again in the new verdict). Build only
after plan approval; the user has already given explicit go-ahead to fix all
of these, so implementation may start once the reviewer approves this plan.
