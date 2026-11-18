export type RgbPixel = { r: number; g: number; b: number };

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
