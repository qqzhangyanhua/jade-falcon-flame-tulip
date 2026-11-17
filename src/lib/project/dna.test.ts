import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffDna, styleDnaSchema, type StyleDna } from "./dna.ts";

function dna(patch: Partial<StyleDna> = {}): StyleDna {
  return {
    name: "雾蓝",
    oneLiner: "克制的雾蓝系统",
    colors: {
      bg: "#0b1020",
      surface: "#141b30",
      text: "#f4f6fb",
      muted: "#8a94ad",
      primary: "#4f7cff",
      accent: "#ffb547",
    },
    light: "柔和顶光",
    material: "磨砂玻璃",
    geometry: "大圆角",
    density: "宽松",
    typeMood: "几何无衬线",
    mood: ["冷静", "专业"],
    forbidden: ["霓虹"],
    promptPositive: "calm blue interface",
    promptNegative: "neon",
    ...patch,
  };
}

describe("diffDna", () => {
  it("returns nothing for identical DNA", () => {
    assert.deepEqual(diffDna(dna(), dna()), []);
  });

  it("reports a changed colour with a dotted field path", () => {
    const next = dna({ colors: { ...dna().colors, primary: "#ff0000" } });
    assert.deepEqual(diffDna(dna(), next), [
      { field: "colors.primary", from: "#4f7cff", to: "#ff0000" },
    ]);
  });

  it("reports scalar and list fields in schema order", () => {
    const next = dna({ light: "侧逆光", mood: ["冷静", "锋利"], forbidden: [] });
    assert.deepEqual(diffDna(dna(), next), [
      { field: "light", from: "柔和顶光", to: "侧逆光" },
      { field: "mood", from: "冷静、专业", to: "冷静、锋利" },
      { field: "forbidden", from: "霓虹", to: "" },
    ]);
  });

  it("treats a reordered list as a change", () => {
    const next = dna({ mood: ["专业", "冷静"] });
    assert.equal(diffDna(dna(), next).length, 1);
  });
});

describe("styleDnaSchema", () => {
  it("accepts a complete DNA", () => {
    assert.equal(styleDnaSchema.safeParse(dna()).success, true);
  });

  it("rejects a DNA missing a colour", () => {
    const { primary: _drop, ...colors } = dna().colors;
    assert.equal(styleDnaSchema.safeParse({ ...dna(), colors }).success, false);
  });
});
