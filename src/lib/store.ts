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
  emptyAssets,
} from "./types";
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
  }) => string[];
  adoptImage: (styleId: string, slot: Slot, imageId: string) => void;
  writebackStyle: (opts: { styleId: string; changeLog: string; dna: StyleDna }) => void;
  setStyleRev: (styleId: string, rev: number) => void;
  archiveStyle: (styleId: string) => void;
};

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
      lockCandidate: (candidateId) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({
          projects: patchProject(s.projects, id, (p) => {
            const chosen = p.candidates.find((c) => c.id === candidateId);
            if (!chosen) return p;
            const rest = p.candidates.filter((c) => c.id !== candidateId).slice(0, 2);
            const mk = (c: Candidate, status: StyleBranch["status"]): StyleBranch => ({
              id: uid("sty"),
              name: c.dna.name,
              origin: "candidate",
              status,
              currentRev: 1,
              candidateUrl: c.url,
              revs: [
                {
                  rev: 1,
                  parentRev: null,
                  dna: c.dna,
                  changeLog: "锁定",
                  createdAt: Date.now(),
                },
              ],
              assets: emptyAssets(),
            });
            const active = mk(chosen, "active");
            const standbys = rest.map((c) => mk(c, "standby"));
            return {
              ...p,
              phase: "studio",
              currentStyleId: active.id,
              currentSlot: "kv",
              styles: [active, ...standbys],
              mode: "idle",
            };
          }),
        }));
      },
      setCurrentStyle: (styleId) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({
          projects: patchProject(s.projects, id, (p) => ({
            ...p,
            currentStyleId: styleId,
            styles: p.styles.map((st) =>
              st.status === "archived"
                ? st
                : { ...st, status: st.id === styleId ? "active" : "standby" },
            ),
          })),
        }));
      },
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
      addImageRevs: ({ styleId, slot, urls, action, diff, parentId, writeback = "none" }) => {
        const ids: string[] = [];
        const pid = get().currentId;
        if (!pid) return ids;
        set((s) => ({
          projects: patchProject(s.projects, pid, (p) => ({
            ...p,
            styles: p.styles.map((st) => {
              if (st.id !== styleId) return st;
              const asset = st.assets[slot];
              const nextRevs = [...asset.revs];
              for (const url of urls) {
                const iid = uid("img");
                ids.push(iid);
                nextRevs.push({
                  id: iid,
                  parentId,
                  url,
                  createdAt: Date.now(),
                  action,
                  diff,
                  writeback,
                  styleRev: st.currentRev,
                });
              }
              const trimmed = nextRevs.slice(-10);
              return {
                ...st,
                assets: {
                  ...st.assets,
                  [slot]: {
                    ...asset,
                    revs: trimmed,
                    adoptedId: asset.adoptedId ?? ids[0] ?? null,
                  },
                },
              };
            }),
          })),
        }));
        return ids;
      },
      adoptImage: (styleId, slot, imageId) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({
          projects: patchProject(s.projects, id, (p) => ({
            ...p,
            styles: p.styles.map((st) =>
              st.id !== styleId
                ? st
                : {
                    ...st,
                    assets: {
                      ...st.assets,
                      [slot]: { ...st.assets[slot], adoptedId: imageId },
                    },
                  },
            ),
          })),
        }));
      },
      writebackStyle: ({ styleId, changeLog, dna }) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({
          projects: patchProject(s.projects, id, (p) => ({
            ...p,
            styles: p.styles.map((st) => {
              if (st.id !== styleId) return st;
              const nextRev = st.currentRev + 1;
              return {
                ...st,
                currentRev: nextRev,
                revs: [
                  ...st.revs,
                  {
                    rev: nextRev,
                    parentRev: st.currentRev,
                    dna,
                    changeLog,
                    createdAt: Date.now(),
                  },
                ],
              };
            }),
          })),
        }));
      },
      setStyleRev: (styleId, rev) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({
          projects: patchProject(s.projects, id, (p) => ({
            ...p,
            styles: p.styles.map((st) => (st.id === styleId ? { ...st, currentRev: rev } : st)),
          })),
        }));
      },
      archiveStyle: (styleId) => {
        const id = get().currentId;
        if (!id) return;
        set((s) => ({
          projects: patchProject(s.projects, id, (p) => {
            const remaining = p.styles.filter((st) => st.id !== styleId && st.status !== "archived");
            const nextCurrent =
              p.currentStyleId === styleId ? remaining[0]?.id ?? null : p.currentStyleId;
            return {
              ...p,
              currentStyleId: nextCurrent,
              styles: p.styles.map((st) =>
                st.id === styleId ? { ...st, status: "archived" as const } : st,
              ),
            };
          }),
        }));
      },
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
