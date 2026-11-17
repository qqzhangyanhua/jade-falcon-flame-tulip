// Client-safe: imported by browser components, so it must never reach chat.ts (which reads
// the xAI key) at runtime. Type-only imports from it are erased and fine.
import { z } from "zod";
import { PRESETS } from "../presets.ts";
import type { StyleDna } from "../project/dna.ts";
import type { BriefIntent } from "../types.ts";
import type { ChatError } from "./chat.ts";

export type MergeError = ChatError | "invalid_schema" | "renamed" | "no_change";

export type TailoredDirection = { presetId: string; dna: StyleDna };

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

export function hasValidColors(dna: StyleDna): boolean {
  return Object.values(dna.colors).every(isHexColor);
}

/** Intent text comes from a model reply, so list entries are not guaranteed to be strings. */
function union(...lists: unknown[]): string[] {
  const items = lists.flatMap((list) => (Array.isArray(list) ? list : []));
  const texts = items.filter((item): item is string => typeof item === "string");
  return [...new Set(texts.map((item) => item.trim()).filter(Boolean))];
}

export function withUserIntent(dna: StyleDna, intent: BriefIntent, mergeMood: boolean): StyleDna {
  return {
    ...dna,
    mood: mergeMood ? union(dna.mood, intent.mood) : dna.mood,
    forbidden: union(dna.forbidden, intent.forbidden),
  };
}

/** Each preset with the user's mood and forbidden styles merged in; what tailoring falls back to. */
export function presetDirections(intent: BriefIntent): TailoredDirection[] {
  return PRESETS.map((p) => ({ presetId: p.id, dna: withUserIntent(p.dna, intent, true) }));
}

export const INTENT_TEXT_MAX = 200;
export const INTENT_LIST_MAX = 12;
const shortText = z.string().max(INTENT_TEXT_MAX);

/** Shape accepted from the browser before it is spent on a model call. */
export const briefIntentInputSchema = z.object({
  productName: shortText,
  category: shortText,
  audience: shortText,
  platform: z.enum(["app", "web"]),
  mood: z.array(shortText).max(INTENT_LIST_MAX),
  forbidden: z.array(shortText).max(INTENT_LIST_MAX),
});

export function messageForMergeError(error: MergeError): string {
  switch (error) {
    case "no_key":
    case "upstream":
    case "network":
      return "暂时无法合并风格修改，请稍后重试";
    case "unparseable":
    case "invalid_schema":
      return "模型返回的风格不合格，没有写回。换个说法再试一次";
    case "renamed":
      return "模型擅自改了风格名称，没有写回。换个说法再试一次";
    case "no_change":
      return "这条指令没有改动任何风格字段，没有写回。说得具体一些再试";
  }
}
