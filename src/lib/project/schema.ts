import { z } from "zod";
import { dnaChangeSchema, styleDnaSchema, type StyleDna } from "./dna.ts";
import { DEFAULT_ENABLED_SLOT_IDS, SLOT_IDS, SUPPORTED_ASPECTS } from "./slots.ts";

export { DEFAULT_ENABLED_SLOT_IDS, SLOT_IDS };

export const MAX_REFERENCE_IMAGES = 3;

/** Project names share the 40-character cap used for style DNA names and catalog display names. */
export const PROJECT_NAME_MAX = 40;

export function parseProjectName(raw: string): { ok: true; name: string } | { ok: false } {
  const name = raw.trim();
  if (!name || name.length > PROJECT_NAME_MAX) return { ok: false };
  return { ok: true, name };
}
export const STORED_IMAGE_ADDRESS = /^\/api\/images\/[^/]+$/;

/** Keeps at most three `/api/images/<id>` addresses. Anything else, including a missing field, is dropped. */
export function referenceImageUrlsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && STORED_IMAGE_ADDRESS.test(item))
    .slice(0, MAX_REFERENCE_IMAGES);
}

export const slotSchema = z.string().min(1);
export type Slot = string;

export const customSlotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  aspect: z.enum(SUPPORTED_ASPECTS),
  purpose: z.string().min(1).max(200),
  extraPrompt: z.string().max(400).optional(),
});
export type CustomSlot = z.infer<typeof customSlotSchema>;

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
  assets: z.record(z.string(), assetSchema),
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
const projectDocumentObject = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX),
  brief: z.string(),
  // Image bytes live in image_blobs; the document only holds an /api/images/<id> address.
  prototypeDataUrl: z
    .string()
    .refine((value) => !value.toLowerCase().startsWith("data:"), {
      message: "prototype must be a stored image address, not a data: URL",
    })
    .nullable(),
  // Old documents omit this. Bytes stay in image_blobs; only /api/images/<id> is stored.
  referenceImageUrls: z
    .array(z.string().regex(STORED_IMAGE_ADDRESS))
    .max(MAX_REFERENCE_IMAGES)
    .default([]),
  createdAt: z.number(),
  currentStyleId: z.string().nullable(),
  currentSlot: slotSchema,
  enabledSlotIds: z.array(z.string().min(1)).min(1),
  /** Custom deliverables. Missing on old documents, which parse as none. */
  customSlots: z.array(customSlotSchema).default([]),
  currentImageModelId: z.string(),
  phase: z.enum(["brief", "direction", "studio"]),
  intent: briefIntentSchema.nullable(),
  candidates: z.array(candidateSchema),
  styles: z.array(styleBranchSchema),
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEnabledSlotIds(value: unknown): string[] | null {
  if (value === undefined) return [...DEFAULT_ENABLED_SLOT_IDS];
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((id) => typeof id === "string" && id.length > 0)) return null;
  return [...value];
}

function blankAsset(slot: string): { slot: string; adoptedId: null; revs: [] } {
  return { slot, adoptedId: null, revs: [] };
}

function withEnabledAssets(style: unknown, enabled: string[]): unknown {
  if (!isPlainObject(style)) return style;
  if (style.assets == null) {
    const assets: Record<string, unknown> = {};
    for (const id of enabled) assets[id] = blankAsset(id);
    return { ...style, assets };
  }
  if (!isPlainObject(style.assets)) return style;
  const assets = { ...style.assets };
  for (const id of enabled) {
    if (assets[id] == null) assets[id] = blankAsset(id);
  }
  return { ...style, assets };
}

/**
 * Old documents have no enabled-slot list and a fixed 3-key asset object.
 * Fill the default list, point currentSlot at an enabled id, and insert an
 * empty asset for every enabled id that is missing. Other asset keys stay.
 */
export function normalizeProjectDocument<T>(input: T): T {
  if (!isPlainObject(input)) return input;
  const enabledSlotIds = readEnabledSlotIds(input.enabledSlotIds);
  if (!enabledSlotIds) return input;
  const requested = input.currentSlot;
  const currentSlot =
    typeof requested === "string" && enabledSlotIds.includes(requested)
      ? requested
      : enabledSlotIds[0];
  const styles = Array.isArray(input.styles)
    ? input.styles.map((style) => withEnabledAssets(style, enabledSlotIds))
    : input.styles;
  const customSlots = input.customSlots === undefined ? [] : input.customSlots;
  // A product name copied onto the project can be longer than the rename cap.
  // Shorten it here so an older document can still be saved; rename itself rejects overflow.
  const name =
    typeof input.name === "string" ? input.name.trim().slice(0, PROJECT_NAME_MAX) : input.name;
  return { ...input, name, enabledSlotIds, currentSlot, styles, customSlots };
}

export const projectDocumentSchema = z.preprocess(normalizeProjectDocument, projectDocumentObject);
export type ProjectDocument = z.infer<typeof projectDocumentSchema>;

export type Project = ProjectDocument & {
  mode: "idle" | "tailoring" | "generating" | "editing";
};

export type { StyleDna };

export function emptyAsset(slot: Slot): Asset {
  return { slot, adoptedId: null, revs: [] };
}

export function emptyAssets(): Record<string, Asset> {
  return Object.fromEntries(DEFAULT_ENABLED_SLOT_IDS.map((id) => [id, emptyAsset(id)]));
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
