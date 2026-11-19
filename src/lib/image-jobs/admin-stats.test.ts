import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatFailureRate, summarizeAdminStats, type AdminStatsJob } from "./admin-stats.ts";

const day1 = Date.parse("2026-11-18T10:00:00+08:00");
const day1Later = Date.parse("2026-11-18T18:00:00+08:00");
const day2 = Date.parse("2026-11-19T09:00:00+08:00");

/** Worked sample: three models, two Beijing days, one fee past 2^53. */
function sampleJobs(): AdminStatsJob[] {
  return [
    {
      catalogModelId: "mdl-a",
      displayNameSnapshot: "模型甲",
      status: "succeeded",
      createdAt: day1,
      finishedAt: day1 + 100,
      costInUsdTicks: 20n,
    },
    {
      catalogModelId: "mdl-a",
      displayNameSnapshot: "模型甲",
      status: "succeeded",
      createdAt: day1Later,
      finishedAt: day1Later + 300,
      costInUsdTicks: 7n,
    },
    {
      catalogModelId: "mdl-a",
      displayNameSnapshot: "模型甲",
      status: "failed",
      createdAt: day2,
      finishedAt: day2 + 900,
      costInUsdTicks: null,
    },
    {
      catalogModelId: "mdl-a",
      displayNameSnapshot: "模型甲",
      status: "succeeded",
      createdAt: day2 + 1_000,
      finishedAt: day2 + 1_000 + 200,
      costInUsdTicks: 9007199254740993n,
    },
    {
      catalogModelId: "mdl-a",
      displayNameSnapshot: "模型甲",
      status: "running",
      createdAt: day2 + 2_000,
      finishedAt: null,
      costInUsdTicks: null,
    },
    {
      catalogModelId: "mdl-b",
      displayNameSnapshot: "模型乙",
      status: "failed",
      createdAt: day1,
      finishedAt: day1 + 50,
      costInUsdTicks: 0n,
    },
    {
      catalogModelId: "mdl-c",
      displayNameSnapshot: "模型丙",
      status: "failed",
      createdAt: day1Later,
      finishedAt: day1Later + 10,
      costInUsdTicks: null,
    },
  ];
}

function model(id: string) {
  const found = summarizeAdminStats(sampleJobs()).models.find((row) => row.catalogModelId === id);
  assert.ok(found, id);
  return found;
}

describe("admin stats", () => {
  it("returns no models and no days when there are no jobs", () => {
    assert.deepEqual(summarizeAdminStats([]), { models: [], days: [] });
  });

  it("counts failures over finished jobs, and has no rate when every job is still running", () => {
    assert.equal(model("mdl-a").failureRate, 0.25);
    assert.equal(model("mdl-a").jobCount, 5);
    assert.equal(model("mdl-b").failureRate, 1);
    assert.equal(model("mdl-c").failureRate, 1);

    const running = summarizeAdminStats([
      {
        catalogModelId: "mdl-run",
        displayNameSnapshot: "进行中",
        status: "running",
        createdAt: day1,
        finishedAt: null,
        costInUsdTicks: null,
      },
    ]);
    assert.equal(running.models[0]?.failureRate, null);
    assert.equal(running.models[0]?.jobCount, 1);
    assert.equal(formatFailureRate(null), "—");
    assert.equal(formatFailureRate(0), "0%");
  });

  it("reports nearest-rank P50 and P90 from finishedAt minus createdAt", () => {
    const a = model("mdl-a");
    assert.equal(a.p50Ms, 200);
    assert.equal(a.p90Ms, 900);
    const b = model("mdl-b");
    assert.equal(b.p50Ms, 50);
    assert.equal(b.p90Ms, 50);
    assert.equal(model("mdl-c").p50Ms, 10);
  });

  it("sums only known fees and counts jobs whose fee is unknown", () => {
    const a = model("mdl-a");
    assert.equal(a.costTicks, 9007199254741020n);
    assert.equal(a.unknownCostCount, 2);
    assert.equal(model("mdl-b").costTicks, 0n);
    assert.equal(model("mdl-b").unknownCostCount, 0);
    assert.equal(model("mdl-c").costTicks, null);
    assert.equal(model("mdl-c").unknownCostCount, 1);
  });

  it("groups job count and failure count by Beijing day", () => {
    assert.deepEqual(summarizeAdminStats(sampleJobs()).days, [
      { day: "2026-11-18", jobCount: 4, failureCount: 2 },
      { day: "2026-11-19", jobCount: 3, failureCount: 1 },
    ]);
  });
});
