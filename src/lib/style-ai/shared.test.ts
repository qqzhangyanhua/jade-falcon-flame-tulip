import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRESETS } from "../presets.ts";
import type { BriefIntent } from "../types.ts";
import {
  briefIntentInputSchema,
  hasValidColors,
  presetDirections,
  withUserIntent,
} from "./shared.ts";

const intent: BriefIntent = {
  productName: "Stride",
  category: "fitness",
  audience: "runners",
  platform: "app",
  mood: ["energetic", " bold "],
  forbidden: ["gaming", "pixel-art"],
};

describe("presetDirections", () => {
  it("returns every preset in order with the user's forbidden styles merged in", () => {
    const result = presetDirections(intent);
    assert.deepEqual(
      result.map((d) => d.presetId),
      PRESETS.map((p) => p.id),
    );
    for (const [i, d] of result.entries()) {
      for (const word of intent.forbidden) assert.ok(d.dna.forbidden.includes(word));
      assert.ok(PRESETS[i].dna.forbidden.every((w) => d.dna.forbidden.includes(w)));
      assert.ok(d.dna.mood.includes("energetic") && d.dna.mood.includes("bold"));
      assert.equal(d.dna.name, PRESETS[i].dna.name);
    }
  });

  it("does not duplicate styles the preset already forbids", () => {
    const dna = PRESETS[0].dna;
    const merged = withUserIntent(dna, { ...intent, forbidden: [dna.forbidden[0], dna.forbidden[0]] }, true);
    assert.equal(merged.forbidden.filter((w) => w === dna.forbidden[0]).length, 1);
  });

  it("ignores malformed intent lists instead of throwing", () => {
    const bad = { ...intent, forbidden: { not: "a list" }, mood: [1, null, "calm"] } as unknown as BriefIntent;
    const result = presetDirections(bad);
    assert.equal(result.length, PRESETS.length);
    assert.deepEqual(result[0].dna.forbidden, PRESETS[0].dna.forbidden);
    assert.ok(result[0].dna.mood.includes("calm"));
  });
});

describe("briefIntentInputSchema", () => {
  it("accepts a parsed intent", () => {
    assert.equal(briefIntentInputSchema.safeParse(intent).success, true);
  });

  it("rejects wrong types and oversized values", () => {
    assert.equal(briefIntentInputSchema.safeParse({ ...intent, forbidden: "gaming" }).success, false);
    assert.equal(briefIntentInputSchema.safeParse({ ...intent, mood: [1] }).success, false);
    assert.equal(briefIntentInputSchema.safeParse({ ...intent, productName: "x".repeat(201) }).success, false);
    assert.equal(
      briefIntentInputSchema.safeParse({ ...intent, forbidden: Array(13).fill("a") }).success,
      false,
    );
    assert.equal(briefIntentInputSchema.safeParse(null).success, false);
  });
});

describe("hasValidColors", () => {
  it("requires six-digit hex for every colour", () => {
    const dna = PRESETS[0].dna;
    assert.equal(hasValidColors(dna), true);
    assert.equal(hasValidColors({ ...dna, colors: { ...dna.colors, accent: "orange" } }), false);
    assert.equal(hasValidColors({ ...dna, colors: { ...dna.colors, accent: "#fff" } }), false);
  });
});
