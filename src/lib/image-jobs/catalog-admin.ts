import { ImageJobError } from "./errors";
import { resolveStudioRole } from "./quota";
import type { ModelCatalogStore, RoleStore } from "./stores";
import type { CatalogModel, StudioRole } from "./types";

export const CATALOG_DISPLAY_NAME_MAX = 40;

export async function requireCatalogAdmin(
  roles: RoleStore,
  userId: string,
): Promise<StudioRole> {
  const role = await resolveStudioRole(roles, userId);
  if (role !== "admin") throw new ImageJobError("forbidden");
  return role;
}

export function parseCatalogDisplayName(raw: string): string {
  const displayName = raw.trim();
  if (!displayName) throw new Error("请填写显示名称");
  if (displayName.length > CATALOG_DISPLAY_NAME_MAX) {
    throw new Error(`显示名称最多 ${CATALOG_DISPLAY_NAME_MAX} 字`);
  }
  return displayName;
}

export async function listCatalogModels(catalog: ModelCatalogStore): Promise<CatalogModel[]> {
  const models = await catalog.list();
  return [...models].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "image" ? -1 : 1;
    return a.displayName.localeCompare(b.displayName, "zh");
  });
}

export async function renameCatalogModel(
  catalog: ModelCatalogStore,
  input: { id: string; displayName: string },
): Promise<CatalogModel> {
  const model = await catalog.get(input.id);
  if (!model) throw new ImageJobError("not_found");
  const displayName = parseCatalogDisplayName(input.displayName);
  await catalog.setDisplayName(model.id, displayName);
  const next = await catalog.get(model.id);
  if (!next) throw new ImageJobError("not_found");
  return next;
}

export async function setCatalogModelEnabled(
  catalog: ModelCatalogStore,
  input: { id: string; enabled: boolean },
): Promise<CatalogModel> {
  const model = await catalog.get(input.id);
  if (!model) throw new ImageJobError("not_found");
  if (!input.enabled && model.kind === "image" && model.enabled) {
    const enabledImages = (await catalog.list()).filter(
      (item) => item.kind === "image" && item.enabled,
    );
    if (enabledImages.length <= 1) {
      throw new Error("至少保留一个可用的出图模型");
    }
  }
  await catalog.setEnabled(model.id, input.enabled);
  const next = await catalog.get(model.id);
  if (!next) throw new ImageJobError("not_found");
  return next;
}

export async function setCatalogImageDefault(
  catalog: ModelCatalogStore,
  id: string,
): Promise<CatalogModel> {
  const model = await catalog.get(id);
  if (!model) throw new ImageJobError("not_found");
  if (model.kind !== "image") throw new Error("只能把出图模型设为默认");
  if (!model.enabled) await catalog.setEnabled(model.id, true);
  await catalog.setAdminDefault(model.id);
  const next = await catalog.get(model.id);
  if (!next) throw new ImageJobError("not_found");
  return next;
}
