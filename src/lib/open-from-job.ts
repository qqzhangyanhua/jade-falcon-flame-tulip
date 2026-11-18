import { useStudio } from "./store";
import type { ImageJobAction, ImageJobSlot } from "./image-jobs/types";
import { BUILTIN_SLOTS } from "./project/slots.ts";
import type { ImageRev, Slot } from "./types";

export type OpenFromJobInput = {
  projectId: string;
  slot: ImageJobSlot | null;
  jobId: string;
  imageUrls: string[];
  action: ImageJobAction;
};

function isSlotAction(action: ImageJobAction): action is ImageRev["action"] {
  return action === "generate" || action === "tune" || action === "compose";
}

export function openStudioFromJob(
  input: OpenFromJobInput & { projectAlive?: boolean },
): boolean {
  if (input.projectAlive === false) return false;
  const state = useStudio.getState();
  const project = state.projects.find((item) => item.id === input.projectId);
  if (!project) return false;

  useStudio.setState({ currentId: project.id });

  const slot = input.slot;
  if (!slot) return true;

  state.setSlot(slot);
  const next = useStudio.getState();
  const style = next.currentStyle();
  if (!style) return true;

  const asset = style.assets[slot];
  if (!asset) return true;

  const urls = new Set(input.imageUrls);
  const match = asset.revs.find((rev) => rev.jobId === input.jobId || urls.has(rev.url));
  if (match) {
    next.adoptImage(style.id, slot, match.id);
    return true;
  }

  if (input.imageUrls.length > 0 && isSlotAction(input.action)) {
    const ids = next.addImageRevs({
      styleId: style.id,
      slot,
      urls: input.imageUrls,
      action: input.action,
      diff: "作业历史",
      parentId: null,
      jobId: input.jobId,
    });
    if (ids[0]) next.adoptImage(style.id, slot, ids[0]);
  }
  return true;
}

export function isLivingStudioProject(projectId: string): boolean {
  return useStudio.getState().projects.some((project) => project.id === projectId);
}

export function slotLabel(slot: Slot | ImageJobSlot | null): string {
  if (!slot) return "方向";
  return BUILTIN_SLOTS.find((item) => item.id === slot)?.name ?? "方向";
}

export function actionLabel(action: ImageJobAction): string {
  if (action === "direction") return "方向候选";
  if (action === "generate") return "出图";
  if (action === "tune") return "微调";
  return "换构图";
}

export function statusLabel(status: "running" | "succeeded" | "failed"): string {
  if (status === "running") return "进行中";
  if (status === "succeeded") return "成功";
  return "失败";
}

export function formatJobTime(at: number): string {
  return new Date(at).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
