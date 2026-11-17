"use server";

import { requireActionUser } from "@/lib/auth/session";
import { styleDnaSchema } from "@/lib/project/dna";
import { mergeInstruction, type MergeResult } from "@/lib/style-ai";

const INSTRUCTION_MAX_CHARS = 500;

/** Merges a write-back instruction into a DNA. Chat only: never touches image quota. */
export async function mergeStyleInstructionFn(input: {
  data: { dna: unknown; instruction: string };
}): Promise<MergeResult> {
  await requireActionUser();
  const dna = styleDnaSchema.safeParse(input.data.dna);
  const instruction = typeof input.data.instruction === "string" ? input.data.instruction.trim() : "";
  if (!dna.success || !instruction || instruction.length > INSTRUCTION_MAX_CHARS) {
    return { ok: false, error: "invalid_schema" };
  }
  return mergeInstruction(dna.data, instruction);
}
