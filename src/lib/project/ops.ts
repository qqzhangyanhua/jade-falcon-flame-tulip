import { diffDna, type DnaChange, type StyleDna } from "./dna.ts";
import {
  currentDna,
  emptyAsset,
  emptyAssets,
  type ImageRev,
  type Project,
  type Slot,
  type StyleBranch,
} from "./schema.ts";

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
