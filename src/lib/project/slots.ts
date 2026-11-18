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
  {
    id: "app_icon",
    name: "App 图标",
    aspect: "1:1",
    purpose: "方形应用图标，居中图形符号，不要做成海报",
    promptTemplate:
      'Square app icon for "{product}", one centered graphic symbol on a plain field, simple and iconic, not a poster, not a screenshot, not a layout of text.',
  },
  {
    id: "xhs_cover",
    name: "小红书封面",
    aspect: "3:4",
    purpose: "小红书笔记封面，竖版，标题清楚",
    promptTemplate:
      'Vertical Xiaohongshu note cover for "{product}", 3:4, a clear title in large type, editorial cover, not a square icon.',
  },
  {
    id: "wechat_header",
    name: "公众号头图",
    aspect: "21:9",
    purpose: "公众号文章头图，超宽横幅",
    promptTemplate:
      'Ultra-wide WeChat official-account header for "{product}", 21:9, one subject and a readable headline area, not a poster.',
  },
  {
    id: "banner",
    name: "横幅 Banner",
    aspect: "5:2",
    purpose: "横幅 Banner，宽幅品牌或活动条",
    promptTemplate:
      'A wide brand or campaign banner for "{product}", 5:2 horizontal strip, one short message, not a poster and not a full page.',
  },
  {
    id: "poster",
    name: "竖版海报",
    aspect: "2:3",
    purpose: "竖版海报，适合打印张贴",
    promptTemplate:
      'A vertical print poster for "{product}", 2:3, meant to be posted on a wall, one hero subject and a clear headline.',
  },
  {
    id: "namecard",
    name: "名片",
    aspect: "3:2",
    purpose: "横版名片，姓名和联系方式位置清楚",
    promptTemplate:
      'Horizontal business card for "{product}", 3:2, with a clear place for the name and contact details, not a poster.',
  },
  {
    id: "ppt_cover",
    name: "PPT 封面",
    aspect: "16:9",
    purpose: "演示文稿封面，标题明确，留白干净",
    promptTemplate:
      'A presentation cover slide for "{product}", 16:9, an explicit title and generous whitespace, not a dense poster.',
  },
  {
    id: "empty_state",
    name: "空状态插画",
    aspect: "4:3",
    purpose: "空状态插画，元素少，说明暂时没有内容",
    promptTemplate:
      'An empty-state illustration for "{product}", 4:3, few elements, showing that nothing is here yet, not a campaign poster.',
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
