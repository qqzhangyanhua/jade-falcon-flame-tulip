import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type BriefIntent,
  type Candidate,
  type ImageRev,
  type Project,
  type Slot,
  type StyleBranch,
  type StyleDna,
  adoptedRev,
  currentDna,
} from "./types";
import {
  addImageRevs,
  adoptImage,
  archiveStyle,
  forkStyle,
  lockCandidate,
  restoreStyle,
  setCurrentStyle,
  setStyleRev,
  writebackStyle,
} from "./project/ops.ts";
import type { ArchiveResult } from "./project/ops.ts";
import { uid } from "./utils";

type State = {
  projects: Project[];
  currentId: string | null;
  current: () => Project | null;
  currentStyle: () => StyleBranch | null;
  createProject: (input: {
    brief: string;
    prototypeDataUrl: string | null;
    id?: string;
    currentImageModelId?: string;
  }) => string;
  setCurrentImageModel: (modelId: string) => void;
  setPhase: (phase: Project["phase"]) => void;
  setIntent: (intent: BriefIntent) => void;
  setCandidates: (candidates: Candidate[]) => void;
  patchCandidate: (id: string, patch: Partial<Candidate>) => void;
  lockCandidate: (candidateId: string) => void;
  setCurrentStyle: (styleId: string) => void;
  setSlot: (slot: Slot) => void;
  setMode: (mode: Project["mode"]) => void;
  addImageRevs: (opts: {
    styleId: string;
    slot: Slot;
    urls: string[];
    action: ImageRev["action"];
    diff: string;
    parentId: string | null;
    writeback?: ImageRev["writeback"];
    jobId?: string;
  }) => string[];
  adoptImage: (styleId: string, slot: Slot, imageId: string) => void;
  writebackStyle: (opts: { styleId: string; changeLog: string; dna: StyleDna }) => void;
  setStyleRev: (styleId: string, rev: number) => void;
  archiveStyle: (styleId: string) => ArchiveOutcome;
  restoreStyle: (styleId: string) => void;
  forkStyle: (styleId: string) => void;
  removeProject: (id: string) => void;
};

export type ArchiveOutcome = { ok: true } | Extract<ArchiveResult, { ok: false }>;

type StoreSet = (fn: (state: State) => Partial<State>) => void;

function update(set: StoreSet, get: () => State, fn: (project: Project) => Project): void {
  const id = get().currentId;
  if (!id) return;
  set((s) => ({ projects: patchProject(s.projects, id, fn) }));
}

function patchProject(projects: Project[], id: string, fn: (p: Project) => Project): Project[] {
  return projects.map((p) => (p.id === id ? fn(p) : p));
}

export const useStudio = create<State>()(
  persist(
    (set, get) => ({
      projects: [],
      currentId: null,
      current: () => get().projects.find((p) => p.id === get().currentId) ?? null,
      currentStyle: () => {
        const p = get().current();
        if (!p?.currentStyleId) return null;
        return p.styles.find((s) => s.id === p.currentStyleId) ?? null;
      },
      createProject: ({ brief, prototypeDataUrl, id: givenId, currentImageModelId }) => {
        const id = givenId ?? uid("prj");
        const name = brief.trim().slice(0, 24) || "未命名项目";
        const project: Project = {
          id,
          name,
          brief: brief.trim(),
          prototypeDataUrl,
          createdAt: Date.now(),
          currentStyleId: null,
          currentSlot: "kv",
          currentImageModelId: currentImageModelId ?? "",
          phase: "direction",
          intent: null,
          candidates: [],
          styles: [],
          mode: "idle",
        };
        set((s) => ({ projects: [project, ...s.projects], currentId: id }));
        return id;
      },
      setCurrentImageModel: (modelId) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({
          projects: patchProject(s.projects, id, (p) => ({
            ...p,
            currentImageModelId: modelId,
          })),
        }));
      },
      setPhase: (phase) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({ projects: patchProject(s.projects, id, (p) => ({ ...p, phase })) }));
      },
      setIntent: (intent) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({
          projects: patchProject(s.projects, id, (p) => ({ ...p, intent, name: intent.productName || p.name })),
        }));
      },
      setCandidates: (candidates) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({ projects: patchProject(s.projects, id, (p) => ({ ...p, candidates })) }));
      },
      patchCandidate: (cid, patch) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({
          projects: patchProject(s.projects, id, (p) => ({
            ...p,
            candidates: p.candidates.map((c) => (c.id === cid ? { ...c, ...patch } : c)),
          })),
        }));
      },
      lockCandidate: (candidateId) => update(set, get, (p) => lockCandidate(p, candidateId, { newId: uid })),
      setCurrentStyle: (styleId) => update(set, get, (p) => setCurrentStyle(p, styleId)),
      setSlot: (slot) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({ projects: patchProject(s.projects, id, (p) => ({ ...p, currentSlot: slot })) }));
      },
      setMode: (mode) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({ projects: patchProject(s.projects, id, (p) => ({ ...p, mode })) }));
      },
      addImageRevs: ({ writeback = "none", ...opts }) => {
        const id = get().currentId;
        if (!id) return [];
        let ids: string[] = [];
        update(set, get, (p) => {
          const result = addImageRevs(p, { ...opts, writeback }, { newId: uid });
          ids = result.ids;
          return result.project;
        });
        return ids;
      },
      adoptImage: (styleId, slot, imageId) =>
        update(set, get, (p) => adoptImage(p, styleId, slot, imageId)),
      writebackStyle: ({ styleId, changeLog, dna }) =>
        update(set, get, (p) => writebackStyle(p, { styleId, changeLog, dna })),
      setStyleRev: (styleId, rev) => update(set, get, (p) => setStyleRev(p, styleId, rev)),
      removeProject: (id) => {
        set((s) => ({
          projects: s.projects.filter((project) => project.id !== id),
          currentId: s.currentId === id ? null : s.currentId,
        }));
      },
      archiveStyle: (styleId) => {
        const project = get().current();
        if (!project) return { ok: false, reason: "not_found" };
        const result = archiveStyle(project, styleId);
        if (!result.ok) return result;
        update(set, get, () => result.project);
        return { ok: true };
      },
      restoreStyle: (styleId) => update(set, get, (p) => restoreStyle(p, styleId)),
      forkStyle: (styleId) => update(set, get, (p) => forkStyle(p, styleId, { newId: uid })),
    }),
    {
      name: "keystone-v1",
      version: 2,
      migrate: (persisted) => {
        const state = persisted as { projects?: Project[]; currentId?: string | null };
        return {
          projects: (state.projects ?? []).map((project) => ({
            ...project,
            currentImageModelId: project.currentImageModelId ?? "",
          })),
          currentId: state.currentId ?? null,
        };
      },
    },
  ),
);

export { adoptedRev, currentDna };
