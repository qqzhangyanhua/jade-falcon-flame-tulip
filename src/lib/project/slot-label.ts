import { BUILTIN_SLOTS } from "./slots.ts";

/** Catalog name, or a custom slot. Null is a direction candidate, not a slot. */
export function slotLabel(slot: string | null): string {
  if (!slot) return "方向";
  return BUILTIN_SLOTS.find((item) => item.id === slot)?.name ?? "自定义物料槽";
}
