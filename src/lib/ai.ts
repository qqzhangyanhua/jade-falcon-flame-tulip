import { createServerFn } from "@tanstack/react-start";
import { fallbackBoardSvg } from "./fallback-board";
import { PRESETS } from "./presets";
import { candidatePrompt, slotPrompt, SLOT_ASPECT, tunePrompt } from "./prompts";
import type { BriefIntent, Slot, StyleDna } from "./types";

const IMAGE_MODEL = "grok-imagine-image-2.0";
const CHAT_MODEL = "grok-4.5";

function key(): string | undefined {
  return process.env.XAI_API_KEY?.trim() || undefined;
}

async function chatJson(prompt: string): Promise<unknown> {
  const apiKey = key();
  if (!apiKey) return null;
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return only valid JSON. No markdown." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type GenResult = { ok: true; url: string; source: "ai" | "fallback" };

async function generateImage(opts: {
  prompt: string;
  aspect: string;
  n?: number;
}): Promise<{ urls: string[] } | { error: string }> {
  const apiKey = key();
  if (!apiKey) return { error: "missing-key" };
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: opts.prompt,
      n: opts.n ?? 1,
      resolution: "1K",
      aspect_ratio: opts.aspect,
      response_format: "url",
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { error: `image ${res.status} ${t.slice(0, 180)}` };
  }
  const body = (await res.json()) as {
    data?: { url?: string; b64_json?: string }[];
  };
  const urls = (body.data ?? [])
    .map((d) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : ""))
    .filter(Boolean);
  if (!urls.length) return { error: "empty-image" };
  return { urls };
}

async function editImage(opts: {
  prompt: string;
  imageUrl: string;
  aspect: string;
}): Promise<{ urls: string[] } | { error: string }> {
  const apiKey = key();
  if (!apiKey) return { error: "missing-key" };
  const res = await fetch("https://api.x.ai/v1/images/edits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: opts.prompt,
      image: { url: opts.imageUrl, type: "image_url" },
      resolution: "1K",
      aspect_ratio: opts.aspect,
      response_format: "url",
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { error: `edit ${res.status} ${t.slice(0, 180)}` };
  }
  const body = (await res.json()) as {
    data?: { url?: string; b64_json?: string }[];
  };
  const urls = (body.data ?? [])
    .map((d) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : ""))
    .filter(Boolean);
  if (!urls.length) return { error: "empty-edit" };
  return { urls };
}

export const parseBrief = createServerFn({ method: "POST" })
  .validator((input: { brief: string }) => input)
  .handler(async ({ data }): Promise<BriefIntent> => {
    const parsed = (await chatJson(
      `Extract a product visual brief from this Chinese/English description. JSON keys: productName, category, audience, platform ("app"|"web"), mood (2 short english words), forbidden (up to 3 english style words to avoid).\nText: ${data.brief}`,
    )) as Partial<BriefIntent> | null;
    return {
      productName: parsed?.productName || data.brief.slice(0, 20) || "未命名产品",
      category: parsed?.category || "product",
      audience: parsed?.audience || "general",
      platform: parsed?.platform === "web" ? "web" : "app",
      mood: parsed?.mood?.length ? parsed.mood : ["clear", "modern"],
      forbidden: parsed?.forbidden ?? [],
    };
  });

export const generateCandidate = createServerFn({ method: "POST" })
  .validator((input: { presetId: string; product: string }) => input)
  .handler(async ({ data }): Promise<GenResult> => {
    const preset = PRESETS.find((p) => p.id === data.presetId) ?? PRESETS[0];
    const prompt = candidatePrompt(preset.dna, data.product);
    const result = await generateImage({ prompt, aspect: SLOT_ASPECT.candidate, n: 1 });
    if ("urls" in result) return { ok: true, url: result.urls[0], source: "ai" };
    return {
      ok: true,
      url: fallbackBoardSvg({ dna: preset.dna, title: data.product, kind: "candidate" }),
      source: "fallback",
    };
  });

export const generateSlotFn = createServerFn({ method: "POST" })
  .validator((input: { dna: StyleDna; slot: Slot; product: string; content: string; refUrl?: string | null }) => input)
  .handler(async ({ data }): Promise<{ ok: true; urls: string[] }> => {
    const prompt = slotPrompt(data.dna, data.slot, data.product, data.content);
    const aspect = SLOT_ASPECT[data.slot];
    if (data.refUrl && !data.refUrl.startsWith("data:image/svg")) {
      const edited = await editImage({
        prompt: `${prompt} Keep the same visual DNA as the reference. ${data.slot === "ui_hero" ? "Preserve layout structure if the reference is a wireframe." : "Match color, light, and material of the reference."}`,
        imageUrl: data.refUrl,
        aspect,
      });
      if ("urls" in edited) return { ok: true, urls: edited.urls.slice(0, 2) };
    }
    const result = await generateImage({ prompt, aspect, n: 2 });
    if ("urls" in result) return { ok: true, urls: result.urls.slice(0, 2) };
    return {
      ok: true,
      urls: [
        fallbackBoardSvg({ dna: data.dna, title: data.product, kind: data.slot }),
        fallbackBoardSvg({ dna: data.dna, title: `${data.product} · B`, kind: data.slot }),
      ],
    };
  });

export const tuneImageFn = createServerFn({ method: "POST" })
  .validator((input: { dna: StyleDna; imageUrl: string; instruction: string; slot: Slot }) => input)
  .handler(async ({ data }): Promise<GenResult> => {
    const prompt = tunePrompt(data.dna, data.instruction);
    if (!data.imageUrl.startsWith("data:image/svg")) {
      const edited = await editImage({
        prompt,
        imageUrl: data.imageUrl,
        aspect: SLOT_ASPECT[data.slot],
      });
      if ("urls" in edited) return { ok: true, url: edited.urls[0], source: "ai" };
    }
    return {
      ok: true,
      url: fallbackBoardSvg({
        dna: data.dna,
        title: data.instruction.slice(0, 18) || "tune",
        kind: data.slot,
      }),
      source: "fallback",
    };
  });
