import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRESETS } from "../presets.ts";
import type { BriefIntent } from "../types.ts";
import { tailorDirections } from "./index.ts";

type Call = { body: Record<string, unknown> };

function fakeChat(content: string | (() => never), calls: Call[] = []) {
  return async (
    _url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => {
    calls.push({ body: JSON.parse(init.body) });
    if (typeof content === "function") content();
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
}

const failing = () => {
  throw new Error("socket hang up");
};

const intent: BriefIntent = {
  productName: "Stride",
  category: "fitness",
  audience: "urban runners",
  platform: "app",
  mood: ["energetic", "bold"],
  forbidden: ["gaming", "pixel-art"],
};

function tailoredReply(mutate?: (dna: Record<string, unknown>, presetId: string) => void) {
  const directions = PRESETS.map((p) => {
    const dna = { ...structuredClone(p.dna), name: `${p.dna.name} · 跑步`, forbidden: ["gaming"] };
    mutate?.(dna, p.id);
    return { presetId: p.id, dna };
  });
  return JSON.stringify({ directions });
}

const opts = (fetchImpl: ReturnType<typeof fakeChat>) => ({ apiKey: "k", fetchImpl });

describe("tailorDirections", () => {
  it("returns four model-tailored directions, one per preset", async () => {
    const result = await tailorDirections(intent, opts(fakeChat(tailoredReply())));
    assert.deepEqual(
      result.map((d) => d.presetId),
      PRESETS.map((p) => p.id),
    );
    assert.deepEqual(
      result.map((d) => d.dna.name),
      PRESETS.map((p) => `${p.dna.name} · 跑步`),
    );
  });

  it("asks for a token budget big enough for four full DNAs", async () => {
    const calls: Call[] = [];
    await tailorDirections(intent, opts(fakeChat(tailoredReply(), calls)));
    assert.ok((calls[0].body.max_tokens as number) >= 3000);
  });

  it("puts the user's forbidden styles into every direction even if the model dropped them", async () => {
    const result = await tailorDirections(intent, opts(fakeChat(tailoredReply())));
    for (const d of result) {
      assert.ok(d.dna.forbidden.includes("gaming"));
      assert.ok(d.dna.forbidden.includes("pixel-art"));
    }
  });

  it("does not duplicate forbidden entries", async () => {
    const result = await tailorDirections(intent, opts(fakeChat(tailoredReply())));
    for (const d of result) {
      assert.equal(new Set(d.dna.forbidden).size, d.dna.forbidden.length);
    }
  });

  it("falls back to presets with the user's mood and forbidden merged when the reply is not JSON", async () => {
    const result = await tailorDirections(intent, opts(fakeChat("sorry")));
    assert.equal(result.length, 4);
    for (const [i, d] of result.entries()) {
      const preset = PRESETS[i];
      assert.equal(d.presetId, preset.id);
      assert.equal(d.dna.name, preset.dna.name);
      assert.deepEqual(d.dna.colors, preset.dna.colors);
      for (const m of intent.mood) assert.ok(d.dna.mood.includes(m));
      for (const m of preset.dna.mood) assert.ok(d.dna.mood.includes(m));
      for (const f of intent.forbidden) assert.ok(d.dna.forbidden.includes(f));
      for (const f of preset.dna.forbidden) assert.ok(d.dna.forbidden.includes(f));
    }
  });

  it("falls back to presets when the network fails", async () => {
    const result = await tailorDirections(intent, opts(fakeChat(failing)));
    assert.deepEqual(
      result.map((d) => d.dna.name),
      PRESETS.map((p) => p.dna.name),
    );
    for (const d of result) assert.ok(d.dna.forbidden.includes("gaming"));
  });

  it("falls back to presets without an API key", async () => {
    let called = false;
    const result = await tailorDirections(intent, {
      apiKey: "",
      fetchImpl: async () => {
        called = true;
        throw new Error("unreachable");
      },
    });
    assert.equal(called, false);
    assert.equal(result.length, 4);
  });

  it("falls back to presets when the reply does not match the DNA schema", async () => {
    const broken = JSON.stringify({
      directions: PRESETS.map((p) => ({ presetId: p.id, dna: { name: p.dna.name } })),
    });
    const result = await tailorDirections(intent, opts(fakeChat(broken)));
    assert.deepEqual(
      result.map((d) => d.dna.oneLiner),
      PRESETS.map((p) => p.dna.oneLiner),
    );
    for (const d of result) assert.ok(d.dna.forbidden.includes("gaming"));
  });

  it("replaces only the directions that are invalid", async () => {
    const reply = tailoredReply((dna, presetId) => {
      if (presetId === "ledger") delete dna.colors;
    });
    const result = await tailorDirections(intent, opts(fakeChat(reply)));
    const byId = Object.fromEntries(result.map((d) => [d.presetId, d.dna]));
    assert.equal(byId.paper.name, "纸上留白 · 跑步");
    assert.equal(byId.ledger.name, "账本商务");
    assert.ok(byId.ledger.forbidden.includes("pixel-art"));
  });

  it("rejects colours that are not hex values", async () => {
    const reply = tailoredReply((dna, presetId) => {
      if (presetId === "paper") (dna.colors as Record<string, string>).primary = "navy";
    });
    const result = await tailorDirections(intent, opts(fakeChat(reply)));
    assert.equal(result[0].dna.name, "纸上留白");
  });

  it("ignores a reply that is missing a preset and uses the fallback for it", async () => {
    const reply = JSON.stringify({
      directions: JSON.parse(tailoredReply()).directions.slice(0, 2),
    });
    const result = await tailorDirections(intent, opts(fakeChat(reply)));
    assert.equal(result.length, 4);
    assert.equal(result[0].dna.name, "纸上留白 · 跑步");
    assert.equal(result[3].dna.name, "夜场片场");
  });
});
