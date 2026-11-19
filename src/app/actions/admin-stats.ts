"use server";

import { requireActionUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import {
  adminStatsRange,
  summarizeAdminStats,
  type DayAdminStat,
} from "@/lib/image-jobs/admin-stats";
import { requireCatalogAdmin } from "@/lib/image-jobs/catalog-admin";
import { ImageJobError } from "@/lib/image-jobs/errors";
import { createSqlRoleStore } from "@/lib/image-jobs/quota-sql";
import { createSqlJobStore } from "@/lib/image-jobs/sql";

export type AdminModelStatDto = {
  catalogModelId: string;
  displayName: string;
  jobCount: number;
  failureRate: number | null;
  p50Ms: number | null;
  p90Ms: number | null;
  /** Decimal ticks, or null when no job in the group has a fee. */
  costTicks: string | null;
  unknownCostCount: number;
};

export type AdminStatsDto = {
  models: AdminModelStatDto[];
  days: DayAdminStat[];
};

export type AdminStatsResponse =
  | { ok: true; stats: AdminStatsDto }
  | { ok: false; code: "forbidden" | "invalid_range" };

export async function getAdminStatsFn(input: {
  data: { fromDay: string; toDay: string };
}): Promise<AdminStatsResponse> {
  const { userId } = await requireActionUser();
  const sql = await getSql();
  try {
    await requireCatalogAdmin(createSqlRoleStore(sql), userId);
  } catch (err) {
    if (err instanceof ImageJobError && err.code === "forbidden") {
      return { ok: false, code: "forbidden" };
    }
    throw err;
  }

  const range = adminStatsRange(input.data?.fromDay ?? "", input.data?.toDay ?? "");
  if (!range) return { ok: false, code: "invalid_range" };

  const jobs = await createSqlJobStore(sql).listInRange(range.fromMs, range.toMs);
  const stats = summarizeAdminStats(jobs);
  return {
    ok: true,
    stats: {
      models: stats.models.map((model) => ({
        catalogModelId: model.catalogModelId,
        displayName: model.displayName,
        jobCount: model.jobCount,
        failureRate: model.failureRate,
        p50Ms: model.p50Ms,
        p90Ms: model.p90Ms,
        costTicks: model.costTicks === null ? null : model.costTicks.toString(),
        unknownCostCount: model.unknownCostCount,
      })),
      days: stats.days,
    },
  };
}
