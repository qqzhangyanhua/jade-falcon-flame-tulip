import type { BriefIntent } from "../types.ts";
import { chatJson, type ChatOptions } from "./chat.ts";

export { chatJson } from "./chat.ts";
export type { ChatError, ChatFetch, ChatJsonResult, ChatOptions } from "./chat.ts";

const PARSE_BRIEF_MAX_TOKENS = 500;

export async function parseBrief(brief: string, opts?: ChatOptions): Promise<BriefIntent> {
  const res = await chatJson({
    ...opts,
    maxTokens: PARSE_BRIEF_MAX_TOKENS,
    prompt: `Extract a product visual brief from this Chinese/English description. JSON keys: productName, category, audience, platform ("app"|"web"), mood (2 short english words), forbidden (up to 3 english style words to avoid).\nText: ${brief}`,
  });
  const parsed = (res.ok ? res.value : null) as Partial<BriefIntent> | null;
  return {
    productName: parsed?.productName || brief.slice(0, 20) || "未命名产品",
    category: parsed?.category || "product",
    audience: parsed?.audience || "general",
    platform: parsed?.platform === "web" ? "web" : "app",
    mood: parsed?.mood?.length ? parsed.mood : ["clear", "modern"],
    forbidden: parsed?.forbidden ?? [],
  };
}
