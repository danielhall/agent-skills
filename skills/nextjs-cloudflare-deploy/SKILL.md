---
name: nextjs-cloudflare-deploy
description: Deploys Next.js apps to Cloudflare Workers with the OpenNext adapter (@opennextjs/cloudflare), covering wrangler.jsonc, preview and production environments, build-time versus runtime environment variables, ISR caching with R2 and D1, and Worker size limits. Use when deploying Next.js to Cloudflare, configuring OpenNext or wrangler for a Next.js app, or debugging a Next.js site that behaves differently on Workers than locally.
---

# Next.js on Cloudflare Workers

Next.js runs on Workers through [OpenNext](https://opennext.js.org/cloudflare) (`@opennextjs/cloudflare`). The adapter changes quickly, so check its docs for anything version-specific before relying on the details below.

## Files

**`package.json` scripts:**

```json
{
  "dev": "next dev",
  "build": "opennextjs-cloudflare build",
  "build:next": "next build",
  "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
  "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy"
}
```

`pnpm dev` is plain Next.js with no Worker involved. Use `preview` to test in the real Workers runtime before deploying.

**`open-next.config.ts`:**

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig({}),
  buildCommand: "next build",
};
```

Set `buildCommand: "next build"` explicitly. Because the `build` script is itself `opennextjs-cloudflare build`, OpenNext would otherwise call the `build` script again and loop.

**`wrangler.jsonc`:**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "<worker-name>",
  "main": ".open-next/worker.js",
  "compatibility_date": "<today>",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "binding": "ASSETS", "directory": ".open-next/assets" },
  "observability": { "enabled": true },
  "vars": {
    "NEXT_PUBLIC_SITE_URL": "https://<worker-name>.<subdomain>.workers.dev/"
  },
  "env": {
    "production": {
      "name": "<worker-name>",
      "routes": [{ "pattern": "example.com", "custom_domain": true }],
      "vars": { "NEXT_PUBLIC_SITE_URL": "https://example.com/" }
    }
  }
}
```

- The `ASSETS` binding name is required by the OpenNext worker. Don't rename it.
- `custom_domain: true` makes the Worker the origin and creates the DNS record. The domain's zone must be in the same Cloudflare account.
- Add `.open-next/` and `.wrangler/` to `.gitignore`.

## Environments

The top level of `wrangler.jsonc` is the preview environment, and `env.production` is production.

| Branch | Deploy command |
| ------ | -------------- |
| `main` | `npx wrangler deploy --env production` |
| Everything else | `npx wrangler deploy --env=""` |

`--env=""` targets the top-level environment explicitly. Leaving `--env` out when the config has named environments makes Wrangler print a warning.

**Named environments don't inherit bindings or `vars`.** Anything under `r2_buckets`, `d1_databases`, `services`, `durable_objects` or `vars` must be repeated inside `env.production`. When changing one, change both.

## Environment variables

There are two separate scopes, and a variable set in one isn't visible in the other.

| Scope | Set in | Seen by |
| ----- | ------ | ------- |
| Build | Cloudflare dashboard, Worker, Settings, Variables and Secrets, **Build** tab | `next build`, including static prerendering |
| Runtime | `wrangler.jsonc` `vars` (non-secret), or `wrangler secret put` (secret) | The deployed Worker handling requests |

The two rules that cause the most trouble:

1. **Prerendered pages only see build-time variables.** `robots.ts`, `sitemap.ts` and any static page are rendered during the build, where runtime `vars` don't exist. Never make their output depend on a runtime-only variable. Give values like the site URL a sensible default in code (the production URL), so the build is correct even with no variables set. A runtime-only "is this production?" check in `robots.ts` can ship `Disallow: /` to production without anyone noticing.
2. **`wrangler deploy` overwrites the dashboard's plain runtime variables.** `vars` in `wrangler.jsonc` is the source of truth, and any plain runtime variable set only in the dashboard is deleted on the next deploy. Secrets are stored separately and survive deploys. So each non-secret runtime variable lives in `wrangler.jsonc`, and anything else goes in with `wrangler secret put NAME --env production` (and again without `--env` for preview).

Keep a `.env.example` listing every variable the app reads, with a comment saying which scope each needs.

## ISR and revalidation

With the default config, ISR and `revalidateTag`/`revalidatePath` don't work on Workers. Pages stay as they were at build time until the next deploy, and nothing reports an error. If the site uses ISR or on-demand revalidation (a CMS webhook, for example), configure the caches:

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

export default {
  ...defineCloudflareConfig({
    incrementalCache: r2IncrementalCache,
    queue: doQueue,
    tagCache: d1NextTagCache,
  }),
  buildCommand: "next build",
};
```

Then add the bindings to `wrangler.jsonc` (and to `env.production`). The binding names are fixed by OpenNext:

- `NEXT_INC_CACHE_R2_BUCKET`: an R2 bucket for the incremental cache.
- `NEXT_TAG_CACHE_D1`: a D1 database for the tag cache. It's only needed for on-demand revalidation, and it needs a `revalidations` table, as described in the OpenNext caching docs.
- `NEXT_CACHE_DO_QUEUE`: the Durable Object queue, plus a `migrations` entry for `DOQueueHandler`.
- `WORKER_SELF_REFERENCE`: a service binding pointing at the Worker itself.

The memory queue (`memory-queue`) only removes duplicate requests within a single isolate, and OpenNext says it isn't fully suitable for production. Use the Durable Object queue.

`opennextjs-cloudflare deploy` fills the cache from the build automatically. If you deploy with `wrangler deploy` instead, run `opennextjs-cloudflare populateCache remote --env production` first, otherwise the first request to each ISR page renders from scratch.

## Worker size

Workers are limited to 3 MiB compressed on the Free plan and 10 MiB on Paid. Only the gzip figure from `wrangler deploy` counts. A Next.js app with a CMS client and syntax highlighting can easily go over 3 MiB.

If the Worker is too big:

1. Run `opennextjs-cloudflare build`, then load `.open-next/server-functions/default/handler.mjs.meta.json` into the esbuild bundle analyser.
2. Common causes: importing all of `shiki` instead of `shiki/core` and the specific languages you need, embedding a CMS studio (such as Sanity Studio) in the app instead of hosting it separately, and large icon packs imported in full.

Check the size after adding any large server-side dependency.

## Caching static files

The Worker doesn't run in front of static assets, so `headers()` in `next.config.ts` doesn't apply to `_next/static`. Add `public/_headers`:

```
/_next/static/*
  Cache-Control: public,max-age=31536000,immutable
```

## When something works locally but not on Workers

1. Run `pnpm preview` to reproduce it in the Workers runtime.
2. Check whether the code reads a runtime-only variable during prerendering.
3. Check that bindings and `vars` are repeated in `env.production`.
4. Look at the Worker's logs in the dashboard (with `observability` enabled) or run `npx wrangler tail --env production`.
5. If requests hang and return error 1101 after enabling `cacheComponents` or `'use cache'`, check the OpenNext release notes for your adapter version. Some versions didn't fully support them on Workers. Turn `cacheComponents` off and use `unstable_cache` until it's fixed.
