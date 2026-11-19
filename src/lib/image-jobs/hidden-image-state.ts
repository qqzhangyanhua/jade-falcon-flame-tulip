import { imageIdFromUrl } from "../project/schema.ts";

export type HiddenImageKnowledge = {
  ids: ReadonlySet<string>;
  /** False until a load succeeds, fails, or the viewer is signed out. */
  ready: boolean;
};

/** `null` means hidden ids are not known yet. */
export function hiddenImageKnowledge(initialIds: readonly string[] | null): HiddenImageKnowledge {
  if (initialIds === null) return { ids: new Set(), ready: false };
  return { ids: new Set(initialIds), ready: true };
}

export type HiddenImageEvent =
  | { type: "signed-out" }
  | { type: "loaded"; ids: readonly string[] }
  | { type: "failed" };

export function nextHiddenImageKnowledge(
  current: HiddenImageKnowledge,
  event: HiddenImageEvent,
): HiddenImageKnowledge {
  if (event.type === "signed-out") return { ids: new Set(), ready: true };
  if (event.type === "failed") return current;
  return { ids: new Set(event.ids), ready: true };
}

export type OwnedImageFrame = "image" | "pending" | "hidden";

/** Pending is not an image and not the hidden label. A non-durable url can render immediately. */
export function ownedImageFrame(knowledge: HiddenImageKnowledge, url: string): OwnedImageFrame {
  const id = imageIdFromUrl(url);
  if (!id) return "image";
  if (!knowledge.ready) return "pending";
  if (knowledge.ids.has(id)) return "hidden";
  return "image";
}
