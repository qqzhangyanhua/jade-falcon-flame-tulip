"use server";

import { requireActionUser } from "@/lib/auth/session";
import { parseBrief as parseBriefWithModel } from "@/lib/style-ai";
import type { BriefIntent } from "@/lib/types";

export async function parseBrief(input: { data: { brief: string } }): Promise<BriefIntent> {
  await requireActionUser();
  return parseBriefWithModel(input.data.brief);
}
