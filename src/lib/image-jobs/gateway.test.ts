import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateImageAction, listEnabledImagePicker } from "./availability.ts";
import { beijingCalendarDay } from "./beijing-day.ts";
import { IMAGE_JOB_USER_MESSAGES, messageForImageJobError } from "./errors.ts";
import { DURABLE_IMAGE_PATH_PREFIX, listJobImages, openJobImage } from "./durable.ts";
import { runImageJob } from "./gateway.ts";
import { listUserJobs } from "./list-jobs.ts";
import {
  DEFAULT_CHAT_MODEL_ID,
  DEFAULT_IMAGE_MODEL_ID,
  createMemoryGatewayWorld,
  defaultCatalogSeed,
} from "./memory.ts";
import {
  createStudioProject,
  getStudioImageState,
  listImageModelPicker,
  pickProjectImageModel,
} from "./projects.ts";
import { DEFAULT_DAILY_IMAGE_CAP, resolveStudioRole, setGlobalDailyCap } from "./quota.ts";
import type { CatalogModel, ImageJobAction, RunImageJobInput } from "./types.ts";
import { IMAGE_JOB_ACTIONS, IMAGE_JOB_ERROR_CODES, IMAGE_JOB_SLOTS } from "./types.ts";

function jobInput(
  world: ReturnType<typeof createMemoryGatewayWorld>,
  patch: Partial<RunImageJobInput> = {},
): RunImageJobInput {
  const action = patch.action ?? "generate";
  return {
    userId: world.userId,
    projectId: world.projectId,
    prompt: "a quiet editorial board",
    aspect: "16:9",
    n: 2,
    ...patch,
    action,
    slot: patch.slot !== undefined ? patch.slot : action === "direction" ? null : "kv",
  };
}

function holdUpstream() {
  let releaseHeld = (): void => {};
  let startedCount = 0;
  const waiters: Array<() => void> = [];
  const held = new Promise<void>((resolve) => {
    releaseHeld = resolve;
  });
  return {
    release(): void {
      releaseHeld();
    },
    started(): number {
      return startedCount;
    },
    waitForStarts(n: number): Promise<void> {
      return new Promise((resolve) => {
        const check = (): void => {
          if (startedCount >= n) resolve();
          else waiters.push(check);
        };
        check();
      });
    },
    async run() {
      startedCount += 1;
      const queued = waiters.splice(0);
      for (const notify of queued) notify();
      await held;
      return { ok: true as const, urls: ["https://img.example/held.png"] };
    },
  };
}

describe("image job gateway", () => {
  it("routes direction, generate, tune, and compose through the same entry", async () => {
    const world = createMemoryGatewayWorld();
    for (const action of IMAGE_JOB_ACTIONS) {
      world.calls.length = 0;
      const result = await runImageJob(
        world,
        jobInput(world, {
          action,
          n: action === "generate" ? 2 : 1,
          imageUrl:
            action === "tune" || action === "compose"
              ? "https://img.example/src.png"
              : undefined,
        }),
      );
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.job.action, action);
      assert.equal(world.calls.length, 1);
      assert.equal(world.calls[0]?.action, action);
    }
  });

  it("uses the project current model and ignores a client-supplied id", async () => {
    const extra: CatalogModel = {
      id: "mdl-other",
      kind: "image",
      displayName: "Other Imagine",
      upstreamId: "other-upstream",
      enabled: true,
      capabilities: ["generate"],
      isAdminDefault: false,
    };
    const world = createMemoryGatewayWorld({
      models: [...defaultCatalogSeed(), extra],
    });
    const result = await runImageJob(
      world,
      jobInput(world, { clientModelId: extra.id, n: 1 }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.job.catalogModelId, DEFAULT_IMAGE_MODEL_ID);
    assert.equal(result.job.upstreamModelId, "grok-imagine-image-2.0");
    assert.equal(world.calls[0]?.upstreamModelId, "grok-imagine-image-2.0");
  });

  it("freezes catalog id, upstream id, display name, and action on the job", async () => {
    const world = createMemoryGatewayWorld();
    const result = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.job.catalogModelId, DEFAULT_IMAGE_MODEL_ID);
    assert.equal(result.job.upstreamModelId, "grok-imagine-image-2.0");
    assert.equal(result.job.displayNameSnapshot, "Grok Imagine 2.0");
    assert.equal(result.job.action, "generate");

    await world.catalog.setDisplayName(DEFAULT_IMAGE_MODEL_ID, "Renamed Imagine");
    const stored = await world.jobs.get(result.job.id);
    assert.equal(stored?.displayNameSnapshot, "Grok Imagine 2.0");
    const live = await world.catalog.get(DEFAULT_IMAGE_MODEL_ID);
    assert.equal(live?.displayName, "Renamed Imagine");
  });

  it("returns model_disabled without calling upstream or repointing the project", async () => {
    const world = createMemoryGatewayWorld();
    await world.catalog.setEnabled(DEFAULT_IMAGE_MODEL_ID, false);
    const extra: CatalogModel = {
      id: "mdl-other",
      kind: "image",
      displayName: "Other Imagine",
      upstreamId: "other-upstream",
      enabled: true,
      capabilities: ["generate"],
      isAdminDefault: false,
    };
    const seeded = createMemoryGatewayWorld({
      models: [
        {
          ...(await world.catalog.get(DEFAULT_IMAGE_MODEL_ID))!,
          enabled: false,
        },
        extra,
        {
          id: DEFAULT_CHAT_MODEL_ID,
          kind: "chat",
          displayName: "Grok 4.5",
          upstreamId: "grok-4.5",
          enabled: true,
          capabilities: [],
          isAdminDefault: false,
        },
      ],
    });
    const result = await runImageJob(seeded, jobInput(seeded, { n: 1 }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "model_disabled");
    assert.equal(seeded.calls.length, 0);
    const project = await seeded.projects.get(seeded.projectId);
    assert.equal(project?.currentImageModelId, DEFAULT_IMAGE_MODEL_ID);
  });

  it("returns images_unavailable when no image model is enabled", async () => {
    const models = defaultCatalogSeed().map((model) =>
      model.kind === "image" ? { ...model, enabled: false } : model,
    );
    const world = createMemoryGatewayWorld({ models });
    const result = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "images_unavailable");
    assert.equal(world.calls.length, 0);
  });

  it("returns capability_denied and does not call upstream", async () => {
    const models = defaultCatalogSeed().map((model) =>
      model.id === DEFAULT_IMAGE_MODEL_ID
        ? { ...model, capabilities: ["generate"] as ImageJobAction[] }
        : model,
    );
    const world = createMemoryGatewayWorld({ models });
    const result = await runImageJob(
      world,
      jobInput(world, { action: "tune", imageUrl: "https://img.example/src.png", n: 1 }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "capability_denied");
    assert.equal(world.calls.length, 0);
    const verdict = evaluateImageAction({
      models,
      current: models[0] ?? null,
      action: "tune",
    });
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.code, "capability_denied");
  });

  it("lets an in-flight job finish after the model is disabled", async () => {
    let release!: () => void;
    let started!: () => void;
    const startedAt = new Promise<void>((resolve) => {
      started = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const world = createMemoryGatewayWorld({
      upstream: async () => {
        started();
        await held;
        return { ok: true, urls: ["https://img.example/late.png"] };
      },
    });
    const pending = runImageJob(world, jobInput(world, { n: 1 }));
    await startedAt;
    await world.catalog.setEnabled(DEFAULT_IMAGE_MODEL_ID, false);
    const projectMid = await world.projects.get(world.projectId);
    assert.equal(projectMid?.currentImageModelId, DEFAULT_IMAGE_MODEL_ID);
    release();
    const result = await pending;
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.job.status, "succeeded");
    assert.equal(result.revs.length, 1);
    const projectAfter = await world.projects.get(world.projectId);
    assert.equal(projectAfter?.currentImageModelId, DEFAULT_IMAGE_MODEL_ID);
  });

  it("marks upstream failure as a failed job with no ImageRev and no success fallback", async () => {
    const world = createMemoryGatewayWorld({
      upstream: async () => {
        throw new Error("upstream secret body {quota: 12, stack: 'xai'}");
      },
    });
    const result = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "upstream_failed");
    assert.equal(result.job?.status, "failed");
    assert.equal(result.job?.errorCode, "upstream_failed");
    assert.equal(JSON.stringify(result).includes("secret"), false);
    assert.equal(JSON.stringify(result).includes("quota"), false);
    const revs = result.job ? await world.revs.listByJob(result.job.id) : [];
    assert.equal(revs.length, 0);
    if (result.job) {
      const listed = await listJobImages(world, {
        userId: world.userId,
        jobId: result.job.id,
      });
      assert.equal(listed.ok, true);
      if (listed.ok) assert.equal(listed.images.length, 0);
    }
  });

  it("records one job for one accepted upstream call even with two variants", async () => {
    const world = createMemoryGatewayWorld({
      upstream: async () => ({
        ok: true,
        urls: ["https://img.example/a.png", "https://img.example/b.png"],
      }),
    });
    const result = await runImageJob(world, jobInput(world, { n: 2 }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(world.calls.length, 1);
    assert.equal(result.revs.length, 2);
    assert.ok(result.revs.every((rev) => rev.jobId === result.job.id));
  });

  it("exposes only the closed error set to the client mapper", async () => {
    const world = createMemoryGatewayWorld({
      upstream: async () => {
        throw new Error("INTERNAL xAI 429 body should never leak");
      },
    });
    const result = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(messageForImageJobError({ message: result.code }), IMAGE_JOB_USER_MESSAGES[result.code]);
    assert.equal(
      messageForImageJobError(new Error("INTERNAL xAI 429 body should never leak")),
      IMAGE_JOB_USER_MESSAGES.upstream_failed,
    );
  });

  it("rejects other users and missing auth without calling upstream", async () => {
    const world = createMemoryGatewayWorld();
    const other = await runImageJob(world, jobInput(world, { userId: "user-2", n: 1 }));
    assert.equal(other.ok, false);
    if (!other.ok) assert.equal(other.code, "forbidden");

    const anon = await runImageJob(world, jobInput(world, { userId: "", n: 1 }));
    assert.equal(anon.ok, false);
    if (!anon.ok) assert.equal(anon.code, "unauthorized");

    const missing = await runImageJob(
      world,
      jobInput(world, { projectId: "missing", n: 1 }),
    );
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "not_found");
    assert.equal(world.calls.length, 0);
  });

  it("includes quota_exceeded and in_flight in the closed client error set", () => {
    assert.ok((IMAGE_JOB_ERROR_CODES as readonly string[]).includes("quota_exceeded"));
    assert.ok((IMAGE_JOB_ERROR_CODES as readonly string[]).includes("in_flight"));
    assert.equal(IMAGE_JOB_USER_MESSAGES.quota_exceeded, "今日额度已用完");
    assert.equal(IMAGE_JOB_USER_MESSAGES.in_flight, "当前有进行中的出图");
    assert.equal(
      (IMAGE_JOB_ACTIONS as readonly string[]).includes("parse"),
      false,
    );
  });
});

describe("daily quota (Beijing time)", () => {
  it("defaults to 30 and counts one accepted job even when two variants return", async () => {
    const world = createMemoryGatewayWorld({
      cap: DEFAULT_DAILY_IMAGE_CAP,
      upstream: async () => ({
        ok: true,
        urls: ["https://img.example/a.png", "https://img.example/b.png"],
      }),
    });
    const before = await world.quota.snapshot(world.userId, world.now?.() ?? 0);
    assert.equal(before.cap, 30);
    assert.equal(before.remaining, 30);
    const result = await runImageJob(world, jobInput(world, { n: 2 }));
    assert.equal(result.ok, true);
    const after = await world.quota.snapshot(world.userId, world.now?.() ?? 0);
    assert.equal(after.used, 1);
    assert.equal(after.remaining, 29);
  });

  it("reserves then keeps the count when upstream fails", async () => {
    const world = createMemoryGatewayWorld({
      cap: 2,
      upstream: async () => {
        throw new Error("upstream down");
      },
    });
    const result = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "upstream_failed");
    assert.equal(result.job?.status, "failed");
    assert.equal(world.calls.length, 1);
    const snap = await world.quota.snapshot(world.userId, world.now?.() ?? 0);
    assert.equal(snap.used, 1);
    assert.equal(snap.remaining, 1);
  });

  it("returns quota_exceeded without inserting a job or calling upstream", async () => {
    const world = createMemoryGatewayWorld({ cap: 1 });
    const first = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(first.ok, true);
    world.calls.length = 0;
    const blocked = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(blocked.ok, false);
    if (blocked.ok) return;
    assert.equal(blocked.code, "quota_exceeded");
    assert.equal(blocked.job, undefined);
    assert.equal(world.calls.length, 0);
    assert.equal(messageForImageJobError(new Error("quota_exceeded")), "今日额度已用完");
  });

  it("does not consume quota for capability denial or brief-style non-jobs", async () => {
    const models = defaultCatalogSeed().map((model) =>
      model.id === DEFAULT_IMAGE_MODEL_ID
        ? { ...model, capabilities: ["generate"] as ImageJobAction[] }
        : model,
    );
    const world = createMemoryGatewayWorld({ models, cap: 1 });
    const denied = await runImageJob(
      world,
      jobInput(world, { action: "tune", imageUrl: "https://img.example/src.png", n: 1 }),
    );
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "capability_denied");
    assert.equal(world.calls.length, 0);
    const snap = await world.quota.snapshot(world.userId, world.now?.() ?? 0);
    assert.equal(snap.used, 0);
    assert.equal(snap.remaining, 1);
  });

  it("uses the injectable clock and rolls over at Beijing midnight, not UTC", async () => {
    const beforeBeijingMidnight = Date.parse("2026-01-01T15:59:59.999Z");
    const atBeijingMidnight = Date.parse("2026-01-01T16:00:00.000Z");
    assert.equal(beijingCalendarDay(beforeBeijingMidnight), "2026-01-01");
    assert.equal(beijingCalendarDay(atBeijingMidnight), "2026-01-02");
    assert.notEqual(
      beijingCalendarDay(atBeijingMidnight),
      new Date(atBeijingMidnight).toISOString().slice(0, 10),
    );

    let now = beforeBeijingMidnight;
    const world = createMemoryGatewayWorld({
      cap: 1,
      now: () => now,
    });
    const first = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(first.ok, true);
    const sameDay = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(sameDay.ok, false);
    if (!sameDay.ok) assert.equal(sameDay.code, "quota_exceeded");
    assert.equal((await world.quota.snapshot(world.userId, now)).remaining, 0);

    now = atBeijingMidnight;
    const rolled = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(rolled.ok, true);
    assert.equal((await world.quota.snapshot(world.userId, now)).used, 1);
    assert.equal((await world.quota.snapshot(world.userId, now)).beijingDay, "2026-01-02");
    assert.equal((await world.quota.snapshot(world.userId, beforeBeijingMidnight)).used, 1);
  });

  it("applies the global cap to every user, including administrators", async () => {
    const world = createMemoryGatewayWorld({
      cap: 30,
      roles: { "user-1": "admin" },
    });
    const changed = await setGlobalDailyCap(world.roles, world.quota, {
      userId: world.userId,
      cap: 1,
    });
    assert.equal(changed.ok, true);
    if (changed.ok) assert.equal(changed.cap, 1);

    const adminJob = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(adminJob.ok, true);
    const adminBlocked = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(adminBlocked.ok, false);
    if (!adminBlocked.ok) assert.equal(adminBlocked.code, "quota_exceeded");

    await world.projects.create({
      id: "prj_other",
      userId: "user-2",
      currentImageModelId: DEFAULT_IMAGE_MODEL_ID,
      createdAt: 1,
    });
    const otherJob = await runImageJob(
      world,
      jobInput(world, { userId: "user-2", projectId: "prj_other", n: 1 }),
    );
    assert.equal(otherJob.ok, true);
    const otherBlocked = await runImageJob(
      world,
      jobInput(world, { userId: "user-2", projectId: "prj_other", n: 1 }),
    );
    assert.equal(otherBlocked.ok, false);
    if (!otherBlocked.ok) assert.equal(otherBlocked.code, "quota_exceeded");
  });

  it("promotes only the first user to administrator", async () => {
    const world = createMemoryGatewayWorld();
    assert.equal(await resolveStudioRole(world.roles, world.userId), "admin");
    assert.equal(await resolveStudioRole(world.roles, "user-2"), "user");
    assert.equal(await world.roles.getRole("user-2"), "user");
  });

  it("rejects a non-admin changing the global cap", async () => {
    const world = createMemoryGatewayWorld({ cap: 30 });
    const denied = await setGlobalDailyCap(world.roles, world.quota, {
      userId: world.userId,
      cap: 5,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "forbidden");
    assert.equal(await world.quota.getCap(), 30);
  });

  it("shows remaining count for today on the studio state", async () => {
    let now = Date.parse("2026-01-01T16:00:00.000Z");
    const world = createMemoryGatewayWorld({ cap: 3, now: () => now });
    const before = await getStudioImageState(world.catalog, world.projects, world.quota, {
      userId: world.userId,
      projectId: world.projectId,
      now,
    });
    assert.equal(before.ok, true);
    if (!before.ok) return;
    assert.equal(before.value.quota.remaining, 3);
    assert.equal(before.value.quota.beijingDay, "2026-01-02");
    assert.equal(before.value.actions.generate.enabled, true);

    await runImageJob(world, jobInput(world, { n: 1 }));
    await runImageJob(world, jobInput(world, { n: 1 }));
    await runImageJob(world, jobInput(world, { n: 1 }));
    const after = await getStudioImageState(world.catalog, world.projects, world.quota, {
      userId: world.userId,
      projectId: world.projectId,
      now,
    });
    assert.equal(after.ok, true);
    if (!after.ok) return;
    assert.equal(after.value.quota.remaining, 0);
    assert.equal(after.value.actions.generate.enabled, false);
    assert.equal(after.value.actions.generate.code, "quota_exceeded");
    assert.equal(after.value.actions.generate.reason, "今日额度已用完");
  });
});

describe("parallel limits", () => {
  it("lets three slots of one project run together", async () => {
    const hold = holdUpstream();
    const world = createMemoryGatewayWorld({
      cap: 10,
      upstream: () => hold.run(),
    });
    const pending = IMAGE_JOB_SLOTS.map((slot) =>
      runImageJob(world, jobInput(world, { slot, n: 1 })),
    );
    await hold.waitForStarts(3);
    assert.equal(world.calls.length, 3);
    const used = await world.quota.snapshot(world.userId, world.now?.() ?? 0);
    assert.equal(used.used, 3);

    hold.release();
    const results = await Promise.all(pending);
    assert.ok(results.every((result) => result.ok));
    const slots = results.flatMap((result) => (result.ok ? [result.job.slot] : []));
    assert.deepEqual(new Set(slots), new Set(IMAGE_JOB_SLOTS));
    assert.ok(results.every((result) => result.ok && result.job.status === "succeeded"));
  });

  it("rejects a second job on the same running slot without reserve or upstream", async () => {
    const hold = holdUpstream();
    const world = createMemoryGatewayWorld({
      cap: 5,
      upstream: () => hold.run(),
    });
    const first = runImageJob(world, jobInput(world, { slot: "kv", n: 1 }));
    await hold.waitForStarts(1);
    assert.equal(world.calls.length, 1);

    const blocked = await runImageJob(
      world,
      jobInput(world, { action: "tune", slot: "kv", n: 1, imageUrl: "https://img.example/src.png" }),
    );
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, "in_flight");
    assert.equal(blocked.job, undefined);
    assert.equal(world.calls.length, 1);
    assert.equal((await world.quota.snapshot(world.userId, world.now?.() ?? 0)).used, 1);
    assert.equal(messageForImageJobError(new Error("in_flight")), "当前有进行中的出图");

    hold.release();
    const finished = await first;
    assert.equal(finished.ok, true);
    assert.equal(world.calls.length, 1);

    const retry = await runImageJob(world, jobInput(world, { slot: "kv", n: 1 }));
    assert.equal(retry.ok, true);
    assert.equal(world.calls.length, 2);
    assert.equal((await world.quota.snapshot(world.userId, world.now?.() ?? 0)).used, 2);
  });

  it("rejects a second project while the first has running jobs", async () => {
    const hold = holdUpstream();
    const world = createMemoryGatewayWorld({
      cap: 5,
      upstream: () => hold.run(),
    });
    await world.projects.create({
      id: "prj_b",
      userId: world.userId,
      currentImageModelId: DEFAULT_IMAGE_MODEL_ID,
      createdAt: 1,
    });

    const first = runImageJob(world, jobInput(world, { slot: "ui_hero", n: 1 }));
    await hold.waitForStarts(1);

    const blocked = await runImageJob(
      world,
      jobInput(world, { projectId: "prj_b", slot: "kv", n: 1 }),
    );
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, "in_flight");
    assert.equal(world.calls.length, 1);
    assert.equal((await world.quota.snapshot(world.userId, world.now?.() ?? 0)).used, 1);

    hold.release();
    assert.equal((await first).ok, true);

    const later = await runImageJob(
      world,
      jobInput(world, { projectId: "prj_b", slot: "kv", n: 1 }),
    );
    assert.equal(later.ok, true);
    assert.equal(world.calls.length, 2);
  });

  it("lets four direction candidates run together and lock that project", async () => {
    const hold = holdUpstream();
    const world = createMemoryGatewayWorld({
      cap: 10,
      upstream: () => hold.run(),
    });
    await world.projects.create({
      id: "prj_b",
      userId: world.userId,
      currentImageModelId: DEFAULT_IMAGE_MODEL_ID,
      createdAt: 1,
    });

    const pending = [0, 1, 2, 3].map(() =>
      runImageJob(world, jobInput(world, { action: "direction", n: 1 })),
    );
    await hold.waitForStarts(4);
    assert.equal(world.calls.length, 4);
    assert.equal((await world.quota.snapshot(world.userId, world.now?.() ?? 0)).used, 4);

    const fifth = await runImageJob(world, jobInput(world, { action: "direction", n: 1 }));
    assert.equal(fifth.ok, false);
    if (!fifth.ok) assert.equal(fifth.code, "in_flight");
    assert.equal(world.calls.length, 4);

    const otherProject = await runImageJob(
      world,
      jobInput(world, { projectId: "prj_b", action: "direction", n: 1 }),
    );
    assert.equal(otherProject.ok, false);
    if (!otherProject.ok) assert.equal(otherProject.code, "in_flight");
    assert.equal(world.calls.length, 4);
    assert.equal((await world.quota.snapshot(world.userId, world.now?.() ?? 0)).used, 4);

    hold.release();
    const results = await Promise.all(pending);
    assert.ok(results.every((result) => result.ok && result.job.slot === null));
    assert.ok(results.every((result) => result.ok && result.job.status === "succeeded"));
  });

  it("does not start a queued follow-up after a running job finishes", async () => {
    const hold = holdUpstream();
    const world = createMemoryGatewayWorld({
      cap: 5,
      upstream: () => hold.run(),
    });
    const first = runImageJob(world, jobInput(world, { slot: "web_home", n: 1 }));
    await hold.waitForStarts(1);

    const rejected = await runImageJob(world, jobInput(world, { slot: "web_home", n: 1 }));
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.code, "in_flight");

    hold.release();
    assert.equal((await first).ok, true);
    assert.equal(world.calls.length, 1);
    assert.equal((await world.quota.snapshot(world.userId, world.now?.() ?? 0)).used, 1);
  });

  it("keeps the accepted model frozen when the project current model changes", async () => {
    const extra: CatalogModel = {
      id: "mdl-other",
      kind: "image",
      displayName: "Aurora Imagine",
      upstreamId: "aurora-upstream",
      enabled: true,
      capabilities: ["generate"],
      isAdminDefault: false,
    };
    const hold = holdUpstream();
    const world = createMemoryGatewayWorld({
      models: [...defaultCatalogSeed(), extra],
      upstream: () => hold.run(),
    });

    const pending = runImageJob(world, jobInput(world, { slot: "kv", n: 1 }));
    await hold.waitForStarts(1);

    const picked = await pickProjectImageModel(world.catalog, world.projects, {
      userId: world.userId,
      projectId: world.projectId,
      modelId: extra.id,
    });
    assert.equal(picked.ok, true);
    if (picked.ok) assert.equal(picked.value.currentImageModelId, extra.id);

    hold.release();
    const result = await pending;
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.job.catalogModelId, DEFAULT_IMAGE_MODEL_ID);
    assert.equal(result.job.upstreamModelId, "grok-imagine-image-2.0");
    assert.equal(result.job.displayNameSnapshot, "Grok Imagine 2.0");
    assert.equal(world.calls[0]?.upstreamModelId, "grok-imagine-image-2.0");

    const next = await runImageJob(world, jobInput(world, { slot: "kv", n: 1 }));
    assert.equal(next.ok, true);
    if (!next.ok) return;
    assert.equal(next.job.catalogModelId, extra.id);
    assert.equal(world.calls[1]?.upstreamModelId, "aurora-upstream");
  });
});

describe("project model pointer and picker", () => {
  it("stores the admin default image model on new projects", async () => {
    const world = createMemoryGatewayWorld();
    const created = await createStudioProject(world.catalog, world.projects, {
      userId: "user-9",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.value.currentImageModelId, DEFAULT_IMAGE_MODEL_ID);
  });

  it("updates only the project current model when the picker is used", async () => {
    const extra: CatalogModel = {
      id: "mdl-other",
      kind: "image",
      displayName: "Aurora Imagine",
      upstreamId: "aurora-upstream",
      enabled: true,
      capabilities: ["generate"],
      isAdminDefault: false,
    };
    const world = createMemoryGatewayWorld({
      models: [...defaultCatalogSeed(), extra],
    });
    const otherProject = await createStudioProject(world.catalog, world.projects, {
      userId: world.userId,
    });
    assert.equal(otherProject.ok, true);
    if (!otherProject.ok) return;

    const picked = await pickProjectImageModel(world.catalog, world.projects, {
      userId: world.userId,
      projectId: world.projectId,
      modelId: extra.id,
    });
    assert.equal(picked.ok, true);
    if (!picked.ok) return;
    assert.equal(picked.value.currentImageModelId, extra.id);

    const untouched = await world.projects.get(otherProject.value.id);
    assert.equal(untouched?.currentImageModelId, DEFAULT_IMAGE_MODEL_ID);
    const catalog = await world.catalog.get(DEFAULT_IMAGE_MODEL_ID);
    assert.equal(catalog?.isAdminDefault, true);
  });

  it("lists enabled image models by display name and hides chat or disabled rows", async () => {
    const models: CatalogModel[] = [
      {
        id: "mdl-z",
        kind: "image",
        displayName: "Zenith Imagine",
        upstreamId: "z",
        enabled: true,
        capabilities: ["generate"],
        isAdminDefault: false,
      },
      {
        id: "mdl-a",
        kind: "image",
        displayName: "Aurora Imagine",
        upstreamId: "a",
        enabled: true,
        capabilities: ["generate"],
        isAdminDefault: true,
      },
      {
        id: "mdl-off",
        kind: "image",
        displayName: "Disabled Imagine",
        upstreamId: "off",
        enabled: false,
        capabilities: ["generate"],
        isAdminDefault: false,
      },
      {
        id: DEFAULT_CHAT_MODEL_ID,
        kind: "chat",
        displayName: "Grok 4.5",
        upstreamId: "grok-4.5",
        enabled: true,
        capabilities: [],
        isAdminDefault: false,
      },
    ];
    const world = createMemoryGatewayWorld({ models });
    const picker = await listImageModelPicker(world.catalog);
    assert.deepEqual(
      picker.map((item) => item.displayName),
      ["Aurora Imagine", "Zenith Imagine"],
    );
    assert.deepEqual(
      listEnabledImagePicker(models).map((item) => item.id),
      ["mdl-a", "mdl-z"],
    );
  });
});

describe("durable image copies", () => {
  function assertOriginCopy(url: string, upstream: string): void {
    assert.equal(url.startsWith(DURABLE_IMAGE_PATH_PREFIX), true);
    assert.notEqual(url, upstream);
    assert.equal(url.includes("img.example"), false);
    assert.equal(url.startsWith("data:"), false);
  }

  async function assertListOpenMatch(
    world: ReturnType<typeof createMemoryGatewayWorld>,
    jobId: string,
    expectedUrls: string[],
  ): Promise<void> {
    const listed = await listJobImages(world, { userId: world.userId, jobId });
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.deepEqual(
      listed.images.map((image) => image.url),
      expectedUrls,
    );
    for (const image of listed.images) {
      const opened = await openJobImage(world, {
        userId: world.userId,
        imageId: image.id,
      });
      assert.equal(opened.ok, true);
      if (!opened.ok) return;
      assert.equal(opened.image.url, image.url);
      assert.equal(opened.image.jobId, jobId);
      assert.ok(opened.image.bytes.byteLength > 0);
      const stored = await world.blobs.get(image.id);
      assert.ok(stored);
      assert.deepEqual(opened.image.bytes, stored?.bytes);
    }
  }

  it("persists an app-owned copy for generate, tune, compose, and candidates", async () => {
    const cases: Array<{
      action: ImageJobAction;
      n: number;
      imageUrl?: string;
      upstream: string[];
    }> = [
      { action: "direction", n: 1, upstream: ["https://img.example/candidate.png"] },
      { action: "generate", n: 2, upstream: ["https://img.example/a.png", "https://img.example/b.png"] },
      {
        action: "tune",
        n: 1,
        imageUrl: "https://img.example/src.png",
        upstream: ["https://img.example/tune.png"],
      },
      {
        action: "compose",
        n: 1,
        imageUrl: "https://img.example/src.png",
        upstream: ["https://img.example/compose.png"],
      },
    ];

    for (const item of cases) {
      const world = createMemoryGatewayWorld({
        upstream: async () => ({ ok: true, urls: item.upstream }),
      });
      const result = await runImageJob(
        world,
        jobInput(world, {
          action: item.action,
          n: item.n,
          imageUrl: item.imageUrl,
        }),
      );
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.revs.length, item.upstream.length);
      for (const [index, rev] of result.revs.entries()) {
        assertOriginCopy(rev.url, item.upstream[index] ?? "");
        assert.equal(rev.jobId, result.job.id);
      }
      await assertListOpenMatch(
        world,
        result.job.id,
        result.revs.map((rev) => rev.url),
      );
    }
  });

  it("keeps list/open on the durable copy after the upstream URL expires", async () => {
    const upstreamUrl = "https://img.example/live.png";
    const liveBytes = new TextEncoder().encode("durable-pixels");
    let upstreamLive = true;
    const world = createMemoryGatewayWorld({
      upstream: async () => ({ ok: true, urls: [upstreamUrl] }),
      fetchImage: async (url) => {
        if (!upstreamLive) return null;
        if (url !== upstreamUrl) return null;
        return { bytes: liveBytes, contentType: "image/png" };
      },
    });
    const result = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assertOriginCopy(result.revs[0]?.url ?? "", upstreamUrl);

    upstreamLive = false;
    const listed = await listJobImages(world, {
      userId: world.userId,
      jobId: result.job.id,
    });
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.images.length, 1);
    assert.equal(listed.images[0]?.url, result.revs[0]?.url);

    const opened = await openJobImage(world, {
      userId: world.userId,
      imageId: listed.images[0]?.id ?? "",
    });
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    assert.deepEqual(opened.image.bytes, liveBytes);
    assert.equal(opened.image.url, result.revs[0]?.url);
  });

  it("stores no picture and no successful ImageRev when persist cannot copy bytes", async () => {
    const world = createMemoryGatewayWorld({
      upstream: async () => ({ ok: true, urls: ["https://img.example/gone.png"] }),
      fetchImage: async () => null,
    });
    const result = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "upstream_failed");
    assert.equal(result.job?.status, "failed");
    const revs = result.job ? await world.revs.listByJob(result.job.id) : [];
    assert.equal(revs.length, 0);
    const listed = result.job
      ? await listJobImages(world, { userId: world.userId, jobId: result.job.id })
      : { ok: true as const, images: [] };
    assert.equal(listed.ok, true);
    if (listed.ok) assert.equal(listed.images.length, 0);
  });

  it("rewrites a durable source to bytes for tune instead of sending the origin path upstream", async () => {
    const first = createMemoryGatewayWorld();
    const generated = await runImageJob(first, jobInput(first, { n: 1 }));
    assert.equal(generated.ok, true);
    if (!generated.ok) return;
    const durableUrl = generated.revs[0]?.url ?? "";
    assert.equal(durableUrl.startsWith(DURABLE_IMAGE_PATH_PREFIX), true);

    const tuned = await runImageJob(
      first,
      jobInput(first, {
        action: "tune",
        n: 1,
        imageUrl: durableUrl,
      }),
    );
    assert.equal(tuned.ok, true);
    if (!tuned.ok) return;
    const sent = first.calls[1]?.imageUrl ?? "";
    assert.equal(sent.startsWith("data:image/"), true);
    assert.equal(sent.includes(DURABLE_IMAGE_PATH_PREFIX), false);
    await assertListOpenMatch(
      first,
      tuned.job.id,
      tuned.revs.map((rev) => rev.url),
    );
  });
});

describe("list jobs", () => {
  it("scopes the list to the caller and returns newest first", async () => {
    let now = 1_700_000_000_000;
    const world = createMemoryGatewayWorld({
      userId: "designer-1",
      now: () => now,
    });
    await world.projects.create({
      id: "prj-other",
      userId: "admin-1",
      currentImageModelId: DEFAULT_IMAGE_MODEL_ID,
      createdAt: 1,
    });

    const older = await runImageJob(
      world,
      jobInput(world, { userId: "designer-1", action: "generate", n: 1 }),
    );
    assert.equal(older.ok, true);
    now += 1_000;
    const newer = await runImageJob(
      world,
      jobInput(world, { userId: "designer-1", action: "tune", n: 1, imageUrl: "https://img.example/src.png" }),
    );
    assert.equal(newer.ok, true);
    now += 1_000;
    const adminJob = await runImageJob(
      world,
      jobInput(world, {
        userId: "admin-1",
        projectId: "prj-other",
        action: "compose",
        n: 1,
        imageUrl: "https://img.example/src.png",
      }),
    );
    assert.equal(adminJob.ok, true);

    const designerList = await listUserJobs(world, { userId: "designer-1" });
    assert.equal(designerList.ok, true);
    if (!designerList.ok) return;
    assert.deepEqual(
      designerList.jobs.map((job) => job.id),
      [newer.ok ? newer.job.id : "", older.ok ? older.job.id : ""],
    );
    assert.deepEqual(
      designerList.jobs.map((job) => job.action),
      ["tune", "generate"],
    );
    assert.ok(designerList.jobs.every((job) => job.projectId === world.projectId));

    const adminList = await listUserJobs(world, { userId: "admin-1" });
    assert.equal(adminList.ok, true);
    if (!adminList.ok) return;
    assert.equal(adminList.jobs.length, 1);
    assert.equal(adminList.jobs[0]?.id, adminJob.ok ? adminJob.job.id : "");
    assert.equal(adminList.jobs[0]?.action, "compose");
    assert.ok(!adminList.jobs.some((job) => job.id === (newer.ok ? newer.job.id : "")));
  });

  it("keeps the write-time snapshot name after an admin rename", async () => {
    const world = createMemoryGatewayWorld();
    const result = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.job.displayNameSnapshot, "Grok Imagine 2.0");

    await world.catalog.setDisplayName(DEFAULT_IMAGE_MODEL_ID, "Renamed Imagine");
    const listed = await listUserJobs(world, { userId: world.userId });
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.jobs.length, 1);
    assert.equal(listed.jobs[0]?.displayNameSnapshot, "Grok Imagine 2.0");
    const live = await world.catalog.get(DEFAULT_IMAGE_MODEL_ID);
    assert.equal(live?.displayName, "Renamed Imagine");
  });

  it("marks 已停用 from the live catalog flag, not the write-time snapshot", async () => {
    const world = createMemoryGatewayWorld();
    const result = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const before = await listUserJobs(world, { userId: world.userId });
    assert.equal(before.ok, true);
    if (!before.ok) return;
    assert.equal(before.jobs[0]?.modelDisabled, false);
    assert.equal(before.jobs[0]?.displayNameSnapshot, "Grok Imagine 2.0");
    assert.ok(before.jobs[0]?.imageUrls[0]?.startsWith(DURABLE_IMAGE_PATH_PREFIX));

    await world.catalog.setEnabled(DEFAULT_IMAGE_MODEL_ID, false);
    await world.catalog.setDisplayName(DEFAULT_IMAGE_MODEL_ID, "Should Not Appear");
    const disabled = await listUserJobs(world, { userId: world.userId });
    assert.equal(disabled.ok, true);
    if (!disabled.ok) return;
    assert.equal(disabled.jobs[0]?.modelDisabled, true);
    assert.equal(disabled.jobs[0]?.displayNameSnapshot, "Grok Imagine 2.0");

    await world.catalog.setEnabled(DEFAULT_IMAGE_MODEL_ID, true);
    const reenabled = await listUserJobs(world, { userId: world.userId });
    assert.equal(reenabled.ok, true);
    if (!reenabled.ok) return;
    assert.equal(reenabled.jobs[0]?.modelDisabled, false);
    assert.equal(reenabled.jobs[0]?.displayNameSnapshot, "Grok Imagine 2.0");
  });

  it("rejects an empty caller and never lists another user's jobs", async () => {
    const world = createMemoryGatewayWorld({ userId: "designer-1" });
    const result = await runImageJob(world, jobInput(world, { n: 1 }));
    assert.equal(result.ok, true);

    const anon = await listUserJobs(world, { userId: "" });
    assert.equal(anon.ok, false);
    if (anon.ok) return;
    assert.equal(anon.code, "unauthorized");

    const stranger = await listUserJobs(world, { userId: "admin-looking-around" });
    assert.equal(stranger.ok, true);
    if (!stranger.ok) return;
    assert.deepEqual(stranger.jobs, []);
  });
});
