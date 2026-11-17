import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chatJson } from "./chat.ts";
import { parseBrief } from "./index.ts";

type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

function fakeChat(content: string | (() => never), calls: Call[] = []) {
  return async (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    if (typeof content === "function") content();
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] }),
    };
  };
}

const failing = () => {
  throw new Error("socket hang up");
};

describe("parseBrief", () => {
  it("returns the intent the model extracted", async () => {
    const intent = await parseBrief("一个给跑者用的计步应用", {
      apiKey: "k",
      fetchImpl: fakeChat(
        JSON.stringify({
          productName: "Stride",
          category: "fitness",
          audience: "runners",
          platform: "web",
          mood: ["energetic", "bold"],
          forbidden: ["neon"],
        }),
      ),
    });
    assert.deepEqual(intent, {
      productName: "Stride",
      category: "fitness",
      audience: "runners",
      platform: "web",
      mood: ["energetic", "bold"],
      forbidden: ["neon"],
    });
  });

  it("falls back to defaults when the reply is not JSON", async () => {
    const intent = await parseBrief("a calm meditation app for busy people", {
      apiKey: "k",
      fetchImpl: fakeChat("sorry, I cannot do that"),
    });
    assert.deepEqual(intent, {
      productName: "a calm meditation ap",
      category: "product",
      audience: "general",
      platform: "app",
      mood: ["clear", "modern"],
      forbidden: [],
    });
  });

  it("falls back to defaults when the network fails", async () => {
    const intent = await parseBrief("", { apiKey: "k", fetchImpl: fakeChat(failing) });
    assert.equal(intent.productName, "未命名产品");
    assert.equal(intent.platform, "app");
    assert.deepEqual(intent.forbidden, []);
  });

  it("falls back to defaults without an API key", async () => {
    let called = false;
    const intent = await parseBrief("tea shop", {
      apiKey: "",
      fetchImpl: async () => {
        called = true;
        throw new Error("unreachable");
      },
    });
    assert.equal(called, false);
    assert.equal(intent.productName, "tea shop");
  });

  it("uses a per-call token budget", async () => {
    const calls: Call[] = [];
    await parseBrief("x", { apiKey: "k", fetchImpl: fakeChat("{}", calls) });
    assert.equal(calls[0].body.max_tokens, 500);
  });
});

describe("chatJson", () => {
  it("sends the caller's max_tokens and bearer key", async () => {
    const calls: Call[] = [];
    const res = await chatJson({
      prompt: "p",
      maxTokens: 1200,
      apiKey: "secret",
      fetchImpl: fakeChat('{"a":1}', calls),
    });
    assert.deepEqual(res, { ok: true, value: { a: 1 } });
    assert.equal(calls[0].body.max_tokens, 1200);
    assert.equal(calls[0].headers.Authorization, "Bearer secret");
  });

  it("returns typed errors", async () => {
    const base = { prompt: "p", maxTokens: 10, apiKey: "k" };
    assert.deepEqual(await chatJson({ ...base, fetchImpl: fakeChat("nope") }), {
      ok: false,
      error: "unparseable",
    });
    assert.deepEqual(await chatJson({ ...base, fetchImpl: fakeChat(failing) }), {
      ok: false,
      error: "network",
    });
    assert.deepEqual(
      await chatJson({
        ...base,
        fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
      }),
      { ok: false, error: "upstream" },
    );
    assert.deepEqual(await chatJson({ ...base, apiKey: "", fetchImpl: fakeChat("{}") }), {
      ok: false,
      error: "no_key",
    });
  });
});
