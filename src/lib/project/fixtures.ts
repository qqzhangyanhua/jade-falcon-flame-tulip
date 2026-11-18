import {
  DEFAULT_ENABLED_SLOT_IDS,
  emptyAssets,
  type Candidate,
  type Project,
  type StyleBranch,
  type StyleDna,
} from "./schema.ts";

export function sampleDna(patch: Partial<StyleDna> = {}): StyleDna {
  return {
    name: "雾蓝",
    oneLiner: "克制的雾蓝系统",
    colors: {
      bg: "#0b1020",
      surface: "#141b30",
      text: "#f4f6fb",
      muted: "#8a94ad",
      primary: "#4f7cff",
      accent: "#ffb547",
    },
    light: "柔和顶光",
    material: "磨砂玻璃",
    geometry: "大圆角",
    density: "宽松",
    typeMood: "几何无衬线",
    mood: ["冷静", "专业"],
    forbidden: ["霓虹"],
    promptPositive: "calm blue interface",
    promptNegative: "neon",
    ...patch,
  };
}

export function sampleStyle(id: string, patch: Partial<StyleBranch> = {}): StyleBranch {
  return {
    id,
    name: `风格 ${id}`,
    origin: "candidate",
    status: "standby",
    currentRev: 1,
    candidateUrl: `/api/images/preview_${id}`,
    revs: [
      {
        rev: 1,
        parentRev: null,
        dna: sampleDna({ name: `风格 ${id}` }),
        changeLog: "锁定",
        createdAt: 1,
      },
    ],
    assets: emptyAssets(),
    ...patch,
  };
}

export function sampleCandidate(id: string, patch: Partial<Candidate> = {}): Candidate {
  return {
    id,
    presetId: `preset_${id}`,
    dna: sampleDna({ name: `方向 ${id}` }),
    url: `/api/images/cand_${id}`,
    status: "ready",
    ...patch,
  };
}

export function sampleProject(patch: Partial<Project> = {}): Project {
  return {
    id: "prj_1",
    name: "示例",
    brief: "一个示例项目",
    prototypeDataUrl: null,
    createdAt: 1,
    currentStyleId: "a",
    currentSlot: "kv",
    enabledSlotIds: [...DEFAULT_ENABLED_SLOT_IDS],
    currentImageModelId: "",
    phase: "studio",
    intent: null,
    candidates: [],
    styles: [sampleStyle("a", { status: "active" }), sampleStyle("b"), sampleStyle("c")],
    mode: "idle",
    ...patch,
  };
}
