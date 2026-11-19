import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BriefIntent } from "../types.ts";
import { chatJson } from "./chat.ts";
import { parseBrief, referenceDirection } from "./index.ts";

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

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7, 8]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2]);

const referenceIntent: BriefIntent = {
  productName: "Stride",
  category: "fitness",
  audience: "urban runners",
  platform: "app",
  mood: ["energetic", "bold"],
  forbidden: ["gaming", "pixel-art"],
};

const modelDna = {
  name: "参考雾蓝",
  oneLiner: "a line with } and { braces",
  colors: {
    bg: "#102030",
    surface: "#1a2a3a",
    text: "#f4f6fb",
    muted: "#8a94ad",
    primary: "#4f7cff",
    accent: "#ffb547",
  },
  light: "柔和顶光",
  material: "磨砂",
  geometry: "圆角",
  density: "宽松",
  typeMood: "无衬线",
  mood: ["quiet"],
  forbidden: ["neon"],
  promptPositive: "calm reference board",
  promptNegative: "neon glow",
};

type ScriptStep = { ok: boolean; content?: string } | "throw";

function scriptedChat(steps: ScriptStep[], calls: Call[] = []) {
  let index = 0;
  return async (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const step = steps[index++];
    if (!step) throw new Error("unexpected extra chat call");
    if (step === "throw") throw new Error("socket hang up");
    return {
      ok: step.ok,
      json: async () => ({ choices: [{ message: { content: step.content ?? "" } }] }),
    };
  };
}

function imageBlocks(body: Record<string, unknown>) {
  const messages = body.messages as { role: string; content: unknown }[];
  const content = messages[1]?.content as {
    type: string;
    text?: string;
    image_url?: { url: string };
  }[];
  return { messages, content, images: content.filter((part) => part.type === "image_url") };
}

describe("referenceDirection", () => {
  it("sends each image as an image_url data URL and returns DNA with forbidden styles merged", async () => {
    const calls: Call[] = [];
    const jpegUrl = `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`;
    const result = await referenceDirection([PNG, jpegUrl], referenceIntent, {
      apiKey: "secret",
      fetchImpl: scriptedChat([{ ok: true, content: JSON.stringify(modelDna) }], calls),
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.x.ai/v1/chat/completions");
    assert.equal(calls[0].headers.Authorization, "Bearer secret");
    assert.equal(calls[0].body.model, "grok-4.5");
    assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
    const { messages, content, images } = imageBlocks(calls[0].body);
    assert.equal(messages[0]?.role, "system");
    assert.equal(typeof messages[0]?.content, "string");
    assert.equal(content[0]?.type, "text");
    assert.match(content[0]?.text ?? "", /Stride/);
    assert.match(content[0]?.text ?? "", /gaming/);
    assert.deepEqual(images, [
      {
        type: "image_url",
        image_url: { url: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}` },
      },
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}` },
      },
    ]);
    assert.deepEqual(result, {
      ok: true,
      dna: { ...modelDna, forbidden: ["neon", "gaming", "pixel-art"] },
    });
  });

  it("parses the first JSON object when json_object is rejected with images", async () => {
    const calls: Call[] = [];
    const prose = `方向如下:\n\`\`\`json\n${JSON.stringify(modelDna)}\n\`\`\`\n{"ignored":true}`;
    const result = await referenceDirection([PNG], referenceIntent, {
      apiKey: "k",
      fetchImpl: scriptedChat(
        [
          { ok: false, content: "response_format is not supported with images" },
          { ok: true, content: prose },
        ],
        calls,
      ),
    });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
    assert.equal(Object.hasOwn(calls[1].body, "response_format"), false);
    assert.equal(imageBlocks(calls[1].body).images.length, 1);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.dna.name, "参考雾蓝");
    assert.equal(result.dna.oneLiner, "a line with } and { braces");
    assert.deepEqual(result.dna.mood, ["quiet"]);
    assert.deepEqual(result.dna.forbidden, ["neon", "gaming", "pixel-art"]);
  });

  it("returns typed errors for unparseable content and network failure", async () => {
    const unparseableCalls: Call[] = [];
    assert.deepEqual(
      await referenceDirection([PNG], referenceIntent, {
        apiKey: "k",
        fetchImpl: scriptedChat([{ ok: true, content: "not json" }], unparseableCalls),
      }),
      { ok: false, error: "unparseable" },
    );
    assert.equal(unparseableCalls.length, 1);

    const schemaCalls: Call[] = [];
    assert.deepEqual(
      await referenceDirection([PNG], referenceIntent, {
        apiKey: "k",
        fetchImpl: scriptedChat([{ ok: true, content: JSON.stringify({ hello: 1 }) }], schemaCalls),
      }),
      { ok: false, error: "unparseable" },
    );

    const badColorCalls: Call[] = [];
    assert.deepEqual(
      await referenceDirection([PNG], referenceIntent, {
        apiKey: "k",
        fetchImpl: scriptedChat(
          [
            {
              ok: true,
              content: JSON.stringify({
                ...modelDna,
                colors: { ...modelDna.colors, primary: "blue" },
              }),
            },
          ],
          badColorCalls,
        ),
      }),
      { ok: false, error: "unparseable" },
    );

    const fallbackCalls: Call[] = [];
    assert.deepEqual(
      await referenceDirection([PNG], referenceIntent, {
        apiKey: "k",
        fetchImpl: scriptedChat(
          [
            { ok: false, content: "rejected" },
            { ok: true, content: "still no object here" },
          ],
          fallbackCalls,
        ),
      }),
      { ok: false, error: "unparseable" },
    );
    assert.equal(fallbackCalls.length, 2);

    const networkCalls: Call[] = [];
    assert.deepEqual(
      await referenceDirection([PNG], referenceIntent, {
        apiKey: "k",
        fetchImpl: scriptedChat(["throw"], networkCalls),
      }),
      { ok: false, error: "network" },
    );
    assert.equal(networkCalls.length, 1);

    const upstreamCalls: Call[] = [];
    assert.deepEqual(
      await referenceDirection([PNG], referenceIntent, {
        apiKey: "k",
        fetchImpl: scriptedChat(
          [
            { ok: false, content: "rejected" },
            { ok: false, content: "still down" },
          ],
          upstreamCalls,
        ),
      }),
      { ok: false, error: "upstream" },
    );

    let called = false;
    assert.deepEqual(
      await referenceDirection([PNG], referenceIntent, {
        apiKey: "",
        fetchImpl: async () => {
          called = true;
          throw new Error("unreachable");
        },
      }),
      { ok: false, error: "no_key" },
    );
    assert.equal(called, false);
  });

  it("does not send a non-jpeg or non-png image to the model", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      throw new Error("unreachable");
    };
    const opts = { apiKey: "k", fetchImpl };
    const lyingJpeg = `data:image/jpeg;base64,${Buffer.from(GIF).toString("base64")}`;
    assert.deepEqual(await referenceDirection([GIF], referenceIntent, opts), {
      ok: false,
      error: "invalid_image",
    });
    assert.deepEqual(await referenceDirection([lyingJpeg], referenceIntent, opts), {
      ok: false,
      error: "invalid_image",
    });
    assert.deepEqual(await referenceDirection([PNG, GIF], referenceIntent, opts), {
      ok: false,
      error: "invalid_image",
    });
    assert.deepEqual(await referenceDirection([], referenceIntent, opts), {
      ok: false,
      error: "invalid_image",
    });
    assert.deepEqual(
      await referenceDirection(["https://example.com/a.png"], referenceIntent, opts),
      {
        ok: false,
        error: "invalid_image",
      },
    );
    assert.equal(called, false);
  });
});
