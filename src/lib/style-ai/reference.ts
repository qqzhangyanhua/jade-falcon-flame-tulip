import { styleDnaSchema, type StyleDna } from "../project/dna.ts";
import type { BriefIntent } from "../types.ts";
import type { ChatError, ChatFetch, ChatOptions } from "./chat.ts";
import { hasValidColors, withUserIntent } from "./shared.ts";

export type ReferenceDirectionError = ChatError | "invalid_image";

export type ReferenceDirectionResult =
  { ok: true; dna: StyleDna } | { ok: false; error: ReferenceDirectionError };

const CHAT_MODEL = "grok-4.5";
const CHAT_URL = "https://api.x.ai/v1/chat/completions";
const REFERENCE_MAX_TOKENS = 4000;

type ChatBody = Record<string, unknown>;

function sniffJpegPng(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

function imageBytes(image: Uint8Array | string): Uint8Array | null {
  if (typeof image !== "string") return image.byteLength > 0 ? image : null;
  const match = /^data:[^;,]*;base64,([A-Za-z0-9+/]*={0,2})$/i.exec(image);
  if (!match?.[1]) return null;
  const bytes = Uint8Array.from(Buffer.from(match[1], "base64"));
  return bytes.byteLength > 0 ? bytes : null;
}

/** Jpeg/png only. A non-image, or any other format, never becomes a data URL. */
function referenceDataUrls(images: readonly (Uint8Array | string)[]): string[] | null {
  if (images.length === 0) return null;
  const urls: string[] = [];
  for (const image of images) {
    const bytes = imageBytes(image);
    const type = bytes ? sniffJpegPng(bytes) : null;
    if (!bytes || !type) return null;
    urls.push(`data:${type};base64,${Buffer.from(bytes).toString("base64")}`);
  }
  return urls;
}

function referencePrompt(intent: BriefIntent): string {
  return [
    "You are a brand art director. The attached reference images are the visual direction the user wants.",
    "Distill ONE style DNA that captures their shared palette, light, material, geometry, density and type mood.",
    "Colors must be 6-digit hex values like #1F3A5F. Never use any style listed in the brief's forbidden list.",
    "Reply with one JSON object whose keys are exactly: name, oneLiner, colors {bg, surface, text, muted, primary, accent}, light, material, geometry, density, typeMood, mood (string array), forbidden (string array), promptPositive, promptNegative.",
    `Brief: ${JSON.stringify(intent)}`,
  ].join("\n");
}

function requestBody(prompt: string, urls: string[], jsonMode: boolean): ChatBody {
  const body: ChatBody = {
    model: CHAT_MODEL,
    temperature: 0.3,
    max_tokens: REFERENCE_MAX_TOKENS,
    messages: [
      { role: "system", content: "Return only valid JSON. No markdown." },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...urls.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      },
    ],
  };
  if (jsonMode) body.response_format = { type: "json_object" };
  return body;
}

async function postChat(
  body: ChatBody,
  opts: ChatOptions | undefined,
): Promise<{ ok: true; content: string } | { ok: false; error: ChatError }> {
  const apiKey = (opts?.apiKey ?? process.env.XAI_API_KEY ?? "").trim();
  if (!apiKey) return { ok: false, error: "no_key" };
  const fetchImpl = opts?.fetchImpl ?? (fetch as ChatFetch);
  try {
    const res = await fetchImpl(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: "upstream" };
    const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { ok: true, content: payload.choices?.[0]?.message?.content ?? "" };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** First `{...}` in prose, respecting strings so braces inside a value do not end the object. */
function extractFirstJsonObject(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i] ?? "";
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function readDna(text: string, intent: BriefIntent, embedded: boolean): ReferenceDirectionResult {
  let value: unknown;
  if (embedded) {
    value = extractFirstJsonObject(text);
    if (value == null) return { ok: false, error: "unparseable" };
  } else {
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, error: "unparseable" };
    }
  }
  const parsed = styleDnaSchema.safeParse(value);
  if (!parsed.success || !hasValidColors(parsed.data)) return { ok: false, error: "unparseable" };
  return { ok: true, dna: withUserIntent(parsed.data, intent, false) };
}

/**
 * Distills one style DNA from reference images. Images are bytes or data URLs;
 * this module does not read the blob store and does not start an image job.
 * `json_object` is sometimes rejected together with images, so that failure retries
 * once as plain text and keeps the first JSON object.
 */
export async function referenceDirection(
  images: readonly (Uint8Array | string)[],
  intent: BriefIntent,
  opts?: ChatOptions,
): Promise<ReferenceDirectionResult> {
  const urls = referenceDataUrls(images);
  if (!urls) return { ok: false, error: "invalid_image" };

  const prompt = referencePrompt(intent);
  const first = await postChat(requestBody(prompt, urls, true), opts);
  if (first.ok) return readDna(first.content, intent, false);
  if (first.error !== "upstream") return first;

  const second = await postChat(requestBody(prompt, urls, false), opts);
  if (!second.ok) return second;
  return readDna(second.content, intent, true);
}
