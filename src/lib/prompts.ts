import { BUILTIN_SLOTS, customSlotPromptLead, DIRECTION_ASPECT } from "./project/slots.ts";
import type { Slot, StyleDna } from "./types";

export type SlotPromptFields = {
  name: string;
  purpose: string;
  extraPrompt?: string;
};

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
  custom?: SlotPromptFields,
): string {
  const extra = content.trim() ? `Headline / offer: "${content.trim()}".` : "";
  const shared = [
    `Visual system: ${dna.promptPositive}.`,
    `Palette: bg ${dna.colors.bg}, surface ${dna.colors.surface}, text ${dna.colors.text}, primary ${dna.colors.primary}, accent ${dna.colors.accent}.`,
    `Lighting ${dna.light}, material ${dna.material}, density ${dna.density}, geometry ${dna.geometry}.`,
    extra,
    `Avoid: ${dna.promptNegative}, ${dna.forbidden.join(", ")}. No real-brand logos, no watermark.`,
  ].join(" ");

  const builtin = BUILTIN_SLOTS.find((item) => item.id === slot);
  const lead = builtin
    ? builtin.promptTemplate.replaceAll("{product}", product)
    : custom
      ? customSlotPromptLead(custom, product)
      : (BUILTIN_SLOTS.find((item) => item.id === "web_home")?.promptTemplate ?? "").replaceAll(
          "{product}",
          product,
        );
  return `${lead} ${shared}`;
}

export function tunePrompt(dna: StyleDna, instruction: string): string {
  return `Edit this design image. Keep the same product, layout structure, and brand. ${instruction}. Stay inside the visual system: ${dna.promptPositive}. Palette ${dna.colors.bg} / ${dna.colors.primary} / ${dna.colors.accent}. Avoid ${dna.promptNegative}.`;
}

export const TUNE_INSTRUCTION_MAX_LENGTH = 400;

export type TuneSliders = {
  brightness: number;
  warmth: number;
  contrast: number;
};

const SLIDER_CENTER = 50;

function sliderAdjustmentText(sliders: TuneSliders): string {
  const bits: string[] = [];
  if (sliders.brightness !== SLIDER_CENTER) {
    bits.push(sliders.brightness > SLIDER_CENTER ? "brighter" : "darker");
  }
  if (sliders.warmth !== SLIDER_CENTER) {
    bits.push(
      sliders.warmth > SLIDER_CENTER ? "warmer color temperature" : "cooler color temperature",
    );
  }
  if (sliders.contrast !== SLIDER_CENTER) {
    bits.push(sliders.contrast > SLIDER_CENTER ? "higher contrast" : "softer contrast");
  }
  return bits.length ? `Adjust: ${bits.join(", ")}. Keep composition.` : "";
}

export function mergeTuneInstruction(freeText: string, sliders: TuneSliders): string {
  const text = freeText.trim();
  const slider = sliderAdjustmentText(sliders);
  if (!text) return slider;
  if (!slider) return text;
  return `${text} ${slider}`;
}

export function canSubmitTuneInstruction(instruction: string): boolean {
  const text = instruction.trim();
  return text.length > 0 && text.length <= TUNE_INSTRUCTION_MAX_LENGTH;
}

export function canSubmitCopyRewrite(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= TUNE_INSTRUCTION_MAX_LENGTH;
}

export function copyRewriteInstruction(text: string): string {
  const trimmed = text.trim();
  return `Keep the layout, the picture, and the palette. Replace the title or copy with: "${trimmed}".`;
}

export const SLOT_ASPECT: Record<string, string> = {
  candidate: DIRECTION_ASPECT,
  ...Object.fromEntries(BUILTIN_SLOTS.map((slot) => [slot.id, slot.aspect])),
};
