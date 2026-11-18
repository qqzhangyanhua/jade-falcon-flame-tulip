/** Aspects the image service accepts. `auto` is not one of them. */
export const SUPPORTED_ASPECTS = [
  "1:1",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
  "2:3",
  "3:2",
  "9:19.5",
  "19.5:9",
  "9:20",
  "20:9",
  "1:2",
  "2:1",
  "21:9",
  "5:2",
] as const;

export type SlotAspect = (typeof SUPPORTED_ASPECTS)[number];

export type BuiltinSlot = {
  id: string;
  name: string;
  aspect: SlotAspect;
  purpose: string;
  /** Slot-specific lead of `slotPrompt`. `{product}` is the product name. */
  promptTemplate: string;
};

export const BUILTIN_SLOTS: readonly BuiltinSlot[] = [
  {
    id: "ui_hero",
    name: "产品旗舰页",
    aspect: "9:16",
    purpose: "有原型则保结构",
    promptTemplate:
      'High-fidelity mobile app UI screenshot of "{product}" flagship home screen, full-bleed interface, realistic iOS/Android UI, readable Chinese or English UI copy, not a poster.',
  },
  {
    id: "kv",
    name: "品牌主视觉",
    aspect: "16:9",
    purpose: "KV / 海报",
    promptTemplate:
      'Brand key visual poster for "{product}", cinematic still, large refined typography, one hero subject, campaign-quality, 16:9.',
  },
  {
    id: "web_home",
    name: "官网首屏",
    aspect: "16:9",
    purpose: "延展页",
    promptTemplate:
      'Website homepage hero, 16:9 desktop screenshot of "{product}" marketing site, navigation, headline, CTA, hero image, realistic web UI.',
  },
];

/** Built-in ids, catalog order. Not a second handwritten list. */
export const SLOT_IDS: readonly string[] = BUILTIN_SLOTS.map((slot) => slot.id);

/** Old documents and new projects enable these until a later ticket shows more. */
export const DEFAULT_ENABLED_SLOT_IDS: readonly string[] = ["ui_hero", "kv", "web_home"];

/** Direction candidates are not a slot; their frame stays 16:9. */
export const DIRECTION_ASPECT = "16:9";

export function builtinSlot(id: string): BuiltinSlot | undefined {
  return BUILTIN_SLOTS.find((slot) => slot.id === id);
}

export function catalogAspect(id: string): string | undefined {
  return builtinSlot(id)?.aspect;
}

export type SlotPromptMeta = { id: string; name: string; aspect: string; purpose: string };

/** Catalog name, aspect and purpose. An unknown id keeps its id as the name. */
export function slotPromptMetas(ids: readonly string[]): SlotPromptMeta[] {
  return ids.map((id) => {
    const slot = builtinSlot(id);
    if (!slot) return { id, name: id, aspect: "1:1", purpose: "" };
    return { id: slot.id, name: slot.name, aspect: slot.aspect, purpose: slot.purpose };
  });
}
