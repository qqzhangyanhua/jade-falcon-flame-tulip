import type { Slot } from "./project/schema.ts";

export {
  adoptedRev,
  currentDna,
  emptyAsset,
  emptyAssets,
} from "./project/schema.ts";
export type {
  Asset,
  BriefIntent,
  Candidate,
  ImageRev,
  Project,
  Slot,
  StyleBranch,
  StyleDna,
  StyleRevRecord,
} from "./project/schema.ts";

export const SLOTS: { id: Slot; label: string; hint: string }[] = [
  { id: "ui_hero", label: "产品旗舰页", hint: "有原型则保结构" },
  { id: "kv", label: "品牌主视觉", hint: "KV / 海报" },
  { id: "web_home", label: "官网首屏", hint: "延展页" },
];

export type ProfileRecord = {
  displayName: string;
  title: string;
  bio: string;
  updatedAt: string | null;
};
