import type { Slot, StyleDna } from "./types";

function esc(s: string): string {
  return s
    .replaceAll("&", "\u0026amp;")
    .replaceAll("<", "\u0026lt;")
    .replaceAll(">", "\u0026gt;")
    .replaceAll('"', "\u0026quot;");
}

export function fallbackBoardSvg(opts: {
  dna: StyleDna;
  title: string;
  kind: "candidate" | Slot;
}): string {
  const { dna, title, kind } = opts;
  const t = esc(title || "Keystone");
  const name = esc(dna.name);
  const c = dna.colors;
  const w = kind === "ui_hero" ? 720 : 1280;
  const h = kind === "ui_hero" ? 1280 : 720;

  if (kind === "ui_hero") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="100%" height="100%" fill="${c.bg}"/>
      <rect x="48" y="48" width="624" height="1184" rx="48" fill="${c.surface}" stroke="${c.text}22"/>
      <rect x="72" y="88" width="160" height="18" rx="9" fill="${c.muted}55"/>
      <text x="72" y="180" font-family="Georgia, serif" font-size="44" fill="${c.text}">${t}</text>
      <text x="72" y="230" font-family="sans-serif" font-size="22" fill="${c.muted}">${name}</text>
      <rect x="72" y="280" width="576" height="220" rx="24" fill="${c.primary}"/>
      <text x="96" y="360" font-family="sans-serif" font-size="28" fill="${c.bg}">Today</text>
      <text x="96" y="404" font-family="sans-serif" font-size="18" fill="${c.bg}cc">Flagship screen</text>
      <rect x="72" y="536" width="576" height="120" rx="20" fill="${c.bg}"/>
      <rect x="72" y="676" width="576" height="120" rx="20" fill="${c.bg}"/>
      <rect x="72" y="816" width="576" height="120" rx="20" fill="${c.bg}"/>
      <rect x="200" y="1140" width="320" height="56" rx="28" fill="${c.accent}"/>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  const left = kind === "candidate";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="100%" height="100%" fill="${c.bg}"/>
    ${
      left
        ? `<rect x="40" y="40" width="520" height="640" rx="28" fill="${c.surface}" stroke="${c.text}18"/>
           <rect x="200" y="90" width="200" height="420" rx="32" fill="${c.bg}" stroke="${c.text}22"/>
           <rect x="220" y="130" width="160" height="24" rx="8" fill="${c.muted}44"/>
           <rect x="220" y="180" width="160" height="90" rx="14" fill="${c.primary}"/>
           <rect x="220" y="290" width="160" height="48" rx="10" fill="${c.bg}"/>
           <rect x="220" y="350" width="160" height="48" rx="10" fill="${c.bg}"/>
           <rect x="220" y="410" width="160" height="48" rx="10" fill="${c.bg}"/>`
        : ""
    }
    <rect x="${left ? 600 : 80}" y="40" width="${left ? 640 : 1120}" height="640" rx="28" fill="${c.surface}"/>
    <text x="${left ? 640 : 120}" y="160" font-family="Georgia, serif" font-size="42" fill="${c.text}">${t}</text>
    <text x="${left ? 640 : 120}" y="214" font-family="sans-serif" font-size="22" fill="${c.muted}">${name} · ${esc(dna.oneLiner)}</text>
    <rect x="${left ? 640 : 120}" y="280" width="220" height="72" fill="${c.primary}"/>
    <rect x="${left ? 876 : 356}" y="280" width="220" height="72" fill="${c.accent}"/>
    <rect x="${left ? 640 : 120}" y="372" width="160" height="72" fill="${c.text}"/>
    <text x="${left ? 640 : 120}" y="520" font-family="sans-serif" font-size="16" fill="${c.muted}">${esc(dna.material)} · ${esc(dna.light)} · ${esc(dna.density)}</text>
    <rect x="${left ? 640 : 120}" y="560" width="280" height="44" rx="22" fill="${c.primary}"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
