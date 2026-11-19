import { beijingCalendarDay } from "./beijing-day.ts";

/** 1 USD = 1e10 ticks. Display divides; storage and this module do not. */
export const USD_TICKS_PER_DOLLAR = 10_000_000_000n;

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;

export type AdminStatsJob = {
  catalogModelId: string;
  displayNameSnapshot: string;
  status: "running" | "succeeded" | "failed";
  createdAt: number;
  finishedAt: number | null;
  costInUsdTicks: bigint | null;
};

export type ModelAdminStat = {
  catalogModelId: string;
  displayName: string;
  jobCount: number;
  /** Failed jobs divided by every job in the range, including ones still running. */
  failureRate: number;
  p50Ms: number | null;
  p90Ms: number | null;
  /** Sum of known fees, in ticks. Null when every job's fee is unknown. */
  costTicks: bigint | null;
  unknownCostCount: number;
};

export type DayAdminStat = {
  /** Beijing calendar day, YYYY-MM-DD. */
  day: string;
  jobCount: number;
  failureCount: number;
};

export type AdminStats = {
  models: ModelAdminStat[];
  days: DayAdminStat[];
};

type ModelBucket = {
  catalogModelId: string;
  displayName: string;
  namedAt: number;
  jobCount: number;
  failed: number;
  durations: number[];
  costTicks: bigint | null;
  unknownCostCount: number;
};

/**
 * Nearest-rank percentile. `percentile` is 50 or 90. Rank is
 * ceil(percentile/100 * n), 1-based, on durations sorted ascending.
 */
function percentileNearestRank(samples: readonly number[], percentile: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((percentile / 100) * sorted.length);
  const index = Math.min(sorted.length, Math.max(1, rank)) - 1;
  return sorted[index] ?? null;
}

export function summarizeAdminStats(jobs: readonly AdminStatsJob[]): AdminStats {
  const models = new Map<string, ModelBucket>();
  const days = new Map<string, DayAdminStat>();

  for (const job of jobs) {
    let bucket = models.get(job.catalogModelId);
    if (!bucket) {
      bucket = {
        catalogModelId: job.catalogModelId,
        displayName: job.displayNameSnapshot,
        namedAt: job.createdAt,
        jobCount: 0,
        failed: 0,
        durations: [],
        costTicks: null,
        unknownCostCount: 0,
      };
      models.set(job.catalogModelId, bucket);
    }
    bucket.jobCount += 1;
    if (job.createdAt >= bucket.namedAt) {
      bucket.displayName = job.displayNameSnapshot;
      bucket.namedAt = job.createdAt;
    }
    if (job.status === "failed") bucket.failed += 1;
    if (job.finishedAt !== null && job.finishedAt >= job.createdAt) {
      bucket.durations.push(job.finishedAt - job.createdAt);
    }
    if (job.costInUsdTicks === null) {
      bucket.unknownCostCount += 1;
    } else {
      bucket.costTicks = (bucket.costTicks ?? 0n) + job.costInUsdTicks;
    }

    const day = beijingCalendarDay(job.createdAt);
    const series = days.get(day) ?? { day, jobCount: 0, failureCount: 0 };
    series.jobCount += 1;
    if (job.status === "failed") series.failureCount += 1;
    days.set(day, series);
  }

  return {
    models: [...models.values()]
      .map((bucket) => ({
        catalogModelId: bucket.catalogModelId,
        displayName: bucket.displayName,
        jobCount: bucket.jobCount,
        failureRate: bucket.jobCount === 0 ? 0 : bucket.failed / bucket.jobCount,
        p50Ms: percentileNearestRank(bucket.durations, 50),
        p90Ms: percentileNearestRank(bucket.durations, 90),
        costTicks: bucket.costTicks,
        unknownCostCount: bucket.unknownCostCount,
      }))
      .sort((a, b) => b.jobCount - a.jobCount || (a.catalogModelId < b.catalogModelId ? -1 : 1)),
    days: [...days.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
  };
}

/** Null stays 未知. A known 0 is "0 美元", never rewritten as unknown. */
export function formatCostUsd(ticks: bigint | null): string {
  if (ticks === null) return "未知";
  const negative = ticks < 0n;
  const abs = negative ? -ticks : ticks;
  const whole = abs / USD_TICKS_PER_DOLLAR;
  const frac = (abs % USD_TICKS_PER_DOLLAR).toString().padStart(10, "0").replace(/0+$/, "");
  const body = frac ? `${whole.toString()}.${frac}` : whole.toString();
  return negative ? `-${body} 美元` : `${body} 美元`;
}

function beijingDayStart(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const ms = Date.parse(`${day}T00:00:00+08:00`);
  if (!Number.isFinite(ms)) return null;
  if (beijingCalendarDay(ms) !== day) return null;
  return ms;
}

/** Inclusive Beijing dates. Null when the days are invalid or longer than a year. */
export function adminStatsRange(
  fromDay: string,
  toDay: string,
): { fromMs: number; toMs: number } | null {
  const fromMs = beijingDayStart(fromDay);
  const toStart = beijingDayStart(toDay);
  if (fromMs === null || toStart === null) return null;
  const toMs = toStart + DAY_MS;
  const days = (toMs - fromMs) / DAY_MS;
  if (!Number.isInteger(days) || days <= 0 || days > MAX_RANGE_DAYS) return null;
  return { fromMs, toMs };
}
