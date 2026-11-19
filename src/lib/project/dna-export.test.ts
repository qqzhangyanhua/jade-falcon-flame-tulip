import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DESIGN_TOKEN_TABLE,
  brandGuideModel,
  consistencyScore,
  designTokens,
  paletteForStyleRev,
  paletteOfDna,
  fontFamilyForTypeMood,
  promptPack,
  radiusForGeometry,
  spacingForDensity,
} from "./dna-export.ts";
import { brandGuideHref, resolveBrandGuideAccess, styleForGuide } from "./brand-guide-access.ts";
import { BRAND_GUIDE_PRINT_CSS } from "./brand-guide-print.ts";
import { sampleDna, sampleStyle } from "./fixtures.ts";
import { emptyAsset, type ImageRev } from "./schema.ts";

const white = { r: 255, g: 255, b: 255 };
const black = { r: 0, g: 0, b: 0 };
const boundaryHit = { r: 0xe3, g: 0xe3, b: 0xe3 };
const boundaryMiss = { r: 0xe2, g: 0xe2, b: 0xe2 };

describe("consistencyScore", () => {
  it("scores 100 when every pixel is on the palette", () => {
    assert.equal(consistencyScore([white, white], ["#ffffff"]), 100);
  });

  it("scores 0 when every pixel misses the palette", () => {
    assert.equal(consistencyScore([black, black], ["#ffffff"]), 0);
  });

  it("scores 50 when half the pixels hit the palette", () => {
    assert.equal(consistencyScore([white, black], ["#ffffff"]), 50);
  });

  it("counts #e3e3e3 against #ffffff as a hit", () => {
    assert.equal(consistencyScore([boundaryHit], ["#ffffff"]), 100);
  });

  it("counts #e2e2e2 against #ffffff as a miss", () => {
    assert.equal(consistencyScore([boundaryMiss], ["#ffffff"]), 0);
  });

  it("scores 50 for one boundary hit and one boundary miss", () => {
    assert.equal(consistencyScore([boundaryHit, boundaryMiss], ["#ffffff"]), 50);
  });
});

describe("palette for a generated image", () => {
  it("uses the style rev stamped on the image, not a later rev", () => {
    const first = sampleDna({
      colors: { ...sampleDna().colors, primary: "#111111" },
    });
    const later = sampleDna({
      colors: { ...sampleDna().colors, primary: "#222222" },
    });
    assert.deepEqual(
      paletteForStyleRev(
        [
          { rev: 1, dna: first },
          { rev: 2, dna: later },
        ],
        1,
      ),
      ["#0b1020", "#141b30", "#f4f6fb", "#8a94ad", "#111111", "#ffb547"],
    );
    assert.equal(paletteForStyleRev([{ rev: 1, dna: first }], 4), null);
  });

  it("reads a direction candidate's own palette", () => {
    assert.deepEqual(paletteOfDna(sampleDna()), [
      "#0b1020",
      "#141b30",
      "#f4f6fb",
      "#8a94ad",
      "#4f7cff",
      "#ffb547",
    ]);
  });
});

const DEFAULT_BLOCK = `  --color-bg: #0b1020;
  --color-surface: #141b30;
  --color-text: #f4f6fb;
  --color-muted: #8a94ad;
  --color-primary: #4f7cff;
  --color-accent: #ffb547;
  --radius-md: 8px;
  --spacing-brand: 16px;
  --font-sans: system-ui, sans-serif;`;

describe("design token lookup", () => {
  it("maps every named geometry, density and type mood to the contract string", () => {
    assert.equal(radiusForGeometry("sharp"), "0px");
    assert.equal(radiusForGeometry("soft"), "12px");
    assert.equal(radiusForGeometry("rounded-comfortable"), "16px");
    assert.equal(DESIGN_TOKEN_TABLE.geometry.sharp, "0px");
    assert.equal(DESIGN_TOKEN_TABLE.geometry.soft, "12px");
    assert.equal(DESIGN_TOKEN_TABLE.geometry["rounded-comfortable"], "16px");

    assert.equal(spacingForDensity("airy"), "24px");
    assert.equal(spacingForDensity("compact"), "8px");
    assert.equal(spacingForDensity("comfortable"), "16px");
    assert.equal(DESIGN_TOKEN_TABLE.density.airy, "24px");
    assert.equal(DESIGN_TOKEN_TABLE.density.compact, "8px");
    assert.equal(DESIGN_TOKEN_TABLE.density.comfortable, "16px");

    assert.equal(
      fontFamilyForTypeMood("editorial-sans"),
      `"Source Sans 3", "Segoe UI", sans-serif`,
    );
    assert.equal(
      fontFamilyForTypeMood("geometric-sans"),
      `"Avenir Next", "Century Gothic", sans-serif`,
    );
    assert.equal(fontFamilyForTypeMood("humanist-sans"), `"Gill Sans", "Trebuchet MS", sans-serif`);
    assert.equal(
      fontFamilyForTypeMood("display-serif-mix"),
      `"Fraunces", "Iowan Old Style", serif`,
    );
    assert.equal(
      DESIGN_TOKEN_TABLE.typeMood["editorial-sans"],
      `"Source Sans 3", "Segoe UI", sans-serif`,
    );
    assert.equal(
      DESIGN_TOKEN_TABLE.typeMood["geometric-sans"],
      `"Avenir Next", "Century Gothic", sans-serif`,
    );
    assert.equal(
      DESIGN_TOKEN_TABLE.typeMood["humanist-sans"],
      `"Gill Sans", "Trebuchet MS", sans-serif`,
    );
    assert.equal(
      DESIGN_TOKEN_TABLE.typeMood["display-serif-mix"],
      `"Fraunces", "Iowan Old Style", serif`,
    );
  });

  it("uses the default row for any other geometry, density or type mood", () => {
    assert.equal(radiusForGeometry("大圆角"), "8px");
    assert.equal(radiusForGeometry("pill"), "8px");
    assert.equal(DESIGN_TOKEN_TABLE.geometry.default, "8px");

    assert.equal(spacingForDensity("宽松"), "16px");
    assert.equal(spacingForDensity("tight"), "16px");
    assert.equal(DESIGN_TOKEN_TABLE.density.default, "16px");

    assert.equal(fontFamilyForTypeMood("几何无衬线"), "system-ui, sans-serif");
    assert.equal(fontFamilyForTypeMood("script"), "system-ui, sans-serif");
    assert.equal(DESIGN_TOKEN_TABLE.typeMood.default, "system-ui, sans-serif");
  });
});

describe("designTokens", () => {
  it("writes the default row as :root custom properties and a Tailwind v4 @theme block", () => {
    const tokens = designTokens(sampleDna());
    assert.equal(tokens.css, `:root {\n${DEFAULT_BLOCK}\n}\n`);
    assert.equal(tokens.tailwind, `@theme {\n${DEFAULT_BLOCK}\n}\n`);
  });

  it("writes the named radius, spacing and font into CSS, Tailwind and W3C tokens", () => {
    const tokens = designTokens(
      sampleDna({ geometry: "sharp", density: "compact", typeMood: "geometric-sans" }),
    );
    const font = `"Avenir Next", "Century Gothic", sans-serif`;
    assert.match(tokens.css, /--radius-md: 0px;/);
    assert.match(tokens.css, /--spacing-brand: 8px;/);
    assert.ok(tokens.css.includes(`--font-sans: ${font};`));
    assert.doesNotMatch(tokens.css, /--radius:/);
    assert.doesNotMatch(tokens.css, /--spacing:/);
    assert.doesNotMatch(tokens.css, /--font-family:/);
    assert.match(tokens.tailwind, /^@theme \{/);
    assert.match(tokens.tailwind, /--radius-md: 0px;/);
    assert.match(tokens.tailwind, /--spacing-brand: 8px;/);
    assert.ok(tokens.tailwind.includes(`--font-sans: ${font};`));
    assert.doesNotMatch(tokens.tailwind, /--spacing:/);
    assert.doesNotMatch(tokens.tailwind, /--radius:/);
    assert.doesNotMatch(tokens.tailwind, /--font-family:/);

    const w3c = JSON.parse(tokens.w3c) as {
      color: Record<string, { $type: string; $value: string }>;
      radius: { $type: string; $value: string };
      spacing: { $type: string; $value: string };
      fontFamily: { $type: string; $value: string };
    };
    assert.deepEqual(w3c.color.bg, { $type: "color", $value: "#0b1020" });
    assert.equal(w3c.color.surface.$type, "color");
    assert.equal(w3c.color.surface.$value, "#141b30");
    assert.equal(w3c.color.text.$value, "#f4f6fb");
    assert.equal(w3c.color.muted.$value, "#8a94ad");
    assert.equal(w3c.color.primary.$value, "#4f7cff");
    assert.equal(w3c.color.accent.$value, "#ffb547");
    assert.deepEqual(w3c.radius, { $type: "dimension", $value: "0px" });
    assert.deepEqual(w3c.spacing, { $type: "dimension", $value: "8px" });
    assert.deepEqual(w3c.fontFamily, { $type: "fontFamily", $value: font });
  });

  it("puts the default radius, spacing and font in the W3C document", () => {
    const w3c = JSON.parse(designTokens(sampleDna()).w3c) as {
      radius: { $type: string; $value: string };
      spacing: { $type: string; $value: string };
      fontFamily: { $type: string; $value: string };
    };
    assert.deepEqual(w3c.radius, { $type: "dimension", $value: "8px" });
    assert.deepEqual(w3c.spacing, { $type: "dimension", $value: "16px" });
    assert.deepEqual(w3c.fontFamily, { $type: "fontFamily", $value: "system-ui, sans-serif" });
  });
});

describe("promptPack", () => {
  const slotPrompt =
    '品牌主视觉 for "云栖", KV / 海报. Visual system: calm blue interface. Palette: bg #0b1020, surface #141b30, text #f4f6fb, muted #8a94ad, primary #4f7cff, accent #ffb547. Lighting 柔和顶光, material 磨砂玻璃, density airy, geometry rounded-comfortable, type editorial-sans. Mood: 冷静, 专业.';
  const plain =
    "请为「云栖」做一张品牌主视觉，用途是 KV / 海报，画面比例 16:9。沿用风格「雾蓝」（克制的雾蓝系统）：calm blue interface。背景色 #0b1020，表面色 #141b30，文字色 #f4f6fb，次要色 #8a94ad，主色 #4f7cff，强调色 #ffb547。光线为 柔和顶光，材质为 磨砂玻璃，几何为 rounded-comfortable，密度为 airy，字体气质为 editorial-sans。情绪是冷静、专业。不要出现：霓虹、赛博、neon glow。";

  const dna = sampleDna({
    geometry: "rounded-comfortable",
    density: "airy",
    typeMood: "editorial-sans",
    forbidden: ["霓虹", "赛博"],
    promptNegative: "neon glow",
  });
  const slots = [
    { id: "kv", name: "品牌主视觉", aspect: "16:9", purpose: "KV / 海报" },
    { id: "ui_hero", name: "产品旗舰页", aspect: "9:16", purpose: "有原型则保结构" },
  ];

  it("writes Midjourney, SD/Flux and plain language for each slot", () => {
    const packs = promptPack(dna, slots, "云栖");
    assert.equal(packs.length, 2);
    assert.equal(packs[0].id, "kv");
    assert.equal(packs[0].name, "品牌主视觉");
    assert.equal(packs[0].midjourney, `${slotPrompt} --ar 16:9 --no 霓虹, 赛博, neon glow`);
    assert.equal(packs[0].sdFlux.positive, slotPrompt);
    assert.equal(packs[0].sdFlux.negative, "霓虹, 赛博, neon glow");
    assert.equal(packs[0].sdFlux.positive.includes("--ar"), false);
    assert.equal(packs[0].sdFlux.positive.includes("--no"), false);
    assert.equal(packs[0].plain, plain);
    assert.equal(packs[0].plain.includes("\n"), false);

    assert.equal(packs[1].id, "ui_hero");
    assert.match(packs[1].midjourney, /产品旗舰页 for "云栖", 有原型则保结构\./);
    assert.match(packs[1].midjourney, / --ar 9:16 --no 霓虹, 赛博, neon glow$/);
    assert.equal(packs[1].sdFlux.negative, "霓虹, 赛博, neon glow");
    assert.equal(packs[1].plain.includes("\n"), false);
    assert.ok(packs[1].plain.includes("产品旗舰页"));
    assert.ok(packs[1].plain.includes("9:16"));
    assert.ok(packs[1].plain.includes("有原型则保结构"));
  });

  it("still emits --ar and --no when nothing is forbidden", () => {
    const packs = promptPack(
      sampleDna({ forbidden: [], promptNegative: "  " }),
      [slots[0]],
      "云栖",
    );
    assert.match(packs[0].midjourney, / --ar 16:9 --no$/);
    assert.equal(packs[0].sdFlux.negative, "");
  });
});

const viewedColors = {
  bg: "#102030",
  surface: "#203040",
  text: "#fafafa",
  muted: "#8899aa",
  primary: "#3366cc",
  accent: "#cc6633",
};

describe("brandGuideModel", () => {
  it("reads the viewed rev's palette, type, geometry, mood and do/don't lines", () => {
    const older = sampleDna({
      colors: { ...viewedColors, bg: "#111111" },
      geometry: "soft",
      density: "compact",
      typeMood: "geometric-sans",
      mood: ["旧"],
      forbidden: ["旧禁"],
    });
    const viewed = sampleDna({
      colors: viewedColors,
      geometry: "sharp",
      density: "airy",
      typeMood: "editorial-sans",
      mood: ["冷静", "克制"],
      forbidden: ["霓虹", "赛博"],
    });
    const line = sampleStyle("a", {
      currentRev: 2,
      revs: [
        { rev: 1, parentRev: null, dna: older, changeLog: "锁定", createdAt: 1 },
        { rev: 2, parentRev: 1, dna: viewed, changeLog: "写回", createdAt: 2 },
      ],
    });

    const guide = brandGuideModel(line, []);

    assert.deepEqual(guide.palette, [
      { role: "bg", hex: "#102030" },
      { role: "surface", hex: "#203040" },
      { role: "text", hex: "#fafafa" },
      { role: "muted", hex: "#8899aa" },
      { role: "primary", hex: "#3366cc" },
      { role: "accent", hex: "#cc6633" },
    ]);
    assert.equal(
      guide.palette.some((swatch) => swatch.hex === "#111111"),
      false,
    );
    assert.equal(guide.typeMood, "editorial-sans");
    assert.equal(guide.fontFamily, `"Source Sans 3", "Segoe UI", sans-serif`);
    assert.equal(guide.geometry, "sharp");
    assert.equal(guide.density, "airy");
    assert.equal(guide.radius, "0px");
    assert.equal(guide.spacing, "24px");
    assert.deepEqual(guide.mood, ["冷静", "克制"]);
    assert.deepEqual(guide.forbidden, ["霓虹", "赛博"]);
    assert.deepEqual(guide.dos, ["情绪保持：冷静、克制"]);
    assert.deepEqual(guide.donts, ["避免霓虹", "避免赛博"]);
  });

  it("derives no do line from an empty mood and no don't lines from an empty forbidden list", () => {
    const guide = brandGuideModel(
      sampleStyle("a", {
        revs: [
          {
            rev: 1,
            parentRev: null,
            dna: sampleDna({ mood: [], forbidden: [] }),
            changeLog: "锁定",
            createdAt: 1,
          },
        ],
      }),
      [],
    );

    assert.deepEqual(guide.mood, []);
    assert.deepEqual(guide.forbidden, []);
    assert.equal(guide.typeMood, "几何无衬线");
    assert.equal(guide.fontFamily, "system-ui, sans-serif");
    assert.equal(guide.geometry, "大圆角");
    assert.equal(guide.density, "宽松");
    assert.equal(guide.radius, "8px");
    assert.equal(guide.spacing, "16px");
    assert.deepEqual(guide.dos, []);
    assert.deepEqual(guide.donts, []);
    assert.deepEqual(
      guide.palette.map((swatch) => swatch.hex),
      ["#0b1020", "#141b30", "#f4f6fb", "#8a94ad", "#4f7cff", "#ffb547"],
    );
  });

  it("keeps the adopted image, otherwise the latest, and skips slots with no image", () => {
    const image = (id: string, url: string): ImageRev => ({
      id,
      parentId: null,
      url,
      createdAt: 1,
      action: "generate",
      diff: "",
      writeback: "none",
      styleRev: 1,
    });
    const line = sampleStyle("a", {
      assets: {
        web_home: emptyAsset("web_home"),
        kv: {
          slot: "kv",
          adoptedId: "img_k1",
          revs: [image("img_k1", "/api/images/k1"), image("img_k2", "/api/images/k2")],
        },
        ui_hero: {
          slot: "ui_hero",
          adoptedId: null,
          revs: [image("img_u1", "/api/images/u1"), image("img_u2", "/api/images/u2")],
        },
        poster: {
          slot: "poster",
          adoptedId: "img_p",
          revs: [image("img_p", "/api/images/p")],
        },
      },
    });
    const slots = [
      { id: "web_home", name: "官网首屏", aspect: "16:9", purpose: "延展页" },
      { id: "kv", name: "品牌主视觉", aspect: "16:9", purpose: "KV / 海报" },
      { id: "ui_hero", name: "产品旗舰页", aspect: "9:16", purpose: "有原型则保结构" },
    ];

    assert.deepEqual(brandGuideModel(line, slots).slots, [
      {
        id: "kv",
        name: "品牌主视觉",
        aspect: "16:9",
        purpose: "KV / 海报",
        url: "/api/images/k1",
        revId: "img_k1",
      },
      {
        id: "ui_hero",
        name: "产品旗舰页",
        aspect: "9:16",
        purpose: "有原型则保结构",
        url: "/api/images/u2",
        revId: "img_u2",
      },
    ]);
  });

  it("skips a slot whose exported image id is excluded and does not use another rev", () => {
    const image = (id: string, url: string): ImageRev => ({
      id,
      parentId: null,
      url,
      createdAt: 1,
      action: "generate",
      diff: "",
      writeback: "none",
      styleRev: 1,
    });
    const line = sampleStyle("a", {
      assets: {
        kv: {
          slot: "kv",
          adoptedId: "img_k1",
          revs: [image("img_k1", "/api/images/k1"), image("img_k2", "/api/images/k2")],
        },
        ui_hero: {
          slot: "ui_hero",
          adoptedId: null,
          revs: [image("img_u1", "/api/images/u1"), image("img_u2", "/api/images/u2")],
        },
        poster: {
          slot: "poster",
          adoptedId: "img_p",
          revs: [image("img_p", "/api/images/p")],
        },
      },
    });
    const slots = [
      { id: "kv", name: "品牌主视觉", aspect: "16:9", purpose: "KV / 海报" },
      { id: "ui_hero", name: "产品旗舰页", aspect: "9:16", purpose: "有原型则保结构" },
      { id: "poster", name: "海报", aspect: "3:4", purpose: "竖版" },
    ];

    assert.deepEqual(brandGuideModel(line, slots, ["k1", "u2"]).slots, [
      {
        id: "poster",
        name: "海报",
        aspect: "3:4",
        purpose: "竖版",
        url: "/api/images/p",
        revId: "img_p",
      },
    ]);
  });
});

describe("styleForGuide", () => {
  const older = sampleDna({ colors: { ...viewedColors, bg: "#111111" } });
  const viewed = sampleDna({ colors: viewedColors });
  const line = sampleStyle("a", {
    currentRev: 2,
    revs: [
      { rev: 1, parentRev: null, dna: older, changeLog: "锁定", createdAt: 1 },
      { rev: 2, parentRev: 1, dna: viewed, changeLog: "写回", createdAt: 2 },
    ],
  });

  it("puts the viewed rev on the guide link and reads that rev when it is on the line", () => {
    assert.equal(brandGuideHref("prj/1", "style a", 1), "/guide/prj%2F1/style%20a?rev=1");
    const viewedLine = styleForGuide(line, "1");
    assert.equal(viewedLine.currentRev, 1);
    assert.equal(brandGuideModel(viewedLine, []).palette[0]?.hex, "#111111");
    assert.equal(styleForGuide(line, ["1", "2"]).currentRev, 1);
  });

  it("keeps the saved current rev when the query rev is absent or not on the line", () => {
    assert.equal(styleForGuide(line, undefined).currentRev, 2);
    assert.equal(styleForGuide(line, "").currentRev, 2);
    assert.equal(styleForGuide(line, "9").currentRev, 2);
    assert.equal(styleForGuide(line, "1.5").currentRev, 2);
    assert.equal(styleForGuide(line, "2e0").currentRev, 2);
    assert.equal(brandGuideModel(styleForGuide(line, "nope"), []).palette[0]?.hex, "#102030");
  });
});

describe("brand guide print css", () => {
  it("compacts a normal guide onto one A4 page without clipping hex values or do/don't text", () => {
    assert.match(BRAND_GUIDE_PRINT_CSS, /@page \{ size: A4; margin: 12mm; \}/);
    assert.match(BRAND_GUIDE_PRINT_CSS, /\.guide-chrome \{ display: none !important; \}/);
    assert.match(BRAND_GUIDE_PRINT_CSS, /\.guide-sheet \{[^}]*font-size: 9pt;/);
    assert.match(BRAND_GUIDE_PRINT_CSS, /\.guide-figures \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    assert.match(BRAND_GUIDE_PRINT_CSS, /\.guide-figure img \{[^}]*height: 22mm !important;/);
    assert.match(BRAND_GUIDE_PRINT_CSS, /\.guide-root \{[^}]*min-height: 0 !important;/);
    assert.doesNotMatch(BRAND_GUIDE_PRINT_CSS, /overflow:\s*hidden/);
    assert.doesNotMatch(BRAND_GUIDE_PRINT_CSS, /line-clamp/);
    assert.doesNotMatch(BRAND_GUIDE_PRINT_CSS, /text-overflow:\s*ellipsis/);
    assert.doesNotMatch(BRAND_GUIDE_PRINT_CSS, /\.guide-hex[^{]*\{[^}]*display:\s*none/);
    assert.doesNotMatch(BRAND_GUIDE_PRINT_CSS, /\.guide-rule[^{]*\{[^}]*display:\s*none/);
  });
});

describe("resolveBrandGuideAccess", () => {
  it("sends a signed-out visitor to sign-in and does not say why a signed-in load failed", () => {
    assert.equal(
      resolveBrandGuideAccess({
        signedIn: false,
        code: null,
        hasDocument: false,
        hasStyle: false,
      }),
      "redirect",
    );
    assert.equal(
      resolveBrandGuideAccess({
        signedIn: false,
        code: "forbidden",
        hasDocument: true,
        hasStyle: true,
      }),
      "redirect",
    );

    const hidden = ["forbidden", "not_found", "project_deleted", "unauthorized"] as const;
    const outcomes = hidden.map((code) =>
      resolveBrandGuideAccess({ signedIn: true, code, hasDocument: true, hasStyle: true }),
    );
    assert.deepEqual(outcomes, ["not_found", "not_found", "not_found", "not_found"]);
    assert.equal(
      resolveBrandGuideAccess({
        signedIn: true,
        code: "ok",
        hasDocument: false,
        hasStyle: false,
      }),
      "not_found",
    );
    assert.equal(
      resolveBrandGuideAccess({ signedIn: true, code: "ok", hasDocument: true, hasStyle: false }),
      "not_found",
    );
    assert.equal(
      resolveBrandGuideAccess({ signedIn: true, code: "ok", hasDocument: true, hasStyle: true }),
      "show",
    );
  });
});
