import { z } from "zod";
import { dnaChangeSchema, styleDnaSchema, type StyleDna } from "./dna.ts";

export const SLOT_IDS = ["ui_hero", "kv", "web_home"] as const;

export const slotSchema = z.enum(SLOT_IDS);
export type Slot = z.infer<typeof slotSchema>;

export const imageRevSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  url: z.string(),
  createdAt: z.number(),
  action: z.enum(["generate", "tune", "compose"]),
  diff: z.string(),
  writeback: z.enum(["none", "promoted"]),
  styleRev: z.number(),
  jobId: z.string().optional(),
});
export type ImageRev = z.infer<typeof imageRevSchema>;

export const assetSchema = z.object({
  slot: slotSchema,
  adoptedId: z.string().nullable(),
  revs: z.array(imageRevSchema),
});
export type Asset = z.infer<typeof assetSchema>;

export const styleRevRecordSchema = z.object({
  rev: z.number().int(),
  parentRev: z.number().int().nullable(),
  dna: styleDnaSchema,
  changeLog: z.string(),
  createdAt: z.number(),
  // Absent on revs saved before changes were recorded.
  changes: z.array(dnaChangeSchema).optional(),
});
export type StyleRevRecord = z.infer<typeof styleRevRecordSchema>;

export const styleBranchSchema = z.object({
  id: z.string(),
  name: z.string(),
  origin: z.enum(["candidate", "fork"]),
  status: z.enum(["active", "standby", "archived"]),
  currentRev: z.number().int(),
  revs: z.array(styleRevRecordSchema),
  assets: z.object({
    ui_hero: assetSchema,
    kv: assetSchema,
    web_home: assetSchema,
  }),
  candidateUrl: z.string().nullable(),
});
export type StyleBranch = z.infer<typeof styleBranchSchema>;

export const candidateSchema = z.object({
  id: z.string(),
  presetId: z.string(),
  dna: styleDnaSchema,
  url: z.string().nullable(),
  status: z.enum(["pending", "ready", "error"]),
});
export type Candidate = z.infer<typeof candidateSchema>;

export const briefIntentSchema = z.object({
  productName: z.string(),
  category: z.string(),
  audience: z.string(),
  platform: z.enum(["app", "web"]),
  mood: z.array(z.string()),
  forbidden: z.array(z.string()),
});
export type BriefIntent = z.infer<typeof briefIntentSchema>;

/**
 * The persisted shape of a Project. `mode` is UI state and is deliberately
 * absent, so a parsed document never carries a generating/editing flag.
 */
export const projectDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  brief: z.string(),
  // Image bytes live in image_blobs; the document only holds an /api/images/<id> address.
  prototypeDataUrl: z
    .string()
    .refine((value) => !value.toLowerCase().startsWith("data:"), {
      message: "prototype must be a stored image address, not a data: URL",
    })
    .nullable(),
  createdAt: z.number(),
  currentStyleId: z.string().nullable(),
  currentSlot: slotSchema,
  currentImageModelId: z.string(),
  phase: z.enum(["brief", "direction", "studio"]),
  intent: briefIntentSchema.nullable(),
  candidates: z.array(candidateSchema),
  styles: z.array(styleBranchSchema),
});
export type ProjectDocument = z.infer<typeof projectDocumentSchema>;

export type Project = ProjectDocument & {
  mode: "idle" | "tailoring" | "generating" | "editing";
};

export type { StyleDna };

export function emptyAsset(slot: Slot): Asset {
  return { slot, adoptedId: null, revs: [] };
}

export function emptyAssets(): Record<Slot, Asset> {
  return {
    ui_hero: emptyAsset("ui_hero"),
    kv: emptyAsset("kv"),
    web_home: emptyAsset("web_home"),
  };
}

export function currentDna(branch: StyleBranch): StyleDna {
  const rec = branch.revs.find((r) => r.rev === branch.currentRev) ?? branch.revs.at(-1);
  if (!rec) throw new Error("style has no rev");
  return rec.dna;
}

export function adoptedRev(asset: Asset): ImageRev | null {
  if (!asset.adoptedId) return asset.revs.at(-1) ?? null;
  return asset.revs.find((r) => r.id === asset.adoptedId) ?? asset.revs.at(-1) ?? null;
}
