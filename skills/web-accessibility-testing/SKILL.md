---
name: web-accessibility-testing
description: Sets up and runs automated accessibility testing for websites with Playwright and axe-core against WCAG 2.2 AA, including a sitemap-driven audit, keyboard tests and a blocking CI job. Use when adding accessibility tests, auditing a site for accessibility, fixing axe violations, or when the user mentions a11y, WCAG, screen readers or keyboard navigation.
---

# Web accessibility testing

The target is WCAG 2.2 AA. Accessibility failures fail CI in the same way as broken tests.

Automated checks find roughly a third of WCAG issues. Treat a clean axe run as the minimum, not proof of conformance, and keep a record of the manual checks too (see [Manual checks](#manual-checks)).

## Setup

```bash
npm i -D @playwright/test @axe-core/playwright
npx playwright install --with-deps chromium
```

Use the repo's package manager (`pnpm add -D`, `yarn add -D`) if it isn't npm.

Add a script to `package.json`:

```json
"a11y": "playwright test tests/a11y"
```

In `playwright.config.ts`, point `webServer` at the dev server with `reuseExistingServer: true` so the tests work whether or not a server is already running. One Chromium project is enough for axe; cross-browser runs add time without finding more violations.

## The audit spec

Copy [assets/audit.spec.ts](assets/audit.spec.ts) to `tests/a11y/audit.spec.ts`. It:

1. Reads `/sitemap.xml` from the running site so every published page is checked, and falls back to a hard-coded list if there's no sitemap.
2. Adds pages the sitemap leaves out on purpose, such as `/contact` or a logged-in dashboard. Edit `EXTRA_ROUTES`.
3. Sets `prefers-reduced-motion: reduce` before scanning. Without it, axe can catch fade-in animations halfway through and report contrast failures that users never see.
4. Runs axe with the WCAG 2.2 AA tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`.
5. Writes every violation to `docs/a11y-baseline.json`. Commit this file so progress shows up in git history.
6. Fails the run according to `FAIL_ON` (see below).

### What fails the build

- **New projects:** fail on any violation. Set `FAIL_ON` to all four impact levels.
- **Existing sites with a backlog:** fail on `critical` and `serious` only, and fix `moderate` and `minor` from the baseline report over time. Tighten to all four once the backlog is clear.

### Known issues

Don't switch rules off globally to get a green build. If something can't be fixed yet:

- Prefer `.exclude("<selector>")` scoped to the element over `.disableRules([...])`.
- Put the reason and an issue link on the same line.
- Remove the exclusion when the issue is fixed.

## Keyboard tests

axe can't tell whether a page works without a mouse. Add `tests/a11y/keyboard.spec.ts` covering the parts that can be checked automatically:

```ts
import { test, expect } from "@playwright/test";

test("skip link is the first focusable element", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toHaveText(/skip to (main )?content/i);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("dialog traps focus and Escape returns it to the trigger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /open (menu|navigation)/i });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
  }

  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
```

Also worth covering when the site has them:

- Focus moves to the new page's content (or a skip link) after client-side navigation.
- Form errors are announced: the error is linked with `aria-describedby`, and the submit result lands in an `aria-live` region that receives focus.
- Toggle buttons have a label that describes what pressing them will do ("Switch to dark theme"), not a fixed "Toggle theme".
- Anything that updates in place (search results, tool output) sits in an `aria-live="polite"` region.

## CI

Run the suite as a required job on pull requests:

```yaml
a11y:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: npm run build
    - run: npm run a11y
```

If the site needs environment variables to build, add them as repository secrets. If it can build without them (with empty content), the audit still checks the page shells.

## Manual checks

Record these in `docs/accessibility.md` as a checklist with a status for each, so it's clear what has and hasn't been checked by a person:

- **Keyboard only.** Tab through every page. Focus is always visible, follows the visual order and never gets trapped outside a dialog.
- **Screen reader.** VoiceOver with Safari on macOS (`Cmd+F5`), and optionally NVDA with Firefox on Windows. Use the rotor (`Ctrl+Option+U`) to check headings, landmarks and form controls.
- **Reduced motion.** Turn it on in the OS settings and check every animation stops or simplifies.
- **Zoom and reflow.** At 200% zoom and at 320px wide, nothing is cut off and there's no horizontal scrolling.
- **Contrast.** Check text over images and gradients by hand, because axe can't measure those reliably.
- **Content.** Alt text actually describes the image, link text makes sense out of context, and each page has one `h1` with headings in order.

## When fixing violations

- Fix the shared component, not each page that uses it.
- Use native elements before ARIA: a `<button>` rather than a `div` with `role="button"`. Wrong ARIA is worse than none.
- After fixing, re-run `npm run a11y` and commit the updated baseline with the fix.
