import type { ImageJobAction, ImageJobSlot } from "./types.ts";
import { IMAGE_JOB_SLOTS } from "./types.ts";

export const MAX_PARALLEL_DIRECTION_JOBS = 5;

export type RunningJobRef = {
  projectId: string;
  slot: ImageJobSlot | null;
};

export function resolveJobSlot(
  action: ImageJobAction,
  slot?: ImageJobSlot | null,
): ImageJobSlot | null {
  if (action === "direction") return null;
  if (slot && (IMAGE_JOB_SLOTS as readonly string[]).includes(slot)) return slot;
  return "kv";
}

export function concurrencyBlock(
  incoming: RunningJobRef,
  running: readonly RunningJobRef[],
): "in_flight" | null {
  if (running.some((job) => job.projectId !== incoming.projectId)) {
    return "in_flight";
  }
  if (incoming.slot !== null) {
    const slotTaken = running.some(
      (job) => job.projectId === incoming.projectId && job.slot === incoming.slot,
    );
    return slotTaken ? "in_flight" : null;
  }
  const directionCount = running.filter(
    (job) => job.projectId === incoming.projectId && job.slot === null,
  ).length;
  return directionCount >= MAX_PARALLEL_DIRECTION_JOBS ? "in_flight" : null;
}
