import { diffDna, type DnaChange, type StyleDna } from "./dna.ts";
import {
  adoptedRev,
  currentDna,
  emptyAsset,
  emptyAssets,
  type Asset,
  type CustomSlot,
  type ImageRev,
  type Project,
  type Slot,
  type StyleBranch,
} from "./schema.ts";
import { builtinSlot, isSlotAspect } from "./slots.ts";

export type ProjectOpDeps = {
  newId?: (prefix: string) => string;
  now?: () => number;
};

function newId(deps: ProjectOpDeps | undefined, prefix: string): string {
  return deps?.newId ? deps.newId(prefix) : `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function now(deps: ProjectOpDeps | undefined): number {
  return deps?.now ? deps.now() : Date.now();
}

function mapStyle(
  project: Project,
  styleId: string,
  fn: (style: StyleBranch) => StyleBranch,
): Project {
  if (!project.styles.some((style) => style.id === styleId)) return project;
  return {
    ...project,
    styles: project.styles.map((style) => (style.id === styleId ? fn(style) : style)),
  };
}

function isLive(style: StyleBranch): boolean {
  return style.status !== "archived";
}

export function lockCandidate(
  project: Project,
  candidateId: string,
  deps?: ProjectOpDeps,
): Project {
  const chosen = project.candidates.find((candidate) => candidate.id === candidateId);
  if (!chosen) return project;
  const standbyCandidates = project.candidates
    .filter((candidate) => candidate.id !== candidateId)
    .slice(0, 2);
  const make = (
    candidate: (typeof project.candidates)[number],
    status: StyleBranch["status"],
  ): StyleBranch => ({
    id: newId(deps, "sty"),
    name: candidate.dna.name,
    origin: "candidate",
    status,
    currentRev: 1,
    candidateUrl: candidate.url,
    revs: [
      {
        rev: 1,
        parentRev: null,
        dna: candidate.dna,
        changeLog: "锁定",
        createdAt: now(deps),
      },
    ],
    assets: emptyAssets(),
  });
  const active = make(chosen, "active");
  const standbys = standbyCandidates.map((candidate) => make(candidate, "standby"));
  return {
    ...project,
    phase: "studio",
    currentStyleId: active.id,
    currentSlot: "kv",
    styles: [active, ...standbys],
    mode: "idle",
  };
}

/**
 * Shows a built-in slot. Appends the id when it is new and inserts an empty
 * asset on every style line that does not already have one. Existing images stay.
 */
export type CustomSlotDraft = {
  name: string;
  aspect: string;
  purpose: string;
  extraPrompt?: string;
};

const CUSTOM_NAME_MAX = 40;
const CUSTOM_PURPOSE_MAX = 200;
const CUSTOM_EXTRA_MAX = 400;

/** Why a custom-slot draft cannot be saved, or null when it can. */
export function customSlotIssue(draft: CustomSlotDraft): string | null {
  const name = draft.name.trim();
  const purpose = draft.purpose.trim();
  const extra = (draft.extraPrompt ?? "").trim();
  if (name.length < 1 || name.length > CUSTOM_NAME_MAX) return "名称需要 1–40 个字";
  if (purpose.length < 1 || purpose.length > CUSTOM_PURPOSE_MAX) return "用途说明需要 1–200 个字";
  if (extra.length > CUSTOM_EXTRA_MAX) return "补充提示词最多 400 个字";
  if (!isSlotAspect(draft.aspect)) return "比例只能从支持的列表里选";
  return null;
}

function acceptedCustomFields(draft: CustomSlotDraft): Omit<CustomSlot, "id"> | null {
  if (customSlotIssue(draft)) return null;
  const extra = (draft.extraPrompt ?? "").trim();
  const fields: Omit<CustomSlot, "id"> = {
    name: draft.name.trim(),
    aspect: draft.aspect as CustomSlot["aspect"],
    purpose: draft.purpose.trim(),
  };
  if (extra) fields.extraPrompt = extra;
  return fields;
}

function withSlotAsset(project: Project, slotId: string): StyleBranch[] {
  return project.styles.map((style) => {
    if (style.assets[slotId]) return style;
    return { ...style, assets: { ...style.assets, [slotId]: emptyAsset(slotId) } };
  });
}

/**
 * Adds a custom slot: definition, enabled id, and an empty asset on every
 * style line. Invalid drafts leave the project unchanged.
 */
export function createCustomSlot(
  project: Project,
  draft: CustomSlotDraft,
  deps?: ProjectOpDeps,
): Project {
  const fields = acceptedCustomFields(draft);
  if (!fields) return project;
  const id = newId(deps, "cslot");
  const customSlots = [...(project.customSlots ?? []), { id, ...fields }];
  const enabledSlotIds = project.enabledSlotIds.includes(id)
    ? project.enabledSlotIds
    : [...project.enabledSlotIds, id];
  return { ...project, customSlots, enabledSlotIds, styles: withSlotAsset(project, id) };
}

/** Replaces a custom slot's name, aspect, purpose, and extra prompt. The id and images stay. */
export function editCustomSlot(project: Project, slotId: string, draft: CustomSlotDraft): Project {
  const fields = acceptedCustomFields(draft);
  if (!fields) return project;
  const current = project.customSlots ?? [];
  if (!current.some((slot) => slot.id === slotId)) return project;
  return {
    ...project,
    customSlots: current.map((slot) => (slot.id === slotId ? { id: slotId, ...fields } : slot)),
  };
}

/**
 * Removes a custom slot's definition and takes it off the enabled list.
 * Images stay on the style line. The current slot falls back to the first id
 * still enabled. The last remaining slot cannot be deleted.
 */
export function deleteCustomSlot(project: Project, slotId: string): Project {
  const current = project.customSlots ?? [];
  if (!current.some((slot) => slot.id === slotId)) return project;
  if (project.enabledSlotIds.includes(slotId) && project.enabledSlotIds.length <= 1) return project;
  const enabledSlotIds = project.enabledSlotIds.filter((id) => id !== slotId);
  const currentSlot = project.currentSlot === slotId ? enabledSlotIds[0] : project.currentSlot;
  return {
    ...project,
    customSlots: current.filter((slot) => slot.id !== slotId),
    enabledSlotIds,
    currentSlot,
  };
}

export function enableBuiltinSlot(project: Project, slotId: string): Project {
  if (!builtinSlot(slotId)) return project;
  const enabledSlotIds = project.enabledSlotIds.includes(slotId)
    ? project.enabledSlotIds
    : [...project.enabledSlotIds, slotId];
  let changed = enabledSlotIds !== project.enabledSlotIds;
  const styles = project.styles.map((style) => {
    if (style.assets[slotId]) return style;
    changed = true;
    return {
      ...style,
      assets: { ...style.assets, [slotId]: emptyAsset(slotId) },
    };
  });
  if (!changed) return project;
  return { ...project, enabledSlotIds, styles };
}

/**
 * Hides a slot by taking it off the enabled list. Images stay on the style
 * line. The current slot falls back to the first id still enabled. The last
 * remaining slot cannot be hidden.
 */
export function hideBuiltinSlot(project: Project, slotId: string): Project {
  if (!project.enabledSlotIds.includes(slotId)) return project;
  if (project.enabledSlotIds.length <= 1) return project;
  const enabledSlotIds = project.enabledSlotIds.filter((id) => id !== slotId);
  const currentSlot = project.currentSlot === slotId ? enabledSlotIds[0] : project.currentSlot;
  return { ...project, enabledSlotIds, currentSlot };
}

/** Makes one line the active line; every other live line becomes standby. */
export function setCurrentStyle(project: Project, styleId: string): Project {
  return {
    ...project,
    currentStyleId: styleId,
    styles: project.styles.map((style) =>
      isLive(style) ? { ...style, status: style.id === styleId ? "active" : "standby" } : style,
    ),
  };
}

/** Sets which style rev of a line is being viewed. Unknown revs are ignored. */
export function setStyleRev(project: Project, styleId: string, rev: number): Project {
  return mapStyle(project, styleId, (style) =>
    style.revs.some((record) => record.rev === rev) ? { ...style, currentRev: rev } : style,
  );
}

/**
 * Appends a style rev derived from the viewed rev. The number is always one
 * past the highest existing rev, so writing back from an older rev never
 * collides with a later one.
 */
export function writebackStyle(
  project: Project,
  input: { styleId: string; changeLog: string; dna: StyleDna; changes?: DnaChange[] },
  deps?: ProjectOpDeps,
): Project {
  return mapStyle(project, input.styleId, (style) => {
    const nextRev = Math.max(0, ...style.revs.map((record) => record.rev)) + 1;
    const changes = input.changes ?? diffDna(currentDna(style), input.dna);
    return {
      ...style,
      currentRev: nextRev,
      revs: [
        ...style.revs,
        {
          rev: nextRev,
          parentRev: style.currentRev,
          dna: input.dna,
          changeLog: input.changeLog,
          createdAt: now(deps),
          changes,
        },
      ],
    };
  });
}

export type ArchiveResult =
  | { ok: true; project: Project }
  | { ok: false; reason: "not_found" | "already_archived" | "last_live_style" };

export function archiveStyle(project: Project, styleId: string): ArchiveResult {
  const target = project.styles.find((style) => style.id === styleId);
  if (!target) return { ok: false, reason: "not_found" };
  if (!isLive(target)) return { ok: false, reason: "already_archived" };
  const remaining = project.styles.filter((style) => style.id !== styleId && isLive(style));
  if (remaining.length === 0) return { ok: false, reason: "last_live_style" };

  const archived: Project = {
    ...project,
    styles: project.styles.map((style) =>
      style.id === styleId ? { ...style, status: "archived" as const } : style,
    ),
  };
  if (project.currentStyleId !== styleId) return { ok: true, project: archived };
  return { ok: true, project: setCurrentStyle(archived, remaining[0].id) };
}

export function restoreStyle(project: Project, styleId: string): Project {
  return mapStyle(project, styleId, (style) =>
    style.status === "archived" ? { ...style, status: "standby" } : style,
  );
}

/** Starts a new current line from the rev of `styleId` that is being viewed. */
export function forkStyle(project: Project, styleId: string, deps?: ProjectOpDeps): Project {
  const source = project.styles.find((style) => style.id === styleId);
  if (!source) return project;
  const record = source.revs.find((r) => r.rev === source.currentRev) ?? source.revs.at(-1);
  if (!record) return project;
  const fork: StyleBranch = {
    id: newId(deps, "sty"),
    name: `${source.name} · 分叉`,
    origin: "fork",
    status: "active",
    currentRev: 1,
    candidateUrl: source.candidateUrl,
    revs: [
      {
        rev: 1,
        parentRev: null,
        dna: structuredClone(record.dna),
        changeLog: `分叉自 ${source.name} rev${record.rev}`,
        createdAt: now(deps),
      },
    ],
    assets: emptyAssets(),
  };
  return setCurrentStyle({ ...project, styles: [...project.styles, fork] }, fork.id);
}

export function addImageRevs(
  project: Project,
  input: {
    styleId: string;
    slot: Slot;
    urls: string[];
    action: ImageRev["action"];
    diff: string;
    parentId: string | null;
    writeback?: ImageRev["writeback"];
    jobId?: string;
  },
  deps?: ProjectOpDeps,
): { project: Project; ids: string[] } {
  const ids: string[] = [];
  const next = mapStyle(project, input.styleId, (style) => {
    const asset = style.assets[input.slot] ?? emptyAsset(input.slot);
    const added: ImageRev[] = input.urls.map((url) => {
      const id = newId(deps, "img");
      ids.push(id);
      return {
        id,
        parentId: input.parentId,
        url,
        createdAt: now(deps),
        action: input.action,
        diff: input.diff,
        writeback: input.writeback ?? "none",
        styleRev: style.currentRev,
        jobId: input.jobId,
      };
    });
    return {
      ...style,
      assets: {
        ...style.assets,
        [input.slot]: {
          ...asset,
          revs: [...asset.revs, ...added],
          adoptedId: asset.adoptedId ?? ids[0] ?? null,
        },
      },
    };
  });
  return { project: next, ids };
}

export function adoptImage(
  project: Project,
  styleId: string,
  slot: Slot,
  imageId: string,
): Project {
  return mapStyle(project, styleId, (style) => {
    const asset = style.assets[slot];
    if (!asset || !asset.revs.some((rev) => rev.id === imageId)) return style;
    return { ...style, assets: { ...style.assets, [slot]: { ...asset, adoptedId: imageId } } };
  });
}

export type LineComparison = {
  styleId: string;
  name: string;
  status: StyleBranch["status"];
  image: ImageRev | null;
};

/**
 * One row per live style line, in project order. The image is the slot's
 * adopted rev, or the latest rev when nothing is adopted. Archived lines
 * are left out. A missing asset or an empty rev list is a null image.
 */
export function compareLines(project: Project, slot: Slot): LineComparison[] {
  return project.styles.filter(isLive).map((style) => {
    const asset = style.assets[slot];
    return {
      styleId: style.id,
      name: style.name,
      status: style.status,
      image: asset ? adoptedRev(asset) : null,
    };
  });
}

export type RevTreeNode = {
  rev: ImageRev;
  children: RevTreeNode[];
};

/**
 * Parent links for one slot. A rev whose parent is null or not in this asset is a root.
 * Every rev is included once, including revs from older style versions.
 */
export function revTree(asset: Asset): RevTreeNode[] {
  const byId = new Map(asset.revs.map((rev) => [rev.id, rev]));
  const childIds = new Map<string, string[]>();
  const roots: ImageRev[] = [];

  for (const rev of asset.revs) {
    const parentId = rev.parentId;
    if (parentId && parentId !== rev.id && byId.has(parentId)) {
      const siblings = childIds.get(parentId);
      if (siblings) siblings.push(rev.id);
      else childIds.set(parentId, [rev.id]);
    } else {
      roots.push(rev);
    }
  }

  const placed = new Set<string>();
  const build = (rev: ImageRev): RevTreeNode => {
    placed.add(rev.id);
    const children: RevTreeNode[] = [];
    for (const id of childIds.get(rev.id) ?? []) {
      if (placed.has(id)) continue;
      const child = byId.get(id);
      if (child) children.push(build(child));
    }
    return { rev, children };
  };

  const tree = roots.map(build);
  for (const rev of asset.revs) {
    if (!placed.has(rev.id)) tree.push(build(rev));
  }
  return tree;
}
