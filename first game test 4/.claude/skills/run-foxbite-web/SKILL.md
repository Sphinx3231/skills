---
name: run-foxbite-web
description: Launch FoxBite's backend + Expo web frontend and actually drive them with a headless browser to verify a change — not just start the servers and declare success. Use whenever asked to check, verify, or debug something in the running app (especially anything behind sign-in, like the Dashboard/Companion/Log screens), or when told "you must review and check, not guess."
---

# Running and driving FoxBite (web)

**Starting the servers proves they boot. It does not prove a UI change
works.** Foxxy, the Dashboard, the Companion screen — all of it is behind
Clerk sign-in. Opening `localhost:8097` in a real browser and eyeballing it
is not something this agent can do; the only way to actually verify
anything past the sign-in screen is to drive a headless browser through it.

## 1. Launch

```bash
cd "first game test 4/backend" && node src/index.js &          # :4000
cd "first game test 4/app" && npx expo start --web --port 8097 --clear &   # :8097
```

Both need their `.env` populated (`backend/.env`: Clerk secret key;
`app/.env`: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` + `EXPO_PUBLIC_API_URL`).
`ANTHROPIC_API_KEY`/Stripe keys can stay blank — only AI photo-scan and
checkout need them. Poll instead of sleeping:

```bash
timeout 30 bash -c 'until curl -sf http://localhost:4000 >/dev/null; do sleep 1; done'
timeout 60 bash -c 'until curl -sf http://localhost:8097 >/dev/null; do sleep 1; done'
```

## 2. Drive it with Playwright

`chromium-cli` is not installed in this environment and the `app/`
project has no Playwright dependency of its own — don't add one just for
verification. Install it transiently in the scratchpad instead:

```bash
cd /path/to/scratchpad
npm install playwright@1.48.0 --no-save
npx playwright install chromium   # one-time per machine, ~140MB
```

Write a throwaway `.mjs` driver script there (not in the repo) importing
`{ chromium } from 'playwright'`.

## 3. The React Native Web click gotcha (this will bite you)

RNW renders `Pressable`/buttons as plain `<div>` elements — no
`role="button"`, no native `<button>` tag. This means:

- `page.click('button:has-text("Continue")')` **times out** — there is no
  `<button>`.
- `page.getByText('Continue').first().click()` **silently does nothing** —
  the text often matches more than one node (e.g. an ancestor wrapper
  whose full `textContent` also equals "Continue"), and Playwright's
  `.first()` may pick a non-interactive one.

**What actually works:** find the exact leaf text node's bounding-rect
center yourself and click those coordinates:

```js
async function clickText(page, text) {
  const rect = await page.evaluate((t) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent?.trim() === t && node.children.length === 0) {
        const r = node.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  }, text);
  if (!rect) throw new Error(`text not found: ${text}`);
  await page.mouse.click(rect.x, rect.y);
}
```

`node.children.length === 0` is the key filter — it's what picks the
actual innermost text node instead of a wrapping container.

## 4. Signing in (Clerk, two-step)

1. `page.fill('input[placeholder="Enter email or username"]', email)`
2. `clickText(page, 'Continue')`
3. `page.waitForSelector('input[type="password"]')`
4. `page.fill('input[type="password"]', password)`
5. `clickText(page, 'Continue')` — re-locate the button each step; its
   position shifts between the identifier and password screens.

Ask the user for test credentials rather than guessing at any — there's
no seeded test account in this repo.

## 5. When something fails, get Clerk's real reason — don't trust the surface error

The thrown error (e.g. "Cannot finalize sign-in without a created
session") is often generic. Capture the actual API response instead:

```js
page.on('response', async (res) => {
  if (res.url().includes('clerk.accounts.dev') && res.url().includes('sign_ins')) {
    console.log(res.status(), await res.text());
  }
});
```

The response body's `status` field (e.g. `needs_client_trust`,
`needs_first_factor`, `needs_second_factor`) tells you what Clerk is
actually waiting for — far more specific than the SDK's thrown message.
Also always attach `page.on('pageerror', ...)` and
`page.on('console', ...)` before `goto()`, not after.

## 6. Screenshot and read it

`await page.screenshot({ path, fullPage: true })`, then **actually look at
the image** (Read tool) before reporting anything works. A blank white
page from a too-early `waitUntil: 'networkidle'` looks identical to a real
render failure until you cross-check with `waitUntil: 'load'` + an
explicit wait — don't report the first result as fact if it contradicts
what the server logs say should be happening.

## Known gaps found this way (don't re-debug blind — check here first)

- **`needs_client_trust` is handled, not a known gap anymore.** An earlier
  version of this note said `sign-in.tsx` couldn't resolve Clerk's
  `needs_client_trust` status. That was fixed: `submitSignIn()` now checks
  for it and calls `signIn.mfa.sendEmailCode()` before finalizing, with
  `submitSignInTrustVerification()` handling the follow-up code. If sign-in
  still fails at this status, treat it as a real regression, not the old
  known limitation.

## Mocked test suites cannot catch these two classes of bug — verify for real

Two bugs shipped straight through a full plan→build→QA→tech-lead→CTO gated
pipeline (all four stages reported clean) because every test in this
project mocks native/platform modules entirely, and none of those stages
ever actually booted the real Metro web bundler or checked with fresh
route-type generation. Both were "structurally undetectable by the gates as
configured," not missed through carelessness — so the gates themselves
needed to change, not just "be more careful next time."

1. **A new native-module dependency (e.g. `expo-sqlite`) can have broken or
   missing web support that mocked tests will never surface.** Expo Router
   bundles every route into one web bundle, so one unresolvable import
   breaks the *entire app* on web, not just the screen that uses it.
   **Whenever a ticket adds a new native module dependency**, actually run
   `npx expo start --web` (fresh, `--clear`) and confirm the bundle boots
   with no `Metro error` in the log — not just that the mocked test suite is
   green. If it needs a web-specific implementation, this codebase's
   pattern is a `*.web.ts`/`*.web.tsx` twin (see `use-color-scheme.web.ts`,
   `app-tabs.web.tsx`) — Metro/Expo Router pick the platform-suffixed file
   automatically; Jest does not (jest-expo resolves the platform-less
   specifier to the *native* file by default), so a web-specific file needs
   its own test that imports it by explicit relative path (`from
   '../thing.web'`), demonstrated in `use-color-scheme.web.test.tsx` and
   `settings-db.web.test.ts`.
2. **`npx tsc --noEmit` can silently under-report when a ticket adds new
   route files.** Expo Router generates `.expo/types/router.d.ts` from the
   files that exist in `app/src/app/`, and that file is only regenerated by
   starting the dev server (or another Expo CLI command that triggers
   codegen) — not by `tsc` itself. Every "exactly N pre-existing errors, no
   new ones" claim checked *before* ever starting the dev server since a
   route file was added is checked against **stale route types**, and a
   real typed-route mistake (e.g. `router.push('/settings/index')` when
   Expo Router normalizes directory-index routes to `/settings`) is
   invisible until the dev server has run at least once. **Whenever a
   ticket adds or renames a file under `app/src/app/`, start the dev server
   once before trusting a `tsc --noEmit` baseline comparison** — delete
   `.expo/types/` first if unsure whether a stale cache is already in play.
