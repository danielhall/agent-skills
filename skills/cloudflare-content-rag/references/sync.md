# Sync: CMS to R2

Two parts: a pure serialiser (easy to test) and a route that writes or deletes files.

## Serialiser

Keep it pure: CMS document in, `{ key, markdown, metadata }` out, or `null` when the document shouldn't be indexed.

```ts
export type KnowledgeMetadata = {
  doc_type: "post" | "doc" | "project" | "note";
  doc_id: string;
  slug: string;
  title: string;
  updated: string; // R2 custom metadata values are strings; declare the field as a number in AI Search
};

export type KnowledgeFile = { key: string; markdown: string; metadata: KnowledgeMetadata };

const FOLDERS: Record<KnowledgeMetadata["doc_type"], string> = {
  post: "posts",
  doc: "docs",
  project: "projects",
  note: "notes",
};

export function serialise(doc: CmsDocument, siteUrl: string): KnowledgeFile | null {
  if (!doc.published || doc.hidden || !doc.slug) {
    return null;
  }

  const type = doc.type as KnowledgeMetadata["doc_type"];
  const url = new URL(`/${FOLDERS[type]}/${doc.slug}`, siteUrl).toString();
  const frontMatter = [
    "---",
    `type: ${type}`,
    `title: ${JSON.stringify(doc.title)}`,
    `url: ${url}`,
    `updated: ${doc.updatedAt.slice(0, 10)}`,
    doc.tags?.length ? `tags: [${doc.tags.map((tag) => JSON.stringify(tag)).join(", ")}]` : null,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  const body = [`# ${doc.title}`, doc.summary ? `Summary: ${doc.summary}` : null, richTextToMarkdown(doc.body)]
    .filter(Boolean)
    .join("\n\n");

  return {
    key: `${FOLDERS[type]}/${doc.slug}.md`,
    markdown: `${frontMatter}\n\n${body}\n`,
    metadata: {
      doc_type: type,
      doc_id: doc.id,
      slug: doc.slug,
      title: doc.title,
      updated: String(Math.floor(Date.parse(doc.updatedAt) / 1000)),
    },
  };
}
```

Test it with fixtures for each type, including documents that should be skipped. Most CMSs have a rich text to Markdown converter (Portable Text, Contentful rich text, Lexical, MDX); give custom blocks (code, callouts, images) explicit Markdown output and drop UI-only blocks.

## Route

```ts
// POST /api/assistant/sync
export async function POST(request: Request) {
  const secret = env.ASSISTANT_SYNC_SECRET;
  const bucket = env.KNOWLEDGE;

  if (!secret || !bucket) {
    return Response.json({ error: "Sync isn't configured." }, { status: 503 });
  }

  const url = new URL(request.url);

  if (url.searchParams.get("mode") === "full") {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorised." }, { status: 401 });
    }

    return Response.json(await syncAll(bucket));
  }

  // Read the raw body: the signature is over the exact bytes sent.
  const payload = await request.text();

  if (!(await validSignature(payload, request.headers.get("x-webhook-signature"), secret))) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  const { id } = JSON.parse(payload) as { id?: string };

  if (!id) {
    return Response.json({ error: "Missing id." }, { status: 400 });
  }

  return Response.json({ id, result: await syncDocument(bucket, id.replace(/^drafts\./, "")) });
}
```

Use your CMS's own verification library when it has one, since signature formats differ (Sanity's `@sanity/webhook`, Contentful's request verification, Stripe-style timestamped signatures). A plain HMAC-SHA256 of the body looks like this:

```ts
async function validSignature(payload: string, signature: string | null, secret: string) {
  if (!signature) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.match(/../g) ?? [], (hex) => parseInt(hex, 16));
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(payload));
}
```

`crypto.subtle.verify` compares in constant time; don't compare signature strings with `===`.

## Writing and deleting

```ts
export async function syncDocument(bucket: R2Bucket, id: string): Promise<string> {
  const doc = await cms.getDocument(id);
  const file = doc ? serialise(doc, SITE_URL) : null;

  if (file) {
    await bucket.put(file.key, file.markdown, {
      customMetadata: file.metadata,
      httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    });
    return `put ${file.key}`;
  }

  // Gone, unpublished or no longer eligible: find its file by doc_id, since the slug may have changed.
  const existing = await findKeyById(bucket, id);

  if (existing) {
    await bucket.delete(existing);
    return `deleted ${existing}`;
  }

  return "skipped";
}

export async function syncAll(bucket: R2Bucket) {
  const written = new Set<string>();

  for (const id of await cms.listIds()) {
    const doc = await cms.getDocument(id);
    const file = doc ? serialise(doc, SITE_URL) : null;

    if (file) {
      await bucket.put(file.key, file.markdown, { customMetadata: file.metadata });
      written.add(file.key);
    }
  }

  // Anything not written this time is stale.
  const stale: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ cursor, include: ["customMetadata"] });
    stale.push(...page.objects.map((object) => object.key).filter((key) => !written.has(key)));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  if (stale.length) {
    await bucket.delete(stale);
  }

  return { written: written.size, deleted: stale.length };
}
```

```ts
async function findKeyById(bucket: R2Bucket, id: string): Promise<string | null> {
  let cursor: string | undefined;

  do {
    const page = await bucket.list({ cursor, include: ["customMetadata"] });
    const match = page.objects.find((object) => object.customMetadata?.doc_id === id);

    if (match) {
      return match.key;
    }

    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return null;
}
```

This lists the bucket, which is fine for hundreds or a few thousand files. Beyond that, keep an ID-to-key index (in KV or D1) instead.

A slug change writes a new key; the old file is found by `doc_id` on the next delete or removed by the next full sync. If documents change faster than you can tolerate stale files, look up and delete the old key by `doc_id` before every put.

## Webhook setup

- Trigger on create, update and delete for every indexed type, plus any type folded into another (so the parent re-syncs).
- Send only the ID and type in the body; the route fetches the current version itself, so an out-of-order webhook can't write stale content.
- Use a different secret from any other webhook, and don't reuse one that appears in URLs.
