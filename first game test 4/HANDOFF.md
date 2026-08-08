# FoxBite — Handoff

Paste everything below the line into a new chat to pick up where this session left off.

---

## Prompt to continue

I'm continuing work on **FoxBite**, an AI photo-based calorie tracker with a gamified fox
companion named **Foxxy**, built as a cross-platform Expo app (Android + Web) with a
Node/Express backend. The repo root is `first game test 4/`, with the app in `app/` and
the API in `backend/`.

### Stack
- **Frontend**: Expo SDK 54, Expo Router v6, React Native 0.81, TypeScript. Auth via
  `@clerk/expo` (Core 3 "future resource" API + experimental `useSSO`). `react-native-svg`
  for the hand-drawn Foxxy character, `expo-linear-gradient` for gradient cards, custom
  `AmbientGlow` component for soft drifting background color blobs.
- **Backend**: Express 5, ESM (`"type": "module"`), `better-sqlite3`, `@clerk/express` for
  auth, `@anthropic-ai/sdk` for food-photo analysis (model `claude-sonnet-5`), `stripe` for
  billing.
- **Testing**: Backend uses Node's built-in `node --test` + `--experimental-test-coverage`
  (with `--experimental-test-module-mocks` for mocking `@clerk/express`, `stripe`,
  `../src/lib/anthropic.js`). Frontend uses `jest-expo` + `@testing-library/react-native`
  v14 (note: `render`/`fireEvent`/`renderHook` are all **async** in this version — must be
  awaited). Current coverage: backend 98.45% lines / 93.33% branches; frontend 97.27%
  statements / 99.2% lines / 88.25% branches. Run with `npm test` / `npm run test:coverage`
  in either `app/` or `backend/`.

### What's built
- **Auth**: Clerk email/password + Apple/GitHub/Google SSO, custom dark-themed sign-in UI
  matching Clerk's hosted look (`app/src/app/sign-in.tsx`). Backend provisions a user row on
  first authenticated request (`backend/src/middleware/auth.js`).
- **Food logging**: manual entry + AI photo analysis (`backend/src/routes/food.js`,
  `backend/src/lib/anthropic.js`). The "Quick Snare" log screen (`app/src/app/(tabs)/log.tsx`) has
  a tile hub (Snap & Track / From library working; Voice Input / Barcode Hunt are honest
  "Coming soon" placeholders — not implemented) plus a "Quick Stash" row of frequently
  logged meals for one-tap re-logging (`GET /food/frequent`).
- **Billing**: 30-day free trial computed from `users.created_at` (no stored
  `trial_started_at`), gates only the AI-photo-analyze endpoint (manual logging, dashboard,
  companion stay free forever). Stripe Checkout wired but **not configured** — see Pending
  below.
- **Dashboard** ("The Den", `app/src/app/(tabs)/index.tsx`): Foxxy hero widget with a
  mood/one-liner reacting to today's calories, a "Tail Sweep" circular progress ring
  (`app/src/components/tail-ring.tsx`), macro cards (protein/carbs/fat, woodland palette),
  and a "Daily Forage" meal timeline grouped by time-of-day bucket
  (`app/src/lib/dashboard-logic.ts` — pure, unit-tested logic extracted out of the screen
  for testability).
- **Companion/gamification** (`app/src/app/(tabs)/companion.tsx`): streak counter, wardrobe
  unlocks at streak 3/7/14/30 (scarf/hat/backpack/crown), all driven by
  `backend/src/routes/companion.js`.
- **Foxxy character** (`app/src/components/fox-companion.tsx`): a **hand-drawn
  `react-native-svg` component**, NOT an image asset — gradient-shaded fur, big glossy
  eyes with catchlights, fluffy tail/ear tufts, mood-driven expressions (`empty` = sleepy +
  coffee cup, `onTarget` = grin + glowing tail + sparkles, `over` = content/full,
  `neutral` = idle), continuous bob/sway/ear-wiggle/blink animation loops, and wardrobe
  accessory overlays. This was deliberately reverted back to the SVG version after
  exploring (and discarding) an image-based redesign using reference photos the user
  shared — see "Recent decisions" below.

### Recent decisions (important context, don't redo this work)
- The user shared reference character-sheet images and asked me to redesign Foxxy to
  match them, first as an `Animated.Image` of a saved screenshot, then swapping between
  cropped expression tiles from a bigger character sheet. **That was explicitly reverted**
  — the user asked to "rewind changes to before all of the companion changes but not
  before the GUI changes." Foxxy is back to the SVG version; the Dashboard/Companion
  screen GUI polish (AmbientGlow backgrounds, gradient hero/stage cards, accent-colored
  numbers) was kept.
- Leftover, currently-unused asset files from that discarded approach are still sitting in
  `app/assets/images/foxxy/` (cropped expression PNGs) and
  `app/assets/images/foxxy-sheet.png` (the source sheet), plus `app/scripts/crop-foxxy.js`
  (the pngjs cropping helper). They aren't imported by anything so they don't bloat the
  Metro bundle, but they're clutter — ask the user if they want them deleted, or just leave
  them in case the image-based direction comes back.
- Two real bugs were found and fixed in `fox-companion.tsx` during that work, both still
  present in the current (reverted) SVG version: (1) `react-native-svg`'s `rotation` prop
  is coerced with unary `+`, so passing a `"-2deg"` string (the React Native transform
  convention) silently becomes `NaN` → `0` — it needs a plain number of degrees. (2) SVG
  paint order matters — an earlier "chest ruff" decoration was invisible because it was
  drawn before the body/head that then painted over it.
- `jest-expo`'s test environment reports `Platform.OS === 'ios'` and provides a bare
  `window` object with **no** `window.location` — relevant if you touch the Stripe
  checkout redirect code in `log.tsx`, which branches on `Platform.OS === 'web'`.
- Dynamic `import()` (used for lazy-loading `expo-web-browser` in the Stripe checkout flow)
  is NOT transpiled by babel-preset-expo and Jest can't intercept it without
  `--experimental-vm-modules` — that one code path isn't testable as written; the test
  file documents this instead of faking it.

### Next session
- The GIF-moment work below is done. No specific carry-over task queued — check recent
  chat/git log for whatever the user asks for next.

### Recently completed
- **Foxxy GIF moments** (Sphinx3231/skills#1): five short, event-triggered GIF overlays
  (wave/sleepy/celebrate/resting/order) layered around the SVG `FoxCompanion` — see
  `docs/plans/foxxy-gifs-plan.md` and `docs/outcomes/foxxy-gifs-outcome.md`. The SVG fox
  itself is untouched; the GIFs are additive, not a replacement.
- **Sign-in blocked by Clerk's `needs_client_trust` status**: found while verifying the
  GIF work — signing in from an unrecognized browser left `signIn.status` at
  `needs_client_trust` after a correct password, but `submitSignIn()` called `finalize()`
  unconditionally, throwing "Cannot finalize sign-in without a created session." Fixed by
  sending + verifying an email code via `signIn.mfa` first (mirrors the sign-up
  verification UI already in `sign-in.tsx`). A new project skill,
  `.claude/skills/run-foxbite-web/`, documents how to drive the web app headlessly
  (Playwright, React Native Web's click gotchas, reading Clerk's raw API response) for
  next time something needs verifying past sign-in.

- **Settings navigation restructure** (ticket 004,
  `docs/tickets/004-settings-navigation-unreachable.md`): the User Settings
  feature (ticket 003) shipped with the Settings screens themselves correct
  but structurally unreachable — the root layout rendered `<AppTabs />`
  (`NativeTabs`) directly with no enclosing `Stack`, so `router.push('/settings')`
  silently fell back to the Today dashboard on every platform. Fixed by
  moving `index`/`log`/`companion` into a new `app/src/app/(tabs)/` route
  group, adding `(tabs)/_layout.tsx` and `settings/_layout.tsx`, and
  rewriting the root `_layout.tsx` as a `Stack` with `unstable_settings`
  anchors on both the root (`'(tabs)'`) and the nested settings layout
  (`'index'`) so back-navigation survives a hard refresh on any settings
  screen. Full gated-build pipeline (2 plan-review rounds, Sonnet build,
  independent Sonnet QA redo, Opus tech-lead, Opus CTO) — verdict MERGE.
  See `docs/outcomes/settings-navigation-outcome.md` and
  `-verdict.md`.
  **UNRESOLVED as of this commit**: both the builder's and QA's independent
  live headless-browser click-throughs (real signed-in Playwright sessions)
  confirmed the gear icon correctly lands on `/settings`, but the user
  reported still not seeing Settings when testing manually in their own
  browser at `localhost:8098` afterward — even after a full dev-server
  restart with `--clear` to rule out a stale Metro bundle. Root cause not
  yet identified; possible leads for next session: browser-side cache
  (hard reload / clear site data, not just server restart), a difference
  between the automated Playwright session's state and the user's actual
  signed-in account/session, or a client-side error swallowed silently
  (check the browser devtools console, not just server logs, next time this
  is investigated).

### Pending / not done
- `backend/.env` has no real `ANTHROPIC_API_KEY` — AI photo-scan will fail until it's set.
- No Stripe keys configured (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`,
  `STRIPE_WEBHOOK_SECRET`) — checkout gracefully 501s until set.
- Clerk dashboard gotcha, **SSO sign-up path only** (the plain email/password sign-in path
  is now fixed — see above): if any sign-up field (Password, Username, Phone, First/Last
  name) is marked "Required" in Configure → Email, Phone, Username (or
  Restrictions/Personal Information), SSO sign-ups can never reach `status: 'complete'`
  since OAuth providers can't supply those fields, and `finalize()` throws "Cannot finalize
  sign-up without a created session." If this recurs, check for a newly-required field
  first before re-debugging the auth code.
- Voice Input and Barcode Hunt on the Log screen are UI-only placeholders — real
  implementation would need a speech-to-text service and a barcode/UPC lookup API,
  neither of which exist yet.
- EAS project is linked (`app.json`, project id `55beffed-797b-4933-b805-a99014d44e8a`) but
  a full native Android build hasn't been end-to-end tested recently.

### How to run locally
```
# Backend
cd backend && node src/index.js          # http://localhost:4000

# Frontend (web)
cd app && npx expo start --web --port 8097 --clear
```
Both `app/.env` and `backend/.env` already have working Clerk keys (gitignored, not in the
repo — check with the user if you need the values). `ANTHROPIC_API_KEY` and Stripe keys are
still blank.

Pick up wherever the user directs next — check recent chat for the specific ask before
assuming this doc is fully up to date, since it was written at a single point in time.
