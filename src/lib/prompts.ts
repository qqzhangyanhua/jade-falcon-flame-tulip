import type { Slot, StyleDna } from "./types";

export function candidatePrompt(dna: StyleDna, product: string): string {
  return [
    `A single cinematic presentation board, 16:9, split cleanly in two halves.`,
    `LEFT HALF: a realistic high-fidelity smartphone UI screenshot of "${product}" home screen.`,
    `Real mobile app interface, status bar, navigation, cards, typography, not a 3D phone mock floating in space.`,
    `RIGHT HALF: a brand key visual / campaign poster for the same product, large type, one hero still-life or figure, generous composition.`,
    `Both halves share ONE visual system: ${dna.promptPositive}.`,
    `Palette strictly: background ${dna.colors.bg}, surface ${dna.colors.surface}, text ${dna.colors.text}, primary ${dna.colors.primary}, accent ${dna.colors.accent}.`,
    `Mood: ${dna.mood.join(", ")}. Lighting: ${dna.light}. Material: ${dna.material}. Density: ${dna.density}. Geometry: ${dna.geometry}.`,
    `Style name feeling: ${dna.name} — ${dna.oneLiner}.`,
    `No logos of real brands. No watermark. No split-screen device photo studio. Avoid: ${dna.promptNegative}, ${dna.forbidden.join(", ")}.`,
  ].join(" ");
}

export function slotPrompt(
  dna: StyleDna,
  slot: Slot,
  product: string,
  content: string,
): string {
  const extra = content.trim() ? `Headline / offer: "${content.trim()}".` : "";
  const shared = [
    `Visual system: ${dna.promptPositive}.`,
    `Palette: bg ${dna.colors.bg}, surface ${dna.colors.surface}, text ${dna.colors.text}, primary ${dna.colors.primary}, accent ${dna.colors.accent}.`,
    `Lighting ${dna.light}, material ${dna.material}, density ${dna.density}, geometry ${dna.geometry}.`,
    extra,
    `Avoid: ${dna.promptNegative}, ${dna.forbidden.join(", ")}. No real-brand logos, no watermark.`,
  ].join(" ");

  if (slot === "ui_hero") {
    return `High-fidelity mobile app UI screenshot of "${product}" flagship home screen, full-bleed interface, realistic iOS/Android UI, readable Chinese or English UI copy, not a poster. ${shared}`;
  }
  if (slot === "kv") {
    return `Brand key visual poster for "${product}", cinematic still, large refined typography, one hero subject, campaign-quality, 16:9. ${shared}`;
  }
  return `Website homepage hero, 16:9 desktop screenshot of "${product}" marketing site, navigation, headline, CTA, hero image, realistic web UI. ${shared}`;
}

export function tunePrompt(dna: StyleDna, instruction: string): string {
  return `Edit this design image. Keep the same product, layout structure, and brand. ${instruction}. Stay inside the visual system: ${dna.promptPositive}. Palette ${dna.colors.bg} / ${dna.colors.primary} / ${dna.colors.accent}. Avoid ${dna.promptNegative}.`;
}

export const SLOT_ASPECT: Record<Slot | "candidate", string> = {
  candidate: "16:9",
  ui_hero: "9:16",
  kv: "16:9",
  web_home: "16:9",
};
