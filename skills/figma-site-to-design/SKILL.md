---
name: figma-site-to-design
description: Rebuilds an existing website's pages in Figma as editable, design-system-backed frames (variables, text styles, components, desktop and mobile breakpoints) using the Figma MCP server's use_figma tool. Use when the user asks to get their site into Figma, recreate pages in Figma for a redesign, push code to Figma, or build a Figma file from a running web app. Covers reference capture, exporting real data and icons, token and component setup, page assembly and Plugin API pitfalls.
---

# Website to Figma design file

Turns a running web app into a Figma file a designer can actually redesign from: real copy, real icons, colour and spacing variables with light/dark modes, text styles, reusable components, and every page built from instances of those components. Screenshots are only ever a reference, never the deliverable.

This skill sits on top of the Figma plugin's own skills. Load `figma-use` and `figma-generate-design` before any `use_figma` call, and `figma-generate-library` when creating components or variables.

## When to use

- "Get my site into Figma so I can redesign it"
- "Recreate these pages in Figma" / "push this app to Figma"
- Adding mobile frames or new pages to a Figma file that was built this way

## Steps

### 1. Read the source of truth

- The running app and the global stylesheet win over design docs. Docs drift during a redesign; say so if you find a mismatch.
- Collect: theme tokens (light and dark), font families and weights, the layout grid (gutters, rails, column widths), and the component files behind each page section.
- Check fonts exist in Figma with `figma.listAvailableFontsAsync()` before writing styles. Never fall back to Inter silently.

### 2. Capture reference screenshots with Playwright, not page captures

Use [`scripts/ref-screenshots.mjs`](scripts/ref-screenshots.mjs) at each target width (for example 1440 and 390). It sets `reducedMotion: "reduce"`, so scroll-reveal and entrance animations don't hide content.

`generate_figma_design` page captures are unreliable for this job: content behind in-view animations is captured blank, and captures opened in background browser tabs often stay `pending` forever. If you use them at all, open one tab at a time and delete the capture once it has served as a reference. If you inject the capture script into the app, remove it afterwards.

### 3. Export real data and icons from the codebase

Write a throwaway `tsx` script (outside the repo, or deleted afterwards) that imports the app's own data modules and renders icon components to SVG strings with `react-dom/server`'s `renderToStaticMarkup`. Then:

- Replace `currentColor` with a real colour, and give every SVG explicit `width`/`height`. Icon libraries emit `1em`, which Figma can't size.
- Dedupe icons by path data. Brand maps often alias many names to one logo.
- Pull CMS content (titles, excerpts, categories) with the CMS client rather than retyping it.

### 4. Build foundations first

One call each, returning every created ID:

1. Pages: Foundations, Components, one page per breakpoint.
2. Variable collections: theme colours (Light/Dark modes), category or brand colours, layout tokens (Desktop/Mobile modes). Set explicit `scopes` and WEB code syntax.
3. Text styles for every type role, plus mobile variants of the display sizes.
4. An effect style for any shared shadow.

### 5. Build components, smallest first

Icons, then primitives (buttons, links, tiles, badges, chips), then composites (header, footer, hero, cards). Expose TEXT, BOOLEAN and INSTANCE_SWAP properties so pages can be filled without detaching. Give responsive pieces a `Breakpoint` variant rather than overriding sizes on instances. Screenshot each group once and fix what's wrong before moving on.

### 6. Assemble pages from instances

- One `use_figma` call per page, at fixed canvas positions, so pages can be built in parallel.
- Mirror the CSS grid with auto-layout padding (for example a rail and gutter), not absolute positions.
- Equalise card heights per row explicitly; Figma doesn't stretch siblings the way CSS grid does.
- Compare each page's total height and a screenshot against the reference. Heights within a few percent mean the spacing is right.

### 7. Link components back to code

Code Connect only works on Organization and Enterprise plans. Check `whoami` first. On other plans, write the source path, component name and prop mapping into each component's `description` and set `documentationLinks` to the file on GitHub. Dev Mode shows both. Don't add `.figma.ts` files to a repo that can't publish them; they break `tsc` without the Code Connect package.

### 8. Clean up

Delete reference captures, remove any injected scripts, stop dev servers you started, and confirm `git status` is clean.

## Pitfalls

Read [references/plugin-api-pitfalls.md](references/plugin-api-pitfalls.md) before writing component or page scripts. It lists the failures that cost the most time, each with its fix: bound-paint opacity, `resize()` locking auto-layout sizing, property keys being re-keyed, lost references on cloned variants, the per-call size limit, and more.

[references/helpers.md](references/helpers.md) has the small helper functions worth pasting at the top of every page-building script.
