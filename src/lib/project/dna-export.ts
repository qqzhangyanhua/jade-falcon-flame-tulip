import type { StyleDna } from "./dna.ts";
import { adoptedRev, currentDna, type StyleBranch } from "./schema.ts";

export type RgbPixel = { r: number; g: number; b: number };

/** Geometry, density and type mood → radius, spacing and font. Unknown values use `default`. */
export const DESIGN_TOKEN_TABLE = {
  geometry: {
    sharp: "0px",
    soft: "12px",
    "rounded-comfortable": "16px",
    default: "8px",
  },
  density: {
    airy: "24px",
    compact: "8px",
    comfortable: "16px",
    default: "16px",
  },
  typeMood: {
    "editorial-sans": '"Source Sans 3", "Segoe UI", sans-serif',
    "geometric-sans": '"Avenir Next", "Century Gothic", sans-serif',
    "humanist-sans": '"Gill Sans", "Trebuchet MS", sans-serif',
    "display-serif-mix": '"Fraunces", "Iowan Old Style", serif',
    default: "system-ui, sans-serif",
  },
} as const;

export function radiusForGeometry(geometry: string): string {
  if (geometry === "sharp" || geometry === "soft" || geometry === "rounded-comfortable") {
    return DESIGN_TOKEN_TABLE.geometry[geometry];
  }
  return DESIGN_TOKEN_TABLE.geometry.default;
}

export function spacingForDensity(density: string): string {
  if (density === "airy" || density === "compact" || density === "comfortable") {
    return DESIGN_TOKEN_TABLE.density[density];
  }
  return DESIGN_TOKEN_TABLE.density.default;
}

export function fontFamilyForTypeMood(typeMood: string): string {
  if (
    typeMood === "editorial-sans" ||
    typeMood === "geometric-sans" ||
    typeMood === "humanist-sans" ||
    typeMood === "display-serif-mix"
  ) {
    return DESIGN_TOKEN_TABLE.typeMood[typeMood];
  }
  return DESIGN_TOKEN_TABLE.typeMood.default;
}

export type DesignTokens = { css: string; tailwind: string; w3c: string };

function cssDeclarations(dna: StyleDna): string {
  const { bg, surface, text, muted, primary, accent } = dna.colors;
  return [
    `--color-bg: ${bg};`,
    `--color-surface: ${surface};`,
    `--color-text: ${text};`,
    `--color-muted: ${muted};`,
    `--color-primary: ${primary};`,
    `--color-accent: ${accent};`,
    `--radius: ${radiusForGeometry(dna.geometry)};`,
    `--spacing: ${spacingForDensity(dna.density)};`,
    `--font-family: ${fontFamilyForTypeMood(dna.typeMood)};`,
  ]
    .map((line) => `  ${line}`)
    .join("\n");
}

/** CSS custom properties, a Tailwind v4 `@theme` block, and W3C design tokens. */
export function designTokens(dna: StyleDna): DesignTokens {
  const declarations = cssDeclarations(dna);
  const w3c = {
    color: {
      bg: { $type: "color", $value: dna.colors.bg },
      surface: { $type: "color", $value: dna.colors.surface },
      text: { $type: "color", $value: dna.colors.text },
      muted: { $type: "color", $value: dna.colors.muted },
      primary: { $type: "color", $value: dna.colors.primary },
      accent: { $type: "color", $value: dna.colors.accent },
    },
    radius: { $type: "dimension", $value: radiusForGeometry(dna.geometry) },
    spacing: { $type: "dimension", $value: spacingForDensity(dna.density) },
    fontFamily: { $type: "fontFamily", $value: fontFamilyForTypeMood(dna.typeMood) },
  };
  return {
    css: `:root {\n${declarations}\n}\n`,
    tailwind: `@theme {\n${declarations}\n}\n`,
    w3c: `${JSON.stringify(w3c, null, 2)}\n`,
  };
}

export type PromptSlot = { id: string; name: string; aspect: string; purpose: string };

export type SlotPromptPack = {
  id: string;
  name: string;
  midjourney: string;
  sdFlux: { positive: string; negative: string };
  plain: string;
};

function avoidList(dna: StyleDna): string {
  const parts: string[] = [];
  for (const item of dna.forbidden) {
    const trimmed = item.trim();
    if (trimmed) parts.push(trimmed);
  }
  const negative = dna.promptNegative.trim();
  if (negative) parts.push(negative);
  return parts.join(", ");
}

function slotPromptBody(dna: StyleDna, slot: PromptSlot, product: string): string {
  const lead = slot.purpose.trim()
    ? `${slot.name} for "${product}", ${slot.purpose.trim()}.`
    : `${slot.name} for "${product}".`;
  const mood = dna.mood.map((word) => word.trim()).filter(Boolean);
  return [
    lead,
    `Visual system: ${dna.promptPositive}.`,
    `Palette: bg ${dna.colors.bg}, surface ${dna.colors.surface}, text ${dna.colors.text}, muted ${dna.colors.muted}, primary ${dna.colors.primary}, accent ${dna.colors.accent}.`,
    `Lighting ${dna.light}, material ${dna.material}, density ${dna.density}, geometry ${dna.geometry}, type ${dna.typeMood}.`,
    ...(mood.length > 0 ? [`Mood: ${mood.join(", ")}.`] : []),
  ].join(" ");
}

function plainLanguage(dna: StyleDna, slot: PromptSlot, product: string, avoid: string): string {
  const mood = dna.mood
    .map((word) => word.trim())
    .filter(Boolean)
    .join("、");
  const avoidText = avoid ? `不要出现：${avoid.replaceAll(", ", "、")}。` : "没有额外的禁用风格。";
  return [
    `请为「${product}」做一张${slot.name}，用途是 ${slot.purpose}，画面比例 ${slot.aspect}。`,
    `沿用风格「${dna.name}」（${dna.oneLiner}）：${dna.promptPositive}。`,
    `背景色 ${dna.colors.bg}，表面色 ${dna.colors.surface}，文字色 ${dna.colors.text}，次要色 ${dna.colors.muted}，主色 ${dna.colors.primary}，强调色 ${dna.colors.accent}。`,
    `光线为 ${dna.light}，材质为 ${dna.material}，几何为 ${dna.geometry}，密度为 ${dna.density}，字体气质为 ${dna.typeMood}。`,
    `情绪是${mood}。`,
    avoidText,
  ].join("");
}

/** Midjourney, SD/Flux and plain-language prompts for each slot. No model call. */
export function promptPack(
  dna: StyleDna,
  slots: readonly PromptSlot[],
  product: string,
): SlotPromptPack[] {
  return slots.map((slot) => {
    const positive = slotPromptBody(dna, slot, product);
    const negative = avoidList(dna);
    return {
      id: slot.id,
      name: slot.name,
      midjourney: `${positive} --ar ${slot.aspect} --no ${negative}`.trimEnd(),
      sdFlux: { positive, negative },
      plain: plainLanguage(dna, slot, product, negative),
    };
  });
}

export function formatPromptPack(pack: SlotPromptPack): string {
  return [
    `## ${pack.name}`,
    "",
    "### Midjourney",
    "",
    pack.midjourney,
    "",
    "### SD / Flux",
    "",
    "正向：",
    pack.sdFlux.positive,
    "",
    "负向：",
    pack.sdFlux.negative,
    "",
    "### 自然语言",
    "",
    pack.plain,
    "",
  ].join("\n");
}

/** `prompts.md` for the viewed style rev. */
export function promptsMarkdown(
  product: string,
  styleName: string,
  packs: readonly SlotPromptPack[],
): string {
  return `# ${product} · ${styleName}\n\n${packs.map(formatPromptPack).join("\n")}`;
}

// Hand-checked against these literals (not the longer CIE fractions). ΔE 10 is
// the published boundary: #e3e3e3 hits white, #e2e2e2 misses.
const MATCH_DELTA_E = 10;

type Lab = { L: number; a: number; b: number };

function srgbChannelToLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function labOf(pixel: RgbPixel): Lab {
  const r = srgbChannelToLinear(pixel.r);
  const g = srgbChannelToLinear(pixel.g);
  const b = srgbChannelToLinear(pixel.b);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function deltaE(left: Lab, right: Lab): number {
  return Math.hypot(left.L - right.L, left.a - right.a, left.b - right.b);
}

function parseHex(hex: string): RgbPixel | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match?.[1]) return null;
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

const PALETTE_ROLES = ["bg", "surface", "text", "muted", "primary", "accent"] as const;

export type BrandGuideSwatch = {
  role: (typeof PALETTE_ROLES)[number];
  hex: string;
};

/** One slot that has an image: the adopted rev, otherwise the latest. */
export type BrandGuideSlot = {
  id: string;
  name: string;
  aspect: string;
  purpose: string;
  url: string;
  revId: string;
};

export type BrandGuide = {
  palette: BrandGuideSwatch[];
  typeMood: string;
  fontFamily: string;
  geometry: string;
  density: string;
  radius: string;
  spacing: string;
  mood: string[];
  forbidden: string[];
  dos: string[];
  donts: string[];
  slots: BrandGuideSlot[];
};

/**
 * Page data for one style line's viewed rev. Do and don't lines come only from
 * mood, type mood, geometry, density and forbidden styles. No model call.
 */
export function brandGuideModel(styleLine: StyleBranch, slots: readonly PromptSlot[]): BrandGuide {
  const dna = currentDna(styleLine);
  const mood = [...dna.mood];
  const forbidden = [...dna.forbidden];
  const dos = [
    ...(mood.length > 0 ? [`情绪保持：${mood.join("、")}`] : []),
    `字体气质：${dna.typeMood}`,
    `几何与密度：${dna.geometry} / ${dna.density}`,
  ];
  const donts =
    forbidden.length > 0 ? forbidden.map((item) => `避免${item}`) : ["不要偏离这份风格 DNA 的色板"];
  const shown: BrandGuideSlot[] = [];
  for (const slot of slots) {
    const asset = styleLine.assets[slot.id];
    if (!asset) continue;
    const rev = adoptedRev(asset);
    if (!rev) continue;
    shown.push({
      id: slot.id,
      name: slot.name,
      aspect: slot.aspect,
      purpose: slot.purpose,
      url: rev.url,
      revId: rev.id,
    });
  }
  return {
    palette: PALETTE_ROLES.map((role) => ({ role, hex: dna.colors[role] })),
    typeMood: dna.typeMood,
    fontFamily: fontFamilyForTypeMood(dna.typeMood),
    geometry: dna.geometry,
    density: dna.density,
    radius: radiusForGeometry(dna.geometry),
    spacing: spacingForDensity(dna.density),
    mood,
    forbidden,
    dos,
    donts,
    slots: shown,
  };
}

/** Share of pixels within ΔE 10 of some palette color, as an integer 0–100. */
export function consistencyScore(pixels: readonly RgbPixel[], palette: readonly string[]): number {
  if (pixels.length === 0 || palette.length === 0) return 0;
  const swatches: Lab[] = [];
  for (const hex of palette) {
    const pixel = parseHex(hex);
    if (pixel) swatches.push(labOf(pixel));
  }
  if (swatches.length === 0) return 0;

  let matched = 0;
  for (const pixel of pixels) {
    const lab = labOf(pixel);
    let nearest = Number.POSITIVE_INFINITY;
    for (const swatch of swatches) {
      const distance = deltaE(lab, swatch);
      if (distance < nearest) nearest = distance;
    }
    if (nearest <= MATCH_DELTA_E) matched += 1;
  }
  return Math.round((100 * matched) / pixels.length);
}
