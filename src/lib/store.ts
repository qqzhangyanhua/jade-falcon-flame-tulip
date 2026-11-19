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
  createCustomSlot,
  deleteCustomSlot,
  editCustomSlot,
  enableBuiltinSlot,
  forkStyle,
  hideBuiltinSlot,
  lockCandidate,
  restoreStyle,
  setCurrentStyle,
  rollbackStyle,
  setStyleRev,
  writebackStyle,
} from "./project/ops.ts";
import type { DnaChange } from "./project/dna.ts";
import type { ArchiveResult, CustomSlotDraft } from "./project/ops.ts";
import {
  DEFAULT_ENABLED_SLOT_IDS,
  PROJECT_NAME_MAX,
  normalizeProjectDocument,
} from "./project/schema.ts";
import { uid } from "./utils";

type State = {
  projects: Project[];
  currentId: string | null;
  current: () => Project | null;
  currentStyle: () => StyleBranch | null;
  createProject: (input: {
    brief: string;
    prototypeDataUrl: string | null;
    referenceImageUrls?: string[];
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
  enableBuiltinSlot: (slotId: string) => void;
  hideBuiltinSlot: (slotId: string) => void;
  createCustomSlot: (draft: CustomSlotDraft) => void;
  editCustomSlot: (slotId: string, draft: CustomSlotDraft) => void;
  deleteCustomSlot: (slotId: string) => void;
  setMode: (mode: Project["mode"]) => void;
  addImageRevs: (opts: {
    projectId?: string;
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
  writebackStyle: (opts: {
    styleId: string;
    changeLog: string;
    dna: StyleDna;
    changes?: DnaChange[];
  }) => void;
  rollbackStyle: (styleId: string, rev: number) => void;
  setStyleRev: (styleId: string, rev: number) => void;
  archiveStyle: (styleId: string) => ArchiveOutcome;
  restoreStyle: (styleId: string) => void;
  forkStyle: (styleId: string) => void;
  removeProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
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
      createProject: ({
        brief,
        prototypeDataUrl,
        referenceImageUrls,
        id: givenId,
        currentImageModelId,
      }) => {
        const id = givenId ?? uid("prj");
        const name = brief.trim().slice(0, 24) || "未命名项目";
        const project: Project = {
          id,
          name,
          brief: brief.trim(),
          prototypeDataUrl,
          referenceImageUrls: referenceImageUrls ?? [],
          createdAt: Date.now(),
          currentStyleId: null,
          currentSlot: "kv",
          enabledSlotIds: [...DEFAULT_ENABLED_SLOT_IDS],
          customSlots: [],
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
          projects: patchProject(s.projects, id, (p) => ({
            ...p,
            intent,
            name: (intent.productName || p.name).trim().slice(0, PROJECT_NAME_MAX) || p.name,
          })),
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
      lockCandidate: (candidateId) =>
        update(set, get, (p) => lockCandidate(p, candidateId, { newId: uid })),
      setCurrentStyle: (styleId) => update(set, get, (p) => setCurrentStyle(p, styleId)),
      setSlot: (slot) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({
          projects: patchProject(s.projects, id, (p) => ({ ...p, currentSlot: slot })),
        }));
      },
      enableBuiltinSlot: (slotId) => update(set, get, (p) => enableBuiltinSlot(p, slotId)),
      hideBuiltinSlot: (slotId) => update(set, get, (p) => hideBuiltinSlot(p, slotId)),
      createCustomSlot: (draft) =>
        update(set, get, (p) => createCustomSlot(p, draft, { newId: uid })),
      editCustomSlot: (slotId, draft) => update(set, get, (p) => editCustomSlot(p, slotId, draft)),
      deleteCustomSlot: (slotId) => update(set, get, (p) => deleteCustomSlot(p, slotId)),
      setMode: (mode) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({ projects: patchProject(s.projects, id, (p) => ({ ...p, mode })) }));
      },
      addImageRevs: ({ projectId, writeback = "none", ...opts }) => {
        const id = projectId ?? get().currentId;
        if (!id) return [];
        let ids: string[] = [];
        set((s) => {
          const project = s.projects.find((p) => p.id === id);
          if (!project) return s;
          const result = addImageRevs(project, { ...opts, writeback }, { newId: uid });
          ids = result.ids;
          if (result.project === project) return s;
          return {
            projects: s.projects.map((p) => (p.id === id ? result.project : p)),
          };
        });
        return ids;
      },
      adoptImage: (styleId, slot, imageId) =>
        update(set, get, (p) => adoptImage(p, styleId, slot, imageId)),
      writebackStyle: ({ styleId, changeLog, dna, changes }) =>
        update(set, get, (p) =>
          writebackStyle(p, { styleId, changeLog, dna, changes }, { newId: uid }),
        ),
      rollbackStyle: (styleId, rev) => update(set, get, (p) => rollbackStyle(p, styleId, rev)),
      setStyleRev: (styleId, rev) => update(set, get, (p) => setStyleRev(p, styleId, rev)),
      removeProject: (id) => {
        set((s) => ({
          projects: s.projects.filter((project) => project.id !== id),
          currentId: s.currentId === id ? null : s.currentId,
        }));
      },
      renameProject: (id, name) => {
        set((s) => ({
          projects: patchProject(s.projects, id, (p) => ({ ...p, name })),
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
      version: 4,
      migrate: (persisted) => {
        const state = persisted as { projects?: Project[]; currentId?: string | null };
        return {
          projects: (state.projects ?? []).map((project) =>
            normalizeProjectDocument({
              ...project,
              currentImageModelId: project.currentImageModelId ?? "",
              referenceImageUrls: project.referenceImageUrls ?? [],
            }),
          ),
          currentId: state.currentId ?? null,
        };
      },
    },
  ),
);

export { adoptedRev, currentDna };
