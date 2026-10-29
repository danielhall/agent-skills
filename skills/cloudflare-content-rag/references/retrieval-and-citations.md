# Retrieval and citations

Pure functions, so they're easy to unit test with fixture chunks.

## Picking chunks

```ts
// Specific questions clear STRONG easily; vague ones land just under it on the right documents.
export const STRONG_SCORE = 0.5;
export const FLOOR_SCORE = 0.4;
const FALLBACK_COUNT = 3;

export function pickChunks<T extends { score: number }>(chunks: T[]): T[] {
  const ranked = [...chunks].sort((a, b) => b.score - a.score);
  const strong = ranked.filter((chunk) => chunk.score >= STRONG_SCORE);

  return strong.length
    ? strong
    : ranked.filter((chunk) => chunk.score >= FLOOR_SCORE).slice(0, FALLBACK_COUNT);
}
```

Pass `match_threshold: FLOOR_SCORE` to the search so AI Search returns the fallback candidates too.

## What to search for

```ts
type Message = { role: "user" | "assistant"; content: string };

/** The newest question alone, so earlier questions can't drown it out. */
export function latestQuestion(messages: Message[]): Message[] {
  const last = messages.findLast((message) => message.role === "user");
  return last ? [{ role: "user", content: last.content }] : [];
}

/** The last few questions as one message, so follow-ups like "why?" have context. */
export function threadQuery(messages: Message[], turns = 3): Message[] {
  const questions = messages.filter((message) => message.role === "user").slice(-turns);
  return [{ role: "user", content: questions.map((message) => message.content).join("\n") }];
}

/** The latest question's top matches first, then the thread's, without duplicates. */
export function mergeChunks<T extends { id: string; score: number }>(
  latest: T[],
  thread: T[],
  max: number,
  ownCount = 3,
): T[] {
  const own = pickChunks(latest);
  const ordered = [...own.slice(0, ownCount), ...pickChunks(thread), ...own.slice(ownCount)];
  const seen = new Set<string>();

  return ordered.filter((chunk) => !seen.has(chunk.id) && seen.add(chunk.id)).slice(0, max);
}
```

Sending the whole conversation (assistant turns included) as the search query tends to fail or return the previous topic. Questions only.

## Searching

```ts
const search = (messages: Message[]) =>
  env.SEARCH.search({
    messages,
    ai_search_options: {
      retrieval: { retrieval_type: "vector", match_threshold: FLOOR_SCORE, max_num_results: 8 },
      reranking: { enabled: false },
    },
  });

// One retry: AI Search occasionally fails transiently.
const searchWithRetry = (messages: Message[]) =>
  search(messages).catch(() => search(messages)).catch(() => null);

const latest = latestQuestion(messages);
const thread = threadQuery(messages);
const [own, recent] = await Promise.all([
  searchWithRetry(latest),
  thread[0]?.content === latest[0]?.content ? null : searchWithRetry(thread),
]);
const chunks = mergeChunks(own?.chunks ?? [], recent?.chunks ?? [], 8);
```

Each chunk has `id`, `text`, `score` and `item: { key, metadata }`, where `metadata` holds the custom fields written to R2. Filter by metadata with `ai_search_options.retrieval.filters` when you need to scope a search (only docs for one product version, for example).

## Labelling sources for the prompt

```ts
export type Source = { label: string; type: string; slug: string; title: string };

export function buildContext(chunks: Chunk[]): { sources: Source[]; context: string } {
  const sources: Source[] = [];
  const parts: string[] = [];

  chunks.forEach((chunk, index) => {
    const metadata = chunk.item.metadata ?? {};
    const [folder, file] = chunk.item.key.split("/");
    const source = {
      label: `S${index + 1}`,
      type: String(metadata.doc_type ?? folder),
      slug: String(metadata.slug ?? file?.replace(/\.md$/, "")),
      title: String(metadata.title ?? file),
    };

    sources.push(source);
    parts.push(`<source label="${source.label}" type="${source.type}" title="${source.title}">\n${chunk.text}\n</source>`);
  });

  return { sources, context: parts.join("\n\n") };
}
```

Fall back to the object key when metadata is missing, so a file uploaded without metadata still maps to a document.

## Mapping citations back

```ts
/** Sources the answer cited, in first-cited order. Labels that weren't retrieved are dropped. */
export function citedSources(answer: string, sources: Source[]): Source[] {
  const byLabel = new Map(sources.map((source) => [source.label, source]));
  const cited = new Map<string, Source>();

  for (const [, label] of answer.matchAll(/\[(S\d+)\]/g)) {
    const source = byLabel.get(label);

    if (source && !cited.has(`${source.type}:${source.slug}`)) {
      cited.set(`${source.type}:${source.slug}`, source);
    }
  }

  return [...cited.values()];
}

/** Removes [S1] and grouped [S1, S2] markers, for display and for earlier turns sent back to the model. */
export const stripCitations = (text: string) => text.replace(/\s?\[S\d+(?:,\s*S\d+)*\]/g, "");
```

Several chunks often come from one document; the type-and-slug key collapses them into one source card. Build card links from `type` and `slug` with the site's own routes, never from text the model wrote.

## Tests worth having

- `pickChunks`: strong chunks win; with none, the best three above the floor; nothing below the floor.
- `mergeChunks`: a new topic's top match survives a long thread; duplicates are removed; the cap holds.
- `citedSources`: unknown labels are dropped; repeated documents collapse; order follows first citation.
- `stripCitations`: single and grouped markers go, the surrounding text stays intact.
