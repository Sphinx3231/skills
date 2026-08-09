# Outcome: settings navigation fix (ticket 004)

Status: **complete — implementation, jest, tsc, and the live click-through all verified**

## What changed

Per `docs/plans/settings-navigation-plan.md`:

1. **New route group `app/src/app/(tabs)/`** — pure file moves (no content
   edits) of:
   - `app/src/app/index.tsx` → `app/src/app/(tabs)/index.tsx`
   - `app/src/app/log.tsx` → `app/src/app/(tabs)/log.tsx`
   - `app/src/app/companion.tsx` → `app/src/app/(tabs)/companion.tsx`
   - `app/src/app/__tests__/{index,log,companion}.test.tsx` →
     `app/src/app/(tabs)/__tests__/{index,log,companion}.test.tsx`
   - Their relative imports (`'../index'`, `'../log'`, `'../companion'`)
     were left untouched and still resolve correctly since each test moved
     alongside its screen.

2. **`app/src/app/(tabs)/_layout.tsx`** (new) — renders the existing
   `AppTabs` component unchanged:
   ```tsx
   import AppTabs from '@/components/app-tabs';
   export default function TabsLayout() {
     return <AppTabs />;
   }
   ```
   No changes were made to `app/src/components/app-tabs.tsx` or
   `app-tabs.web.tsx` — route groups are URL-transparent, so
   `NativeTabs.Trigger name="index"` (etc.) still resolves the same URLs
   as before the move.

3. **`app/src/app/settings/_layout.tsx`** (new) — gives `settings/` its own
   nested stack instead of letting Expo Router flatten it into 4 disconnected
   top-level routes:
   ```tsx
   import { Stack } from 'expo-router';
   export const unstable_settings = { anchor: 'index' };
   export default function SettingsLayout() {
     return <Stack screenOptions={{ headerShown: false }} />;
   }
   ```

4. **`app/src/app/_layout.tsx`** — `Root()` now renders a `Stack` with two
   screens when signed in, instead of rendering `<AppTabs />` directly:
   ```tsx
   export const unstable_settings = { anchor: '(tabs)' };

   function Root() {
     const { isLoaded, isSignedIn, getToken } = useAuth();
     registerApiTokenGetter(getToken);
     if (!isLoaded) return null;
     if (!isSignedIn) return <SignInScreen />;
     return (
       <Stack screenOptions={{ headerShown: false }}>
         <Stack.Screen name="(tabs)" />
         <Stack.Screen name="settings" />
       </Stack>
     );
   }
   ```
   The direct `AppTabs` import was removed from `_layout.tsx` (it's now only
   imported by the new `(tabs)/_layout.tsx`). `sign-in.tsx` rendering is
   unchanged — it's still the same conditional branch above the `Stack`.

5. **`app/package.json`** jest config — replaced the single-file exclusion
   `"!src/app/_layout.tsx"` with `"!src/app/**/_layout.tsx"` in
   `collectCoverageFrom`, so it also excludes the two new layout files
   (`(tabs)/_layout.tsx`, `settings/_layout.tsx`). Confirmed this was
   necessary: micromatch parses a literal `(tabs)` path segment as a regex
   group, so a literal `!src/app/(tabs)/_layout.tsx` entry would silently
   fail to match.

### Untouched, as required

- `app/src/components/app-tabs.tsx` / `app-tabs.web.tsx` — zero changes.
- `app/src/app/settings/{index,goals,appearance,wardrobe}.tsx` and their
  tests — zero changes, same location.
- `app/src/app/sign-in.tsx` — zero changes.

## Test results

### Jest (`app/`)

Before and after this change, full-suite coverage is identical:

| Metric | Before (baseline) | After |
|---|---|---|
| Statements | 98.56% | 98.56% |
| Branches | 91.79% | 91.79% |
| Functions | 98.11% | 98.11% |
| Lines | 99.57% | 99.57% |

`npx jest --coverage` (clean run): **34 test suites passed, 303 tests
passed, 0 failed.** (One run mid-session showed a single flaky timeout in
`src/app/__tests__/sign-in.test.tsx` — an unrelated, untouched file — which
passed cleanly both standalone and on a full clean re-run; not a
regression from this change.)

None of the three `_layout.tsx` files (root, `(tabs)`, `settings`) appear
anywhere in the coverage report, confirming the `!src/app/**/_layout.tsx`
glob is excluding all of them correctly.

### Backend (`backend/`) — sanity check only, untouched by this ticket

`npm run test:coverage`: all files green, 99.25%/96.63%/100% line/branch/
function coverage — unchanged from before this ticket, as expected since no
backend files were touched.

### TypeScript

`npx tsc --noEmit` immediately after the file moves showed 2 **new**
route-typing errors (expected/documented in the plan) because Expo
Router's generated `.expo/types/router.d.ts` was stale — it still only knew
about the pre-move route shape, so literal `"/"` (used in
`(tabs)/log.tsx` and `app-tabs.web.tsx`) was rejected.

Per the plan, the dev server was started once post-move
(`npx expo start --web --port 8099`, ~20s) to force route-type
regeneration. The regenerated `.expo/types/router.d.ts` now includes
`"/"` as `${'/(tabs)'}` | `/` (a route-group-transparent alias), matching
the fix's intent. After that, `npx tsc --noEmit` shows **exactly the same 3
pre-existing errors** documented as known issues, and no new ones:

- `src/components/animated-icon.tsx(150,5)`: `TS2698` spread-types error
- `src/components/app-tabs.web.tsx(72,15)`: `TS2322` SFSymbols7_0 type
  mismatch
- `src/components/ui/collapsible.tsx(22,13)`: `TS2322` SFSymbols7_0 type
  mismatch

None of these three relate to this ticket's changes.

## Live click-through verification

**Status: complete and successful.**

Backend (`node backend/src/index.js`, port 4000) and Expo web
(`npx expo start --web --port 8098`) were run fresh. A Playwright script
(adapted from an existing working script in the scratchpad,
`check-settings3.mjs`; final version at
`.../scratchpad/foxbite-nav-check.mjs`) drove a full headless-browser
session against `http://localhost:8098`. Screenshot paths below are all
under the scratchpad directory
(`C:\Users\ELSAMA~1\AppData\Local\Temp\claude\C--Users-El-Samaka\16e27f89-34bf-4855-856f-d0a45b8b143f\scratchpad\`).

**Sign-in.** Filled the Clerk identifier (`moyfarouk@gmail.com`) and
password, reached the "Check your email" step (`n02-after-password.png`),
entered a fresh verification code, and completed sign-in
(`n03-after-verify.png`). Several earlier attempts within this session were
burned by Clerk OTP codes expiring before they could be relayed and typed
in (real elapsed time between "code sent" and "code entered" exceeded the
OTP's TTL) — this is a test-logistics issue, not a product defect, and is
called out here only because it consumed several of the "fresh code"
round trips during this verification.

**Driver-script issue found and fixed (not an app bug).** The first
successful sign-in revealed that `app-tabs.web.tsx`'s known, explicitly
out-of-scope "Expo Starter" boilerplate nav bar (with its "Docs" link)
visually sits on top of the Companion screen's own header row on web,
which includes the real gear-icon settings button. This caused
Playwright's actionability-gated `.click()` (and even a raw coordinate
click) to land on the "Docs" link instead of the gear button
(`URL after gear click: https://docs.expo.dev/` in one run). This is
exactly the pre-existing, disclosed-out-of-scope cosmetic issue the plan
already calls out ("Explicitly out of scope" section) — not something
introduced or required to be fixed by this ticket. Fix: the driver script's
`clickTestId` helper was changed to dispatch a real DOM `click` event
directly on the target element (`el.evaluate((node) => node.click())`)
instead of relying on pointer-position hit-testing. This was verified
correct by reading `react-native-web`'s `PressResponder` source
(`node_modules/react-native-web/dist/modules/usePressEvents/PressResponder.js`),
which documents in its own comments that `onPress` is wired to the native
DOM `click` event specifically (not the pointer/responder system), so a
dispatched `click` event reliably triggers the same `onPress` handler a
real user click would. This is a test-driver workaround only — no app code
was touched to work around it.

**Forward navigation (gear icon → Settings → sub-screens).**
- Tapped the real gear icon (`testID="settings-gear-button"`) on the
  Companion screen: `URL after gear click: http://localhost:8098/settings`
  — lands on the real Settings list, not the Today dashboard fallback that
  was the entire bug this ticket fixes. Screenshot: `n05-settings-index.png`.
- Tapped into Goals from the Settings list's own link
  (`testID="settings-row-/settings/goals"`, not a direct `page.goto`):
  `URL after goals tap: http://localhost:8098/settings/goals`. Screenshot:
  `n06-goals.png`.
- Tapped the in-content back button: returned to
  `http://localhost:8098/settings`. Screenshot: `n07-back-to-settings.png`.
- Tapped into Appearance from its own link:
  `http://localhost:8098/settings/appearance`. Screenshot:
  `n08-appearance.png`.
- Tapped into Wardrobe from its own link:
  `http://localhost:8098/settings/wardrobe`. Screenshot: `n09-wardrobe.png`.

**Hard-refresh-then-back checks (the actual point of the anchor settings).**
- Hard refresh (fresh `page.goto`, not client-side nav) directly on
  `/settings`: page renders correctly (`n10-refresh-settings.png`). Tapped
  the in-content back button: landed on
  `http://localhost:8098/` — the Today dashboard, i.e. the tabs group under
  the root `Stack`'s `unstable_settings = { anchor: '(tabs)' }` correctly
  populated the back stack even though the refresh cleared in-memory
  navigation history. Screenshot: `n11-back-after-refresh-settings.png`.
- Hard refresh directly on `/settings/goals`: page renders correctly
  (`n12-refresh-goals.png`). Tapped the in-content back button: landed on
  `http://localhost:8098/settings` — the Settings list, i.e.
  `settings/_layout.tsx`'s own `unstable_settings = { anchor: 'index' }`
  correctly populated the *nested* stack's back history too. Screenshot:
  `n13-back-after-refresh-goals.png`.

Both anchor mechanisms the plan called out as required-not-decorative are
now confirmed working via an actual hard refresh (the only way to force
them to matter), not just forward navigation.

## Web/native tab-navigator asymmetry (explicit callout per the plan)

`app/src/components/app-tabs.tsx` (native) uses
`expo-router/unstable-native-tabs`'s `NativeTabs`. `app-tabs.web.tsx` uses a
completely different implementation built on `expo-router/ui`'s
`Tabs`/`TabSlot`. **Only the web path can be exercised by this
environment's headless-browser verification** — there is no iOS/Android
simulator available. The `(tabs)/_layout.tsx` added by this ticket renders
whichever `AppTabs` module the platform resolves to, unchanged, so the
strongest available assurance for native tab-bar-plus-`Stack` interaction
is that neither native `AppTabs` file was touched by this ticket — it is
asserted by code-reading, not by direct observation, exactly as flagged in
the plan as an accepted, disclosed limitation of this environment.

## Outstanding

- ~~QA's independent re-run of the same click-through~~ — **done.** QA
  independently redid the full click-through with its own headless-browser
  session and its own OTP code (not reusing the builder's session),
  confirmed consistent results at every step, including both hard-refresh
  cases proving the root and nested anchors. Verdict: PASS, no bugs found.

## Known caveat: `tsc` on a clean checkout

`.expo/types/router.d.ts` is gitignored (`app/.gitignore`). On a clean
checkout, `npx tsc --noEmit` will show 2 spurious route-typing errors on
`router.navigate('/')` calls in `(tabs)/log.tsx` (this ticket is the first
change to expose this, but the mechanism itself predates it — any route
file this codebase adds will trip the same gap) until `expo start` has run
at least once to regenerate that file. This is a pre-existing tooling
characteristic, not a defect introduced here — flagged per a tech-lead
review so it isn't mistaken for a regression on a future clean clone.
