import { createServerFn } from "@tanstack/react-start";
import type { BriefIntent } from "./types";

const CHAT_MODEL = "grok-4.5";

function key(): string | undefined {
  return process.env.XAI_API_KEY?.trim() || undefined;
}

async function chatJson(prompt: string): Promise<unknown> {
  const apiKey = key();
  if (!apiKey) return null;
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only valid JSON. No markdown." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const parseBrief = createServerFn({ method: "POST" })
  .validator((input: { brief: string }) => input)
  .handler(async ({ data }): Promise<BriefIntent> => {
    const parsed = (await chatJson(
      `Extract a product visual brief from this Chinese/English description. JSON keys: productName, category, audience, platform ("app"|"web"), mood (2 short english words), forbidden (up to 3 english style words to avoid).\nText: ${data.brief}`,
    )) as Partial<BriefIntent> | null;
    return {
      productName: parsed?.productName || data.brief.slice(0, 20) || "未命名产品",
      category: parsed?.category || "product",
      audience: parsed?.audience || "general",
      platform: parsed?.platform === "web" ? "web" : "app",
      mood: parsed?.mood?.length ? parsed.mood : ["clear", "modern"],
      forbidden: parsed?.forbidden ?? [],
    };
  });

export {
  composeImageFn,
  generateCandidate,
  generateSlotFn,
  tuneImageFn,
} from "./image-jobs/functions.ts";
