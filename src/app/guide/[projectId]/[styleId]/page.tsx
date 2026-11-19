import { notFound, redirect } from "next/navigation";
import { BrandGuideSheet } from "@/components/brand-guide-sheet";
import { SIGN_IN_PATH } from "@/lib/auth/gates";
import { requireActionUser } from "@/lib/auth/session";
import { UnauthorizedError } from "@/lib/auth/verify.server";
import { getSql } from "@/lib/db";
import { loadProjectDocument } from "@/lib/image-jobs/project-document";
import { createSqlProjectStore } from "@/lib/image-jobs/sql";
import { resolveBrandGuideAccess, styleForGuide } from "@/lib/project/brand-guide-access";
import { brandGuideModel, type PromptSlot } from "@/lib/project/dna-export";
import { currentDna, type ProjectDocument } from "@/lib/project/schema";
import { builtinSlot } from "@/lib/project/slots";

export const dynamic = "force-dynamic";

function customSlotMetas(document: ProjectDocument): PromptSlot[] {
  const raw = (document as { customSlots?: unknown }).customSlots;
  if (!Array.isArray(raw)) return [];
  const metas: PromptSlot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const slot = item as Record<string, unknown>;
    if (typeof slot.id !== "string" || slot.id.length === 0) continue;
    if (typeof slot.name !== "string" || slot.name.length === 0) continue;
    metas.push({
      id: slot.id,
      name: slot.name,
      aspect: typeof slot.aspect === "string" && slot.aspect.length > 0 ? slot.aspect : "1:1",
      purpose: typeof slot.purpose === "string" ? slot.purpose : "",
    });
  }
  return metas;
}

function slotsForGuide(document: ProjectDocument): PromptSlot[] {
  const custom = customSlotMetas(document);
  return document.enabledSlotIds.map((id) => {
    const extra = custom.find((slot) => slot.id === id);
    if (extra) return extra;
    const builtin = builtinSlot(id);
    if (!builtin) return { id, name: id, aspect: "1:1", purpose: "" };
    return {
      id: builtin.id,
      name: builtin.name,
      aspect: builtin.aspect,
      purpose: builtin.purpose,
    };
  });
}

export default async function BrandGuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; styleId: string }>;
  searchParams: Promise<{ rev?: string | string[] }>;
}) {
  const { projectId, styleId } = await params;
  const { rev: revParam } = await searchParams;

  let userId: string | null = null;
  try {
    userId = (await requireActionUser()).userId;
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) throw error;
  }

  if (!userId) {
    const decision = resolveBrandGuideAccess({
      signedIn: false,
      code: null,
      hasDocument: false,
      hasStyle: false,
    });
    if (decision === "redirect") redirect(SIGN_IN_PATH);
    notFound();
  }

  const sql = await getSql();
  const loaded = await loadProjectDocument(
    { projects: createSqlProjectStore(sql) },
    { userId, projectId: projectId.trim() },
  );
  const document = loaded.ok ? loaded.value.document : null;
  const style = document?.styles.find((line) => line.id === styleId) ?? null;
  const decision = resolveBrandGuideAccess({
    signedIn: true,
    code: loaded.ok ? "ok" : loaded.code,
    hasDocument: document !== null,
    hasStyle: style !== null,
  });
  if (decision !== "show" || !document || !style) notFound();

  const viewed = styleForGuide(style, revParam);
  let dna;
  try {
    dna = currentDna(viewed);
  } catch {
    notFound();
  }
  const guide = brandGuideModel(viewed, slotsForGuide(document));

  return (
    <BrandGuideSheet
      guide={guide}
      projectName={document.name}
      styleName={style.name}
      rev={viewed.currentRev}
      dnaName={dna.name}
      oneLiner={dna.oneLiner}
    />
  );
}
