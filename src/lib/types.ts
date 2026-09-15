export type Slot = "ui_hero" | "kv" | "web_home";

export const SLOTS: { id: Slot; label: string; hint: string }[] = [
  { id: "ui_hero", label: "产品旗舰页", hint: "有原型则保结构" },
  { id: "kv", label: "品牌主视觉", hint: "KV / 海报" },
  { id: "web_home", label: "官网首屏", hint: "延展页" },
];

export type StyleDna = {
  name: string;
  oneLiner: string;
  colors: {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    primary: string;
    accent: string;
  };
  light: string;
  material: string;
  geometry: string;
  density: string;
  typeMood: string;
  mood: string[];
  forbidden: string[];
  promptPositive: string;
  promptNegative: string;
};

export type ImageRev = {
  id: string;
  parentId: string | null;
  url: string;
  createdAt: number;
  action: "generate" | "tune" | "compose";
  diff: string;
  writeback: "none" | "promoted";
  styleRev: number;
  jobId?: string;
};

export type Asset = {
  slot: Slot;
  adoptedId: string | null;
  revs: ImageRev[];
};

export type StyleRevRecord = {
  rev: number;
  parentRev: number | null;
  dna: StyleDna;
  changeLog: string;
  createdAt: number;
};

export type StyleBranch = {
  id: string;
  name: string;
  origin: "candidate" | "fork";
  status: "active" | "standby" | "archived";
  currentRev: number;
  revs: StyleRevRecord[];
  assets: Record<Slot, Asset>;
  candidateUrl: string | null;
};

export type Candidate = {
  id: string;
  presetId: string;
  dna: StyleDna;
  url: string | null;
  status: "pending" | "ready" | "error";
};

export type BriefIntent = {
  productName: string;
  category: string;
  audience: string;
  platform: "app" | "web";
  mood: string[];
  forbidden: string[];
};

export type Project = {
  id: string;
  name: string;
  brief: string;
  prototypeDataUrl: string | null;
  createdAt: number;
  currentStyleId: string | null;
  currentSlot: Slot;
  currentImageModelId: string;
  phase: "brief" | "direction" | "studio";
  intent: BriefIntent | null;
  candidates: Candidate[];
  styles: StyleBranch[];
  mode: "idle" | "generating" | "editing";
};

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

export type ProfileRecord = {
  displayName: string;
  title: string;
  bio: string;
  updatedAt: string | null;
};
