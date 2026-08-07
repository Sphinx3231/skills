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

- Fresh/unrecognized browser sessions can land Clerk sign-in on
  `needs_client_trust` (a device-verification hold), which
  `sign-in.tsx`'s `submitSignIn()` doesn't handle — it calls
  `signIn.finalize()` unconditionally after the password step succeeds,
  which throws when status isn't `complete`. No in-SDK method for
  resolving `needs_client_trust` was found in the installed `@clerk/*`
  packages as of this writing; it likely requires the user to click an
  email confirmation link from Clerk. If sign-in via this skill's flow
  fails with that status, that's the known cause — report it, don't
  assume it's a new bug in whatever feature you're actually testing.
