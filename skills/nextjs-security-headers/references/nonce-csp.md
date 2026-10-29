# Nonce-based CSP in Next.js

A nonce lets the policy drop `'unsafe-inline'` from `script-src`: each response gets a fresh random value, it goes in the CSP header, and Next.js adds it to the scripts it renders. Injected scripts don't know the nonce, so the browser refuses them.

The cost: a nonce has to be new on every request, so **every page that uses it must render dynamically**. No static generation, no ISR for those pages, and partial prerendering doesn't work with nonces. Check the current Next.js guide (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` in recent versions) before relying on the details below.

## 1. Generate the nonce in `proxy.ts`

Next.js 16 calls this file `proxy.ts` (earlier versions, and some hosting adapters that don't support the Node.js proxy yet, use `middleware.ts` with the same code exported as `middleware`).

```ts
import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
```

Setting the CSP on the request headers is what lets Next.js find the nonce and apply it to its own scripts.

## 2. Make the pages dynamic

Reading request headers makes a page dynamic. Where a page doesn't otherwise touch the request, opt it in explicitly:

```ts
import { connection } from "next/server";

export default async function Page() {
  await connection();
  // ...
}
```

## 3. Pass the nonce to your own scripts

```tsx
import { headers } from "next/headers";
import Script from "next/script";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en">
      <body>
        {children}
        <Script src="https://www.googletagmanager.com/gtag/js" strategy="afterInteractive" nonce={nonce} />
      </body>
    </html>
  );
}
```

`'strict-dynamic'` means scripts loaded by a trusted (nonced) script are trusted too, so third-party loaders that add more scripts keep working without listing every host. Browsers that support `'strict-dynamic'` ignore host allowlists in `script-src`; keep them anyway for older browsers.

## When it isn't worth it

If most of the site is static content (a blog, docs, marketing pages), the performance and hosting cost of rendering every page per request usually outweighs the gain. Use the static policy, or try the experimental Subresource Integrity option, which hashes scripts at build time and keeps pages static.
