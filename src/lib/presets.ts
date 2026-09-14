import type { StyleDna } from "./types";

export type Preset = {
  id: string;
  dna: StyleDna;
};

export const PRESETS: Preset[] = [
  {
    id: "paper",
    dna: {
      name: "纸上留白",
      oneLiner: "浅色、疏朗、适合产品和品牌共用的克制气质",
      colors: {
        bg: "#F6F3EE",
        surface: "#FFFFFF",
        text: "#1A1916",
        muted: "#7A756C",
        primary: "#1F3A5F",
        accent: "#C45C2A",
      },
      light: "studio-soft",
      material: "flat-paper",
      geometry: "rounded-comfortable",
      density: "airy",
      typeMood: "editorial-sans",
      mood: ["calm", "clear"],
      forbidden: ["neon", "cyberpunk", "clutter", "heavy-gradient"],
      promptPositive:
        "quiet editorial product design, warm off-white paper, generous whitespace, navy ink accent, restrained photography, Swiss-inspired layout",
      promptNegative:
        "neon, cyberpunk, cluttered widgets, skeuomorphism, rainbow gradient, comic illustration",
    },
  },
  {
    id: "ledger",
    dna: {
      name: "账本商务",
      oneLiner: "冷静、可信、适合工具型产品和 B 端气质",
      colors: {
        bg: "#F3F5F7",
        surface: "#FFFFFF",
        text: "#1C242C",
        muted: "#66707A",
        primary: "#2457D6",
        accent: "#0E7C66",
      },
      light: "even-daylight",
      material: "flat",
      geometry: "sharp",
      density: "comfortable",
      typeMood: "geometric-sans",
      mood: ["trustworthy", "precise"],
      forbidden: ["playful-illustration", "neon", "ornate-serif"],
      promptPositive:
        "clean enterprise SaaS, cool gray canvas, precise blue accent, hairline borders, functional photography, IBM-like utility",
      promptNegative: "neon, candy colors, skeuomorphism, gaming HUD, graffiti",
    },
  },
  {
    id: "atelier",
    dna: {
      name: "暖工作室",
      oneLiner: "奶油底、圆角亲和、带一点手工质感",
      colors: {
        bg: "#F3EBE1",
        surface: "#FFF8F1",
        text: "#2A2118",
        muted: "#8A7460",
        primary: "#8C3A22",
        accent: "#2F6B4F",
      },
      light: "window-warm",
      material: "tactile-paper",
      geometry: "soft",
      density: "comfortable",
      typeMood: "humanist-sans",
      mood: ["warm", "approachable"],
      forbidden: ["cold-steel", "neon", "dense-dashboard"],
      promptPositive:
        "warm atelier brand, cream paper, terracotta and forest accents, soft rounded UI, tactile print textures, lifestyle still life",
      promptNegative: "cold fluorescent, cyberpunk, harsh black, stock handshake photo",
    },
  },
  {
    id: "nocturne",
    dna: {
      name: "夜场片场",
      oneLiner: "深色、电影光、偏高端沉浸",
      colors: {
        bg: "#0E1014",
        surface: "#171B22",
        text: "#E8E4DC",
        muted: "#8B9098",
        primary: "#D9C7A3",
        accent: "#6EA8FF",
      },
      light: "film-key",
      material: "soft-matte",
      geometry: "rounded-comfortable",
      density: "comfortable",
      typeMood: "display-serif-mix",
      mood: ["cinematic", "quiet-luxury"],
      forbidden: ["bright-pastel", "comic", "busy-memphis"],
      promptPositive:
        "cinematic dark brand studio, charcoal surfaces, champagne type, cool rim light, luxury product still, restrained UI on dark",
      promptNegative: "flat cartoon, neon vaporwave, cluttered dashboard, daylight stock photo",
    },
  },
];

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}
