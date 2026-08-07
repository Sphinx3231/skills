---
name: foxbite
description: FoxBite project conventions — Foxxy mood states, wardrobe unlocks, woodland design tokens, Quick Snare logging contract, and the Express/SQLite backend patterns. Use for any work in the FoxBite repo (first game test 4/).
---

# FoxBite

FoxBite is an AI calorie tracker skinned as a pet-raising game. Expo Router +
TypeScript client (`app/`), Express 5 + better-sqlite3 server (`backend/`),
Clerk auth, Stripe gating the AI photo-scan behind a 30-day trial.

## Non-negotiables

- This is **React Native, not web.** No DOM, no CSS files, no `className`.
  Styling is `StyleSheet.create` and `react-native-svg` props. (The app also
  runs on web via `react-native-web`, but write RN-idiomatic code, not
  web-idiomatic code that happens to compile.)
- Never ship placeholder functionality. Unbuilt features render as visible
  "coming soon" stubs (see Voice Input, Barcode Hunt on the Log screen) —
  never as fake working UI.
- Coverage floor: backend ~98% lines, frontend ~97% statements / 99% lines /
  88%+ branches (`app/`: `npm run test:coverage`; `backend/`: `node --test
  --experimental-test-coverage`). New code ships with tests.
- Backend tests use Node's **built-in** test runner (`node --test`), not
  Jest — `--experimental-test-module-mocks` mocks `@clerk/express`, `stripe`,
  and `../src/lib/anthropic.js`. Frontend uses `jest-expo` +
  `@testing-library/react-native` v14, where `render`/`fireEvent`/`renderHook`
  are all **async** and must be awaited.
- `react-native-svg` components (like `FoxCompanion`) are typically asserted
  against with `toJSON()` snapshots/truthiness checks and prop-driven
  variation (render once per mood/size, assert the tree exists and differs),
  not by querying individual SVG node types.

## Foxxy — the companion (`app/src/components/fox-companion.tsx`)

Hand-authored `react-native-svg`. Paths and gradients only, never a raster
asset — this was deliberately reverted once already after exploring an
image-based redesign; don't re-litigate that call without the user asking.

Idle behavior, all via React Native's core `Animated` API (not Reanimated):
- **Bob**: `Animated.timing` sequence 0→1→0, 1500ms each leg,
  `Easing.inOut(Easing.sin)`, `useNativeDriver: true`. Interpolated to a
  `translateY` of 0 to -7.
- **Blink**: randomized delay `2200 + Math.random() * 2600` ms between
  blinks; each blink itself is a fast 80ms close + 100ms open.
- **Ear wiggle**: 2600ms each direction, `Easing.inOut(Easing.quad)`,
  rotation interpolated -4° to 4° (plain degree number — `react-native-svg`'s
  `rotation` prop is coerced with unary `+`, so a `"-4deg"` string silently
  becomes `NaN` → 0; this bit a previous session).

Mood is derived from logging state via `app/src/lib/dashboard-logic.ts`'s
`foxxyState(logCount, calories, goal)`, not set directly:

| Mood | Trigger | Visual |
|---|---|---|
| `empty` | `logCount === 0` | sleepy stretch + espresso cup prop |
| `onTarget` | logs exist and `calories <= goal` | big grin, glowing tail, sparkles (message text varies: "keep the trail going" vs. "Sly moves!" once within 15% of goal) |
| `over` | `calories > goal` | content, full-bellied curl |
| `neutral` | not derived from logs — used for wardrobe previews / Companion screen idle pose | plain idle |

Transitions cut, they don't animate between poses — the SVG just re-renders
with the new mood's paths on next data load. A wardrobe-item celebration or
mood-change moment is a *separate* concern (see GIF moments below), not part
of the SVG itself.

## GIF moments (`app/src/components/fox-moment.tsx`, `app/src/lib/fox-moments.ts`)

Five short, one-shot GIF overlays (`app/assets/Gifs/fox_0{1-5}_*.gif`) layered
*around* the SVG on specific events — wave (session open), sleepy (empty-day
first paint), celebrate (hit target / wardrobe unlock), resting (over goal),
order (log saved). They are additive, not a replacement for the SVG — see
`docs/plans/foxxy-gifs-plan.md` and `docs/outcomes/foxxy-gifs-outcome.md` for
the full design rationale, including why client-side "newly unlocked"
diffing is wrong (the backend already computes it — see Wardrobe below) and
why `expo-image`'s durations are measured from real GIF frame delays, not
guessed. `useFoxMomentQueue` keeps at most one moment mounted at a time;
`useReduceMotion` gates all of them off the OS accessibility setting.

## Wardrobe (`backend/src/routes/companion.js`)

Streak-gated, permanent once earned, worn on the Companion screen.

| Days | Item |
|---|---|
| 3 | scarf |
| 7 | hat |
| 14 | backpack |
| 30 | crown |

- **Streak definition**: computed server-side on each food log insert
  (`backend/src/routes/food.js`). If `last_log_date === today`, no change
  (already logged today). Otherwise `nextStreak = last_log_date === yesterday
  ? streak_count + 1 : 1` — missing a day doesn't decay gradually, it resets
  straight to 1 on the next log. No timezone-aware grace period; comparison
  is a plain date string (`datetime('now')`-derived), so this is server
  local time, not the user's.
- **Persistence**: SQLite `companion_state` table (`user_id`, `streak_count`,
  `last_log_date`, `unlocked_items` as a JSON-text array) — not Clerk
  metadata. `GET /companion` computes newly-crossed thresholds, persists the
  updated `unlocked_items` in the same request, and returns both
  `unlockedItems` (full list) and `newlyUnlocked` (just what crossed this
  call) — **use `newlyUnlocked` directly for celebration triggers**; a
  client-side previous-vs-current diff can't fire correctly on a screen's
  first-ever load after an unlock.
- **Layering order**: not yet formalized beyond "later accessories paint
  over earlier body parts" (general SVG paint-order rule — an earlier chest
  ruff decoration was once invisible because it was drawn before the body).
  No documented z-order for multiple simultaneous accessories yet.

## Design tokens (`app/src/constants/theme.ts`)

Woodland, gradient-forward, warm-neutral. `AmbientGlow` drifts soft color
blobs behind screens (`variant="warm"` on Dashboard, `variant="cool"` on
Companion).

```ts
light: { text: '#000000', background: '#ffffff', backgroundElement: '#F0F0F3',
  backgroundSelected: '#E0E1E6', textSecondary: '#60646C', accent: '#E65100',
  accentSoft: '#FFF8F0', protein: '#D81B60', carbs: '#FFA000', fats: '#2E7D32',
  bark: '#3E2723' }
dark: { text: '#ffffff', background: '#000000', backgroundElement: '#212225',
  backgroundSelected: '#2E3135', textSecondary: '#B0B4BA', accent: '#F4511E',
  accentSoft: '#241C18', protein: '#F06292', carbs: '#FFC24B', fats: '#66BB6A',
  bark: '#EFE0DC' }
```

Spacing scale (`Spacing`, in `theme.ts`): `half: 2, one: 4, two: 8, three: 16,
four: 24, five: 32, six: 64`. Card shadows (`CardShadow`/`CardShadowSoft`)
are warm-brown (`#7a3d10`) soft shadows on iOS/web, `elevation` on Android.

Type scale (`ThemedText`'s `type` prop, in `app/src/components/themed-text.tsx`):
`small` 14/20/500, `smallBold` 14/20/700, `default` 16/24/500, `title`
48/52/600, `subtitle` 32/44/600, `link`/`linkPrimary` 14/30, `code` 12,
`Fonts.mono`. (`fontSize/lineHeight/fontWeight`.)

## Screens

- **The Den** (`app/src/app/index.tsx`, route `/`) — dashboard. Foxxy hero
  widget, Tail Sweep ring (`TailRing`, calories-to-goal, clock-hand metaphor
  built from fox tail), macro cards (25/45/30 protein/carbs/fat split of the
  calorie-only goal), Daily Forage meal timeline.
  - **Daily Forage bucket boundaries** (`bucketLogs` in `dashboard-logic.ts`,
    by local hour of `logged_at`): Morning Forage 5–11, Midday Feast 11–16,
    Evening Den 16–22, Quick Snare (catch-all) 22–5.
- **Quick Snare** (`app/src/app/log.tsx`, route `/log`) — logging tile hub:
  Snap & Track (camera → AI), From library, Quick Stash (one-tap frequent
  meals via `GET /food/frequent`). Voice Input and Barcode Hunt are stubs.
- **Companion** (`app/src/app/companion.tsx`, route `/companion`) — streak
  counter, wardrobe grid, trial-status banner.
- **Sign in** (`app/src/app/sign-in.tsx`, route `/sign-in`) — Clerk
  email/password (two-step: identifier, then password) + Apple/GitHub/Google
  SSO. Handles Clerk's `needs_client_trust` status (new/unrecognized
  browser) by sending + verifying an email code via `signIn.mfa` before
  finalizing — don't assume a correct password always reaches `'complete'`.

## AI photo scan (`backend/src/lib/anthropic.js`, `backend/src/routes/food.js`)

Claude vision (`claude-sonnet-5`) estimates calories and macros from a meal
photo.

**Prompt** (verbatim, `FOOD_ANALYSIS_PROMPT`):
> "You are a nutrition estimation assistant. Look at this food photo and
> identify the food(s) present. Respond with ONLY a JSON object (no markdown
> fences, no extra text) in this exact shape: `{"foodName": string,
> "calories": number, "proteinG": number, "carbsG": number, "fatG": number,
> "confidence": "low"|"medium"|"high", "notes": string}`. Estimate a single
> serving as best you can tell from the photo. If multiple items are
> visible, combine them into one entry with a combined foodName (e.g.
> "Grilled chicken with rice and broccoli"). If you cannot identify food in
> the image at all, set foodName to "Unknown" and confidence to "low"."

- **Response schema**: exactly the JSON shape above; parsed with
  `JSON.parse(textBlock.text)` — no schema validation beyond that, so a
  malformed model response throws and surfaces as a 502.
- **Failure handling**: no text content block → throws "No text response
  from model" → route catches, logs, responds `502 { error: "Could not
  analyze photo, try again" }`. Non-image/oversized files are rejected
  earlier (400, jpeg/png/webp only, 8MB limit via `multer`).
- **Trial gate**: server-side only, in `food.js`'s `requireActiveAccess`
  middleware — checks `computeBillingStatus(user)` and 402s if `expired`.
  Applied only to `POST /food/analyze`; manual logging, the dashboard, and
  the companion are free forever regardless of billing status.

## Backend (`backend/src/`)

Express 5, ESM (`"type": "module"`), better-sqlite3.

- **Route conventions**: one `Router` per resource (`food.js`,
  `companion.js`, presumably `billing.js`), each with `.use(requireAuth)` at
  the top so every route on it requires a Clerk session.
- **Error response shape**: `{ error: string }`, sometimes with extra
  context alongside it (e.g. `{ error: "...", billing: {...} }` on a 402).
- **Schema** (`backend/src/db/index.js`): `users` (Clerk user id as PK,
  `daily_calorie_goal`, `subscription_status`, Stripe ids), `food_logs`
  (`user_id` FK cascade-delete, `logged_at`, `food_name`, `calories`,
  `protein_g`/`carbs_g`/`fat_g`, `source`, `ai_raw_response`),
  `companion_state` (`user_id` PK/FK, `streak_count`, `last_log_date`,
  `unlocked_items` JSON text). `getOrCreateUser` inserts both `users` and
  `companion_state` rows on first authenticated request.
- **Clerk session validation**: `backend/src/middleware/auth.js`
  (`requireAuth`), using `@clerk/express`; provisions the user row via
  `getOrCreateUser` on first request.
- Tests set `DB_PATH=":memory:"` so runs never touch real data; WAL mode is
  skipped for in-memory DBs.

## Testing

- **Backend**: Node's built-in `node --test --experimental-test-coverage`,
  with `--experimental-test-module-mocks` to mock `@clerk/express`,
  `stripe`, and `../src/lib/anthropic.js` at the module level.
- **Frontend**: `jest-expo` preset + `@testing-library/react-native` v14.
  `render`/`fireEvent`/`renderHook`/`unmount` are all **async** in this
  version — always `await` them, including inside `act()`. Clerk
  (`@clerk/expo`, `@clerk/expo/experimental`) is mocked per test file via a
  `jest.mock` factory returning plain jest.fn()s for each method used, not a
  shared global mock. `jest-expo`'s environment reports `Platform.OS ===
  'ios'` regardless of the actual `expo start` target, which matters for
  any test asserting on `Platform.OS === 'web'` branches.
