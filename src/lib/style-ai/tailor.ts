import { PRESETS } from "../presets.ts";
import { styleDnaSchema, type StyleDna } from "../project/dna.ts";
import type { BriefIntent } from "../types.ts";
import { chatJson, type ChatOptions } from "./chat.ts";
import { hasValidColors, withUserIntent, type TailoredDirection } from "./shared.ts";

export type { TailoredDirection } from "./shared.ts";

// Four full style DNAs (prompt text, colours, lists) come to well over 2k tokens.
const TAILOR_DIRECTIONS_MAX_TOKENS = 6000;

function tailoringPrompt(intent: BriefIntent): string {
  const presets = PRESETS.map((p) => ({ presetId: p.id, dna: p.dna }));
  return [
    "You are a brand art director. Below are four preset visual directions (style DNA) and a parsed product brief.",
    "Tailor each preset to the brief: adapt name, oneLiner, colors, mood, promptPositive and promptNegative so the direction fits the product category, audience, platform and mood.",
    "Each tailored direction MUST keep the distinguishing character of its preset (light, material, geometry, density, type mood, overall palette temperature) so the four stay clearly different from each other.",
    "Colors must be 6-digit hex values like #1F3A5F. Never use any style listed in the brief's forbidden list.",
    'Reply with JSON: {"directions":[{"presetId":"<id>","dna":{...full style DNA with the same keys as the preset...}}, ...]} containing exactly the four presetIds.',
    `Presets: ${JSON.stringify(presets)}`,
    `Brief: ${JSON.stringify(intent)}`,
  ].join("\n");
}

function readTailoredDna(value: unknown): StyleDna | null {
  const parsed = styleDnaSchema.safeParse(value);
  return parsed.success && hasValidColors(parsed.data) ? parsed.data : null;
}

/**
 * Tailors the four preset directions to the parsed brief. Never throws: any
 * direction the model fails to deliver validly is replaced by its preset with
 * the user's mood and forbidden styles merged in. The user's forbidden styles
 * are enforced on every direction regardless of what the model returned.
 */
export async function tailorDirections(
  intent: BriefIntent,
  opts?: ChatOptions,
): Promise<TailoredDirection[]> {
  const res = await chatJson({
    ...opts,
    maxTokens: TAILOR_DIRECTIONS_MAX_TOKENS,
    prompt: tailoringPrompt(intent),
  });

  const reply = res.ok ? (res.value as { directions?: unknown } | null) : null;
  const items = Array.isArray(reply?.directions) ? (reply.directions as unknown[]) : [];
  const tailored = new Map<string, StyleDna>();
  for (const item of items) {
    const { presetId, dna } = (item ?? {}) as { presetId?: unknown; dna?: unknown };
    if (typeof presetId !== "string" || tailored.has(presetId)) continue;
    const valid = readTailoredDna(dna);
    if (valid) tailored.set(presetId, valid);
  }

  return PRESETS.map((p) => {
    const dna = tailored.get(p.id);
    return {
      presetId: p.id,
      dna: dna ? withUserIntent(dna, intent, false) : withUserIntent(p.dna, intent, true),
    };
  });
}
