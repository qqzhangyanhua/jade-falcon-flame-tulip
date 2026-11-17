import type { BriefIntent } from "../types.ts";
import { chatJson, type ChatOptions } from "./chat.ts";
import { INTENT_LIST_MAX, INTENT_TEXT_MAX } from "./shared.ts";

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
  const mood = cleanList(parsed?.mood);
  return {
    productName: cleanText(parsed?.productName) || brief.slice(0, 20) || "未命名产品",
    category: cleanText(parsed?.category) || "product",
    audience: cleanText(parsed?.audience) || "general",
    platform: parsed?.platform === "web" ? "web" : "app",
    mood: mood.length ? mood : ["clear", "modern"],
    forbidden: cleanList(parsed?.forbidden),
  };
}

// Model output is untrusted: the intent is sent back to tailoring, which caps text and list sizes.
function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, INTENT_TEXT_MAX) : "";
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean).slice(0, INTENT_LIST_MAX);
}

export { mergeInstruction } from "./merge.ts";
export { messageForMergeError } from "./shared.ts";
export type { MergeError, MergeResult } from "./merge.ts";
export { tailorDirections } from "./tailor.ts";
export type { TailoredDirection } from "./tailor.ts";
