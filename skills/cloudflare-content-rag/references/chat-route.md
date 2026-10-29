# Chat route

A single `POST` endpoint that validates, protects, retrieves and streams. Shown as a Next.js route handler on OpenNext (`getCloudflareContext().env` for bindings); in a plain Worker, use the `env` argument instead.

## Event format

Newline-delimited JSON, one event per line:

```ts
export type AssistantEvent =
  | { type: "text"; text: string }          // a piece of the answer, as it streams
  | { type: "sources"; sources: Source[] }   // after the answer: what it cited
  | { type: "error"; message: string }       // something failed mid-stream
  | { type: "done" };
```

NDJSON is easier to produce and parse than server-sent events, works with `fetch` and a `ReadableStream`, and needs no special headers beyond `Content-Type: application/x-ndjson`.

## Route

```ts
import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const SESSION_COOKIE = "assistant-session";
const MAX_TOKENS = 4096; // thinking tokens count too, so leave headroom
const encoder = new TextEncoder();
const line = (event: AssistantEvent) => encoder.encode(`${JSON.stringify(event)}\n`);
const failure = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const { AI, SEARCH, ASSISTANT_RATE_LIMITER } = getCloudflareContext().env;
  const sessionSecret = process.env.ASSISTANT_SESSION_SECRET;

  if (!AI || !SEARCH || !sessionSecret) {
    return failure("The assistant isn't available right now.", 503);
  }

  const body = await request.json().catch(() => null);
  const parsed = parseConversation(body); // roles, count and length limits

  if ("error" in parsed) {
    return failure(parsed.error, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

  if (!(await ASSISTANT_RATE_LIMITER.limit({ key: ip })).success) {
    return failure("That's a lot of questions in a short time. Try again in a minute.", 429);
  }

  const cookieStore = await cookies();
  let newSession: string | null = null;

  if (!(await isValidSession(cookieStore.get(SESSION_COOKIE)?.value, sessionSecret))) {
    if (!(await verifyTurnstile(body?.turnstileToken, ip))) {
      return failure("Please complete the human check.", 403);
    }

    newSession = await createSession(sessionSecret);
  }

  const messages = parsed.messages.map((message) =>
    message.role === "assistant" ? { ...message, content: stripCitations(message.content) } : message,
  );
  const chunks = await retrieve(SEARCH, messages); // see retrieval-and-citations.md
  const { sources, context } = buildContext(chunks);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Called even with no sources, so greetings get a real reply.
        const reply = await AI.run(
          "anthropic/claude-sonnet-4-5", // any model AI Gateway routes; check the model catalogue
          { system: systemPrompt(context), messages, max_tokens: MAX_TOKENS, stream: true },
          { gateway: { id: "default" } },
        );
        let answer = "";

        for await (const delta of textDeltas(reply as ReadableStream<Uint8Array>)) {
          if (delta.type === "text") {
            answer += delta.text;
            controller.enqueue(line({ type: "text", text: delta.text }));
          } else {
            controller.enqueue(line({ type: "text", text: "\n\n(I ran out of room. Ask me to carry on.)" }));
          }
        }

        controller.enqueue(line({ type: "sources", sources: citedSources(answer, sources) }));
        controller.enqueue(line({ type: "done" }));
      } catch {
        controller.enqueue(line({ type: "error", message: "Something went wrong answering that. Try again." }));
      } finally {
        controller.close();
      }
    },
  });

  const response = new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });

  if (newSession) {
    response.headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=${newSession}; Path=/api/assistant; Max-Age=3600; HttpOnly; Secure; SameSite=Strict`,
    );
  }

  return response;
}
```

Turnstile tokens are single-use. Verify on the server with Siteverify, and remount the widget on the client after each attempt.

## Signed session

No database needed: an expiry time and its HMAC.

```ts
const encoder = new TextEncoder();

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return btoa(String.fromCharCode(...signature)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c] ?? "");
}

export async function createSession(secret: string, now = Date.now()) {
  const expires = String(Math.floor(now / 1000) + 3600);
  return `${expires}.${await sign(expires, secret)}`;
}

export async function isValidSession(token: string | undefined, secret: string, now = Date.now()) {
  const [expires, signature] = token?.split(".") ?? [];
  return Boolean(expires && signature && Number(expires) * 1000 >= now && signature === (await sign(expires, secret)));
}
```

## Parsing the model's stream

The `AI` binding returns server-sent events whose shape depends on the provider. Accept all three:

```ts
export type StreamDelta = { type: "text"; text: string } | { type: "cut-off" };

function textFrom(event: any): string {
  if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
    return event.delta.text ?? ""; // Anthropic
  }

  return event?.choices?.[0]?.delta?.content ?? (typeof event?.response === "string" ? event.response : ""); // OpenAI-style, Workers AI
}

function hitTokenLimit(event: any): boolean {
  return (
    (event?.type === "message_delta" && event.delta?.stop_reason === "max_tokens") ||
    event?.choices?.[0]?.finish_reason === "length"
  );
}

export async function* textDeltas(stream: ReadableStream<Uint8Array>): AsyncGenerator<StreamDelta> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");

    for (const line of lines) {
      const payload = line.startsWith("data:") ? line.slice(5).trim() : "";

      if (!payload || payload === "[DONE]") {
        continue;
      }

      let event: unknown;

      try {
        event = JSON.parse(payload);
      } catch {
        continue; // keep-alives and partial frames
      }

      const text = textFrom(event);

      if (text) {
        yield { type: "text", text };
      }

      if (hitTokenLimit(event)) {
        yield { type: "cut-off" };
      }
    }

    if (done) {
      return;
    }
  }
}
```

Test it with recorded streams from each provider, including one split mid-line across chunks.

## Reading it in the browser

```ts
const response = await fetch("/api/assistant", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages, turnstileToken }),
});

if (!response.ok || !response.body) {
  const { error } = await response.json().catch(() => ({ error: "Something went wrong." }));
  return showError(error);
}

const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
let buffer = "";

for (;;) {
  const { done, value } = await reader.read();
  buffer += value ?? "";
  const lines = buffer.split("\n");
  buffer = done ? "" : (lines.pop() ?? "");

  for (const raw of lines.filter(Boolean)) {
    const event = JSON.parse(raw) as AssistantEvent;

    if (event.type === "text") appendToAnswer(event.text);
    if (event.type === "sources") showSources(event.sources);
    if (event.type === "error") showError(event.message);
  }

  if (done) break;
}
```

Render the answer as Markdown with citation markers stripped (`stripCitations`), and mark the reply region `aria-live="polite"` with `role="log"` so screen readers hear it as it arrives.
