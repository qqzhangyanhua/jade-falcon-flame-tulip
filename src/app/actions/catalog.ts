"use server";

import { requireActionUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import {
  listCatalogModels,
  renameCatalogModel,
  requireCatalogAdmin,
  setCatalogImageDefault,
  setCatalogModelEnabled,
} from "@/lib/image-jobs/catalog-admin";
import { ImageJobError } from "@/lib/image-jobs/errors";
import { resolveStudioRole } from "@/lib/image-jobs/quota";
import { createSqlRoleStore } from "@/lib/image-jobs/quota-sql";
import { createSqlCatalogStore } from "@/lib/image-jobs/sql";
import type { CatalogModel, StudioRole } from "@/lib/image-jobs/types";

async function catalogAdminDeps() {
  const sql = await getSql();
  return {
    catalog: createSqlCatalogStore(sql),
    roles: createSqlRoleStore(sql),
  };
}

export async function listCatalogModelsFn(): Promise<{
  role: StudioRole;
  models: CatalogModel[];
}> {
  const { userId } = await requireActionUser();
  const deps = await catalogAdminDeps();
  const role = await resolveStudioRole(deps.roles, userId);
  if (role !== "admin") return { role, models: [] };
  return { role, models: await listCatalogModels(deps.catalog) };
}

export async function renameCatalogModelFn(input: {
  data: { id: string; displayName: string };
}): Promise<CatalogModel> {
  const { userId } = await requireActionUser();
  const deps = await catalogAdminDeps();
  await requireCatalogAdmin(deps.roles, userId);
  const id = input.data.id.trim();
  if (!id) throw new ImageJobError("not_found");
  return renameCatalogModel(deps.catalog, { id, displayName: input.data.displayName });
}

export async function setCatalogModelEnabledFn(input: {
  data: { id: string; enabled: boolean };
}): Promise<CatalogModel> {
  const { userId } = await requireActionUser();
  const deps = await catalogAdminDeps();
  await requireCatalogAdmin(deps.roles, userId);
  const id = input.data.id.trim();
  if (!id) throw new ImageJobError("not_found");
  return setCatalogModelEnabled(deps.catalog, { id, enabled: input.data.enabled });
}

export async function setCatalogImageDefaultFn(input: { data: { id: string } }): Promise<CatalogModel> {
  const { userId } = await requireActionUser();
  const deps = await catalogAdminDeps();
  await requireCatalogAdmin(deps.roles, userId);
  const id = input.data.id.trim();
  if (!id) throw new ImageJobError("not_found");
  return setCatalogImageDefault(deps.catalog, id);
}
