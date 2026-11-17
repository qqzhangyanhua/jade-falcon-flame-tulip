"use server";

import { requireActionUser } from "@/lib/auth/session";
import {
  parseBrief as parseBriefWithModel,
  tailorDirections as tailorDirectionsWithModel,
  type TailoredDirection,
} from "@/lib/style-ai";
import { briefIntentInputSchema } from "@/lib/style-ai/shared";
import type { BriefIntent } from "@/lib/types";

const BRIEF_MAX_CHARS = 2000;

export async function parseBrief(input: { data: { brief: string } }): Promise<BriefIntent> {
  await requireActionUser();
  const brief = typeof input.data.brief === "string" ? input.data.brief.slice(0, BRIEF_MAX_CHARS) : "";
  return parseBriefWithModel(brief);
}

export async function tailorDirections(input: {
  data: { intent: BriefIntent };
}): Promise<TailoredDirection[]> {
  await requireActionUser();
  const intent = briefIntentInputSchema.safeParse(input.data.intent);
  // Nothing is spent on a malformed intent; the caller's catch falls back to preset directions.
  if (!intent.success) throw new Error("invalid_intent");
  return tailorDirectionsWithModel(intent.data);
}
