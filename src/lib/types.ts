import type { Slot } from "./project/schema.ts";
import { BUILTIN_SLOTS } from "./project/slots.ts";

export {
  adoptedRev,
  currentDna,
  emptyAsset,
  emptyAssets,
} from "./project/schema.ts";
export type {
  Asset,
  BriefIntent,
  Candidate,
  CustomSlot,
  ImageRev,
  Project,
  Slot,
  StyleBranch,
  StyleDna,
  StyleRevRecord,
} from "./project/schema.ts";

export const SLOTS: { id: Slot; label: string; hint: string }[] = BUILTIN_SLOTS.map((slot) => ({
  id: slot.id,
  label: slot.name,
  hint: slot.purpose,
}));

export type ProfileRecord = {
  displayName: string;
  title: string;
  bio: string;
  updatedAt: string | null;
};
