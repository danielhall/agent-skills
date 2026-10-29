---
name: nextjs-cloudflare-deploy
description: Deploys Next.js apps to Cloudflare Workers with the OpenNext adapter (@opennextjs/cloudflare), covering wrangler.jsonc, production deploys and per-branch Worker Previews with Workers Builds, secrets, gating deploys on CI, build-time versus runtime environment variables, ISR caching with R2 and D1, and Worker size limits. Use when deploying Next.js to Cloudflare, setting up preview deployments for branches or pull requests, configuring OpenNext or wrangler for a Next.js app, or debugging a Next.js site that behaves differently on Workers than locally.
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
  "routes": [{ "pattern": "example.com", "custom_domain": true }],
  "preview_urls": true,
  "vars": { "NEXT_PUBLIC_SITE_URL": "https://example.com/" },
  "previews": {
    "vars": { "NEXT_PUBLIC_SITE_URL": "https://example.com/" }
  }
}
```

The top level is production. The `previews` block configures the Worker Previews built for other branches (see [Environments](#environments)).

- The `ASSETS` binding name is required by the OpenNext worker. Don't rename it.
- `custom_domain: true` makes the Worker the origin and creates the DNS record. The domain's zone must be in the same Cloudflare account.
- Add `.open-next/` and `.wrangler/` to `.gitignore`.

## Environments

Use one Worker. Production is what `wrangler deploy` publishes from the top level of `wrangler.jsonc`. Every other branch gets a [Worker Preview](https://developers.cloudflare.com/workers/previews/): its own URL, configured by the `previews` block, separate from the Worker's versions and deployments. `wrangler preview` is in open beta, so use a recent Wrangler (it was still private beta in 4.95; 4.155 works).

With [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) (the Git integration), set under Settings, Build:

| Setting | Value |
| ------- | ----- |
| Production branch | `main` |
| Build command | `npm run build` (or the pnpm/yarn equivalent) |
| Deploy command | `npx opennextjs-cloudflare populateCache remote && npx wrangler deploy` |
| Preview builds | On, with Preview command `npx wrangler preview` |

**Never run `wrangler deploy` for a branch.** Workers Builds always targets the Worker the repository is connected to, replacing the `name` in your config. So a "preview" environment with its own `name`, deployed from a branch, replaces production. The same goes for `wrangler versions upload` from branches: it doesn't deploy, but a later secret change can (see [Environment variables](#environment-variables)).

**Previews inherit nothing.** List every binding and variable again inside `previews`, pointing at preview-safe resources:

- Give previews their own incremental-cache R2 bucket and tag-cache D1 database. Otherwise a revalidation on a preview expires production's cached pages.
- Don't add routes, custom domains or Cron Triggers to `previews`. They only ever apply to production.
- Set preview secrets once in the Previews base config, which each new Preview copies: `npx wrangler preview base-config secret put NAME`. Leave out every credential that can write real data (CMS write tokens, database service keys, webhook secrets), because preview URLs are public.
- Pointing `NEXT_PUBLIC_SITE_URL` at the production domain keeps previews' canonical URLs on production, so they aren't indexed as duplicates.

**Preview URLs are off by default** since Wrangler 4.34. Without `"preview_urls": true` (applied on the next production `wrangler deploy`, or Domains, Worker URL, **Preview** in the dashboard), a Preview builds but shows "No URLs enabled".

**Previews never expire.** Cloudflare keeps them until they're deleted, and only removes the least recently deployed one when the per-Worker limit is reached. Delete a branch's Preview when its pull request closes:

```yaml
name: Preview cleanup
on:
  pull_request:
    types: [closed]
permissions:
  contents: read
jobs:
  delete-preview:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Delete Preview
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: <account-id>
          PREVIEW_NAME: ${{ github.head_ref }}
        run: |
          set +e
          out=$(npx --yes wrangler@<version> preview delete --name "$PREVIEW_NAME" --skip-confirmation 2>&1)
          status=$?
          echo "$out"
          # A branch that never built has no Preview.
          if [ $status -ne 0 ] && ! grep -q "Preview not found" <<<"$out"; then exit $status; fi
```

The Preview's name is the raw branch name, slashes included, so `github.head_ref` matches it. The API token only needs Account, Workers Scripts, Edit.

**Workers Builds doesn't wait for CI.** It builds on the push event, whatever GitHub Actions reports. To stop failing code reaching production, protect `main` with a GitHub ruleset: changes only through pull requests, required status checks, branches up to date before merging, and an empty bypass list. Workers Builds then only ever builds code that passed.

**Existing configs with `env.production`.** A `previews` block can sit inside a named environment, and `npx wrangler preview --env production` uses it. That keeps existing `--env production` commands working, with the top level left for local development.

**Named environments and Previews don't inherit bindings or `vars`.** Anything under `r2_buckets`, `d1_databases`, `services`, `durable_objects` or `vars` must be repeated in each. When changing one, change them all.

## Environment variables

There are two separate scopes, and a variable set in one isn't visible in the other.

| Scope | Set in | Seen by |
| ----- | ------ | ------- |
| Build | Cloudflare dashboard, Worker, Settings, Variables and Secrets, **Build** tab | `next build`, including static prerendering |
| Runtime | `wrangler.jsonc` `vars` (non-secret), or secrets (see below) | The deployed Worker handling requests |

The rules that cause the most trouble:

1. **Prerendered pages only see build-time variables.** `robots.ts`, `sitemap.ts` and any static page are rendered during the build, where runtime `vars` don't exist. Never make their output depend on a runtime-only variable. Give values like the site URL a sensible default in code (the production URL), so the build is correct even with no variables set. A runtime-only "is this production?" check in `robots.ts` can ship `Disallow: /` to production without anyone noticing.
2. **A page that only reads runtime variables can still be prerendered.** If a server component's request-specific code is skipped because a runtime-only variable is missing at build time (an auth client that returns `null` before reading cookies, for example), Next sees no dynamic API and prerenders the page. It then serves whatever the build produced, such as a not-found, to everyone. Call `await connection()` (from `next/server`) at the top of any page that must render per request.
3. **`wrangler deploy` overwrites the dashboard's plain runtime variables.** `vars` in `wrangler.jsonc` is the source of truth, and any plain runtime variable set only in the dashboard is deleted on the next deploy. Secrets are stored separately and survive deploys.
4. **`wrangler secret put` deploys.** It creates a new version from the latest uploaded version and deploys it straight away. If a branch has uploaded a version since the last production deploy, that branch's code goes live. Use `wrangler versions secret put NAME`, which creates a version without deploying it, then `wrangler versions deploy` once you've checked which code the version is built on. For Previews, use `wrangler preview base-config secret put` instead.
5. **Local builds bundle `.env` files.** OpenNext compiles the `.env*` files it finds at build time into the Worker and loads them into `process.env` at runtime. Build anything you publish in CI, never from a machine whose `.env.local` holds real credentials.

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
2. Check whether the code reads a runtime-only variable during prerendering, or a page that should be per request was prerendered (it returns the same thing whoever asks, such as a 404 only on the deployed site).
3. Check that bindings and `vars` are repeated in every named environment and in `previews`.
4. Look at the Worker's logs in the dashboard (with `observability` enabled) or run `npx wrangler tail --env production`.
5. If requests hang and return error 1101 after enabling `cacheComponents` or `'use cache'`, check the OpenNext release notes for your adapter version. Some versions didn't fully support them on Workers. Turn `cacheComponents` off and use `unstable_cache` until it's fixed.
