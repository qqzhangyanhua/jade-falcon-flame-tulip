import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleDna } from "../project/fixtures.ts";
import { mergeInstruction } from "./merge.ts";

type Call = { body: { messages: { role: string; content: string }[]; max_tokens: number } };

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

const base = sampleDna();

describe("mergeInstruction", () => {
  it("returns the validated new DNA with the changed fields", async () => {
    const next = sampleDna({
      colors: { ...base.colors, primary: "#ff7a3d" },
      light: "暖色侧光",
    });
    const calls: Call[] = [];
    const res = await mergeInstruction(base, "主色改成暖橘，光线偏暖侧光", {
      apiKey: "k",
      fetchImpl: fakeChat(JSON.stringify(next), calls),
    });
    assert.deepEqual(res, {
      ok: true,
      dna: next,
      changes: [
        { field: "colors.primary", from: "#4f7cff", to: "#ff7a3d" },
        { field: "light", from: "柔和顶光", to: "暖色侧光" },
      ],
    });
    const prompt = calls[0].body.messages.map((m) => m.content).join("\n");
    assert.ok(prompt.includes("主色改成暖橘"), "instruction is sent to the model");
    assert.ok(prompt.includes("#4f7cff"), "current DNA is sent to the model");
    assert.equal(typeof calls[0].body.max_tokens, "number");
  });

  it("allows a rename when the instruction asks for one", async () => {
    const next = sampleDna({ name: "暮光蓝" });
    const res = await mergeInstruction(base, "把风格改名为暮光蓝", {
      apiKey: "k",
      fetchImpl: fakeChat(JSON.stringify(next)),
    });
    assert.equal(res.ok, true);
    if (res.ok) assert.deepEqual(res.changes, [{ field: "name", from: "雾蓝", to: "暮光蓝" }]);
  });

  it("rejects a reply that cannot be parsed", async () => {
    const res = await mergeInstruction(base, "更暖一点", {
      apiKey: "k",
      fetchImpl: fakeChat("好的，我已经改好了"),
    });
    assert.deepEqual(res, { ok: false, error: "unparseable" });
  });

  it("rejects a reply that does not match the DNA schema", async () => {
    const { colors: _colors, ...incomplete } = sampleDna({ light: "暖光" });
    const res = await mergeInstruction(base, "更暖一点", {
      apiKey: "k",
      fetchImpl: fakeChat(JSON.stringify(incomplete)),
    });
    assert.deepEqual(res, { ok: false, error: "invalid_schema" });
  });

  it("rejects a rename the instruction did not ask for", async () => {
    const res = await mergeInstruction(base, "主色改成暖橘", {
      apiKey: "k",
      fetchImpl: fakeChat(
        JSON.stringify(
          sampleDna({ name: "暖橘", colors: { ...base.colors, primary: "#ff7a3d" } }),
        ),
      ),
    });
    assert.deepEqual(res, { ok: false, error: "renamed" });
  });

  it("rejects a reply that changes nothing", async () => {
    const res = await mergeInstruction(base, "更暖一点", {
      apiKey: "k",
      fetchImpl: fakeChat(JSON.stringify(base)),
    });
    assert.deepEqual(res, { ok: false, error: "no_change" });
  });

  it("reports a network failure", async () => {
    const res = await mergeInstruction(base, "更暖一点", {
      apiKey: "k",
      fetchImpl: fakeChat(failing),
    });
    assert.deepEqual(res, { ok: false, error: "network" });
  });

  it("reports an upstream failure and a missing key", async () => {
    assert.deepEqual(
      await mergeInstruction(base, "x", {
        apiKey: "k",
        fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
      }),
      { ok: false, error: "upstream" },
    );
    assert.deepEqual(await mergeInstruction(base, "x", { apiKey: "" }), {
      ok: false,
      error: "no_key",
    });
  });
});
