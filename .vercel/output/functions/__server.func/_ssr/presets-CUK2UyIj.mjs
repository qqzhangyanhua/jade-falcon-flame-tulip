//#region node_modules/.nitro/vite/services/ssr/assets/presets-CUK2UyIj.js
function esc(s) {
	return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}
function fallbackBoardSvg(opts) {
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
    ${left ? `<rect x="40" y="40" width="520" height="640" rx="28" fill="${c.surface}" stroke="${c.text}18"/>
           <rect x="200" y="90" width="200" height="420" rx="32" fill="${c.bg}" stroke="${c.text}22"/>
           <rect x="220" y="130" width="160" height="24" rx="8" fill="${c.muted}44"/>
           <rect x="220" y="180" width="160" height="90" rx="14" fill="${c.primary}"/>
           <rect x="220" y="290" width="160" height="48" rx="10" fill="${c.bg}"/>
           <rect x="220" y="350" width="160" height="48" rx="10" fill="${c.bg}"/>
           <rect x="220" y="410" width="160" height="48" rx="10" fill="${c.bg}"/>` : ""}
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
var PRESETS = [
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
				accent: "#C45C2A"
			},
			light: "studio-soft",
			material: "flat-paper",
			geometry: "rounded-comfortable",
			density: "airy",
			typeMood: "editorial-sans",
			mood: ["calm", "clear"],
			forbidden: [
				"neon",
				"cyberpunk",
				"clutter",
				"heavy-gradient"
			],
			promptPositive: "quiet editorial product design, warm off-white paper, generous whitespace, navy ink accent, restrained photography, Swiss-inspired layout",
			promptNegative: "neon, cyberpunk, cluttered widgets, skeuomorphism, rainbow gradient, comic illustration"
		}
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
				accent: "#0E7C66"
			},
			light: "even-daylight",
			material: "flat",
			geometry: "sharp",
			density: "comfortable",
			typeMood: "geometric-sans",
			mood: ["trustworthy", "precise"],
			forbidden: [
				"playful-illustration",
				"neon",
				"ornate-serif"
			],
			promptPositive: "clean enterprise SaaS, cool gray canvas, precise blue accent, hairline borders, functional photography, IBM-like utility",
			promptNegative: "neon, candy colors, skeuomorphism, gaming HUD, graffiti"
		}
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
				accent: "#2F6B4F"
			},
			light: "window-warm",
			material: "tactile-paper",
			geometry: "soft",
			density: "comfortable",
			typeMood: "humanist-sans",
			mood: ["warm", "approachable"],
			forbidden: [
				"cold-steel",
				"neon",
				"dense-dashboard"
			],
			promptPositive: "warm atelier brand, cream paper, terracotta and forest accents, soft rounded UI, tactile print textures, lifestyle still life",
			promptNegative: "cold fluorescent, cyberpunk, harsh black, stock handshake photo"
		}
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
				accent: "#6EA8FF"
			},
			light: "film-key",
			material: "soft-matte",
			geometry: "rounded-comfortable",
			density: "comfortable",
			typeMood: "display-serif-mix",
			mood: ["cinematic", "quiet-luxury"],
			forbidden: [
				"bright-pastel",
				"comic",
				"busy-memphis"
			],
			promptPositive: "cinematic dark brand studio, charcoal surfaces, champagne type, cool rim light, luxury product still, restrained UI on dark",
			promptNegative: "flat cartoon, neon vaporwave, cluttered dashboard, daylight stock photo"
		}
	}
];
//#endregion
export { fallbackBoardSvg as n, PRESETS as t };
