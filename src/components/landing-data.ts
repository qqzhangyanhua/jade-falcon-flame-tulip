import type { CSSProperties } from "react";

export const SHOT = {
  key: { width: 1120, height: 1400 },
  product: { width: 1400, height: 1400 },
  hero: { width: 1400, height: 933 },
} as const;

export const SLOTS = [
  { id: "key", label: "主视觉" },
  { id: "product", label: "产品图" },
  { id: "hero", label: "官网首屏" },
] as const;

export type SlotId = (typeof SLOTS)[number]["id"];

export const CASES = [
  {
    id: "atelier",
    name: "Atelier",
    zh: "暖工作室",
    brand: "手作陶器工作室",
    palette: ["#efe6d6", "#d9b48a", "#b4552f", "#4a2e1c"],
    dna: ["晨光侧光", "哑光陶 · 亚麻", "大面积留白", "安静 · 手作"],
    rows: [
      ["光线", "晨光侧光，长而柔的影子"],
      ["材质", "哑光陶 · 亚麻 · 原木"],
      ["构图", "大面积留白，主体偏下"],
      ["禁用", "高饱和 · 霓虹 · 塑料感"],
    ],
  },
  {
    id: "ledger",
    name: "Ledger",
    zh: "账本商务",
    brand: "金融科技产品",
    palette: ["#dce7e4", "#f4f3ef", "#134a52", "#b39256"],
    dna: ["均匀冷光", "磨砂玻璃 · 纸", "严格网格", "可信 · 克制"],
    rows: [
      ["光线", "均匀冷光，影子短而清晰"],
      ["材质", "磨砂玻璃 · 哑光纸 · 拉丝铜"],
      ["构图", "严格网格，层层堆叠"],
      ["禁用", "暖色滤镜 · 手绘感 · 杂乱"],
    ],
  },
  {
    id: "nocturne",
    name: "Nocturne",
    zh: "夜场片场",
    brand: "夜间香氛品牌",
    palette: ["#16111f", "#2a1f3d", "#6b4e9b", "#e3a85c"],
    dna: ["顶部聚光", "烟熏玻璃 · 丝绒", "低调电影感", "神秘 · 感性"],
    rows: [
      ["光线", "顶部单束聚光，轮廓光"],
      ["材质", "烟熏玻璃 · 丝绒 · 液体反光"],
      ["构图", "低调暗场，主体居中"],
      ["禁用", "平光 · 明亮底色 · 卡通感"],
    ],
  },
] as const;

export type CaseItem = (typeof CASES)[number];
export type CaseId = CaseItem["id"];

export function shot(caseId: CaseId, slot: SlotId) {
  return { src: `/landing/${caseId}-${slot}.jpg`, ...SHOT[slot] };
}

/** Feeds the `--i` stagger index read by the landing animations in globals.css. */
export function order(i: number): CSSProperties {
  return { "--i": i } as CSSProperties;
}
