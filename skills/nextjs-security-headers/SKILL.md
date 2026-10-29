---
name: nextjs-security-headers
description: Adds HTTP security headers to a Next.js app, including a Content-Security-Policy built from the origins the site really loads, HSTS, Permissions-Policy, COOP/CORP, Referrer-Policy and frame protection, with a choice between a static CSP, nonces and Subresource Integrity, CSP rules for common third parties (analytics, Turnstile, Stripe, YouTube, Google Fonts, CMS image CDNs), and how to verify the headers after deploying. Use when the user asks to add security headers or a CSP, improve a securityheaders.com or Mozilla Observatory grade, fix "Refused to load" CSP errors, or add a new third-party script, embed or image host to a Next.js site.
---

# Security headers for Next.js

Most Next.js sites ship with none of these. Set them once in `next.config.ts`, keep the CSP's origin list honest, and check them on the deployed site.

## Steps

1. **List what the site loads from other origins.** Search the code for `<Script`, `<iframe`, `next/image` `remotePatterns`, `fetch(` calls made in the browser, font imports and embed components. Open the deployed site with DevTools, Network, and note every third-party host. Each one needs a CSP rule (see [Third-party origins](#third-party-origins)).
2. **Pick a CSP approach** (see [Choosing a CSP approach](#choosing-a-csp-approach)). Start with the static policy unless you know you need more.
3. **Add the headers** to `next.config.ts` (example below). Apply them to every route.
4. **Run the production build locally** (`next build && next start`, or your platform's preview command), open the browser console, and click through every page type and widget. CSP violations appear as `Refused to load …` or `Refused to execute …`. Fix each by adding the origin to the right directive, never by widening to `*`.
5. **Deploy and verify** (see [Verifying](#verifying)).

## Example `next.config.ts`

```ts
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// One line per directive. Document why each external origin is here (see the end of this skill).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cdn.example-cms.com",
  "font-src 'self' data:",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const permissionsPolicy = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "browsing-topics=()",
  "fullscreen=(self)",
].join(", ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: permissionsPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
```

## What each header does

| Header | Value | Notes |
| ------ | ----- | ----- |
| `Content-Security-Policy` | see below | Where scripts, styles, images, frames and requests may come from. The one that stops most injected-script attacks. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Two years of HTTPS-only. `includeSubDomains` breaks any subdomain still on plain HTTP, so check them first. Only submit to the preload list once you're sure: removal takes months. |
| `X-Content-Type-Options` | `nosniff` | Browsers trust the declared `Content-Type` instead of guessing. |
| `X-Frame-Options` | `DENY` | Clickjacking protection for old browsers. `frame-ancestors` does the same in the CSP. Use `SAMEORIGIN` (and `frame-ancestors 'self'`) if the site frames its own pages. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Full URL on same-origin requests, only the origin cross-origin, nothing on HTTPS to HTTP. |
| `Permissions-Policy` | `camera=(), …` | Turns off browser features the site doesn't use. Leave out any the site does use, such as `payment` with Stripe's Payment Request button, or `fullscreen` for video embeds. |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolates the window from cross-origin popups. Use `same-origin-allow-popups` if sign-in or payment flows open a popup that has to talk back to the page. |
| `Cross-Origin-Resource-Policy` | `same-site` | Stops other sites embedding your resources. `same-site` still lets your own subdomains (a CMS studio, for example) load them. |

## Choosing a CSP approach

Next.js inlines small scripts in every page, so `script-src` can't simply be `'self'`. There are three ways to handle that:

| Approach | `script-src` | Cost | Use when |
| -------- | ------------ | ---- | -------- |
| **Static** (above) | `'self' 'unsafe-inline'` plus your script origins | None. Pages stay static and cacheable. | Most marketing sites, blogs and docs sites. Still blocks scripts from unlisted origins, framing, plugins and form hijacking. |
| **Nonce** | `'self' 'nonce-<random>' 'strict-dynamic'` | Every page must render per request: no static generation, no partial prerendering, slower and costlier. | Apps handling sensitive data, or where an XSS bug would be serious. See [Nonce-based CSP](references/nonce-csp.md). |
| **Subresource Integrity** (experimental) | `'self'` with `experimental.sri` | Experimental, App Router only, can't cover scripts generated at runtime. | You want to drop `'unsafe-inline'` but keep static pages. |

Whichever you choose:

- **Development needs `'unsafe-eval'`.** React uses `eval` in development for better error stacks. Add it only when `NODE_ENV` is `development`, as above. Some teams send no CSP in development at all; that's simpler, but CSP problems then only show up after deploying.
- **Styles need `'unsafe-inline'`** unless you use nonces, because Next.js and most CSS-in-JS libraries inject `<style>` tags.
- **Never add `*`, `https:` or `'unsafe-eval'` in production** to make an error go away. Find the exact origin instead.

## Third-party origins

Add only what the site actually uses. Each service needs every directive in its row.

| Service | `script-src` | `connect-src` | `frame-src` | Other |
| ------- | ------------ | ------------- | ----------- | ----- |
| Cloudflare Turnstile | `https://challenges.cloudflare.com` | same | same | |
| Google reCAPTCHA | `https://www.google.com https://www.gstatic.com` | | `https://www.google.com` | |
| Cloudflare Web Analytics | `https://static.cloudflareinsights.com` | `https://cloudflareinsights.com` | | |
| Google Analytics 4 / Tag Manager | `https://www.googletagmanager.com` | `https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com` | | `img-src https://*.google-analytics.com https://*.googletagmanager.com` |
| Plausible | `https://plausible.io` | `https://plausible.io` | | |
| Vercel Analytics / Speed Insights | | `https://vitals.vercel-insights.com` (or same-origin `/_vercel`) | | |
| Stripe.js | `https://js.stripe.com` | `https://api.stripe.com` | `https://js.stripe.com https://hooks.stripe.com` | |
| YouTube embeds | | | `https://www.youtube-nocookie.com https://www.youtube.com` | `img-src https://i.ytimg.com` for thumbnails |
| Vimeo embeds | | | `https://player.vimeo.com` | |
| Google Fonts (CDN, not `next/font`) | | | | `style-src https://fonts.googleapis.com`, `font-src https://fonts.gstatic.com` |
| CMS or image CDN through `next/image` | | | | `img-src https://<cdn-host>` (unoptimised images only; optimised ones are same-origin) |
| Sentry | | `https://*.ingest.sentry.io` (or your tunnel route) | | |

Services change their hosts. Treat this table as a starting point and confirm against the console on the deployed site. `next/font/google` downloads fonts at build time and serves them from your own origin, so it needs no font rule.

When a script is injected by your host or CDN (analytics added at the edge, for example), it still needs a CSP rule, and edge injection can add `integrity` attributes that fail when a blocker strips the request. Embedding the script yourself with `<Script>` gives you control over both.

## Common mistakes

- **Headers that don't reach static files.** `headers()` doesn't apply to files some platforms serve straight from storage (on Cloudflare Workers with OpenNext, `_next/static` and `public/`). That's fine for the CSP, which only matters on HTML responses, but set cache and other headers for those files in the platform's own config (for example `public/_headers`).
- **`frame-ancestors` in a `<meta>` tag.** It's ignored there. Send the CSP as a header.
- **Forgetting `connect-src`.** A widget whose script loads but whose API calls are blocked fails in confusing ways. Most third parties need both.
- **HSTS on a staging domain.** `includeSubDomains` on the apex covers `staging.` and everything else. Make sure they all serve HTTPS first.
- **Blocking your own CMS preview or admin.** If an admin UI frames the site for live preview, `frame-ancestors 'none'` and `X-Frame-Options: DENY` block it. Allow that one origin in `frame-ancestors` and drop `X-Frame-Options`, or send different headers on preview routes.

## Verifying

- `curl -sI https://example.com/ | grep -iE 'content-security|strict-transport|permissions|referrer|cross-origin|x-frame|x-content'` shows every header is present on HTML responses.
- [securityheaders.com](https://securityheaders.com): a static CSP with `'unsafe-inline'` scores A. Nonces or SRI are needed for A+.
- [Mozilla Observatory](https://developer.mozilla.org/en-US/observatory) explains each deduction.
- Click through every page type in the browser with the console open, including forms, embeds and anything behind sign-in.
- Optionally add `report-to` (or `report-uri`) pointing at a collector to hear about violations from real visitors. Try `Content-Security-Policy-Report-Only` first when tightening an existing policy.

Document the policy next to the code: each external origin, which directive it's in, and why. When someone adds a new third-party script, that list is what they update.
