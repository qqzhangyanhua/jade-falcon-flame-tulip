import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateImageAction, listEnabledImagePicker } from "./availability.ts";
import { beijingCalendarDay } from "./beijing-day.ts";
import { IMAGE_JOB_USER_MESSAGES, messageForImageJobError } from "./errors.ts";
import { runImageJob } from "./gateway.ts";
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
import { IMAGE_JOB_ACTIONS, IMAGE_JOB_ERROR_CODES } from "./types.ts";

function jobInput(
  world: ReturnType<typeof createMemoryGatewayWorld>,
  patch: Partial<RunImageJobInput> = {},
): RunImageJobInput {
  return {
    userId: world.userId,
    projectId: world.projectId,
    action: "generate",
    prompt: "a quiet editorial board",
    aspect: "16:9",
    n: 2,
    ...patch,
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

  it("includes quota_exceeded in the closed client error set", () => {
    assert.ok((IMAGE_JOB_ERROR_CODES as readonly string[]).includes("quota_exceeded"));
    assert.equal(IMAGE_JOB_USER_MESSAGES.quota_exceeded, "今日额度已用完");
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
