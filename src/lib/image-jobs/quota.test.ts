import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runImageJob } from "./gateway.ts";
import { DEFAULT_IMAGE_MODEL_ID, createMemoryGatewayWorld } from "./memory.ts";
import { getStudioImageState } from "./projects.ts";
import { clearUserDailyCap, setGlobalDailyCap, setUserDailyCap } from "./quota.ts";
import type { RunImageJobInput } from "./types.ts";

describe("user daily cap", () => {
  it("uses a user's daily cap when one is set, and the global cap after it is cleared", async () => {
    const world = createMemoryGatewayWorld({
      cap: 30,
      roles: { "user-1": "admin" },
    });
    const at = world.now?.() ?? 0;

    const initial = await world.quota.snapshot("user-2", at);
    assert.equal(initial.cap, 30);
    assert.equal(initial.remaining, 30);
    assert.equal(initial.used, 0);

    const lowered = await setUserDailyCap(world.roles, world.quota, {
      actorId: "user-1",
      userId: "user-2",
      cap: 2,
    });
    assert.equal(lowered.ok, true);
    if (!lowered.ok) return;
    assert.equal(lowered.cap, 2);

    const overridden = await world.quota.snapshot("user-2", at);
    assert.equal(overridden.cap, 2);
    assert.equal(overridden.remaining, 2);
    assert.equal(overridden.used, 0);

    const untouched = await world.quota.snapshot(world.userId, at);
    assert.equal(untouched.cap, 30);
    assert.equal(untouched.remaining, 30);

    const raised = await setUserDailyCap(world.roles, world.quota, {
      actorId: "user-1",
      userId: world.userId,
      cap: 40,
    });
    assert.equal(raised.ok, true);
    const studio = await getStudioImageState(world.catalog, world.projects, world.quota, {
      userId: world.userId,
      projectId: world.projectId,
      now: at,
    });
    assert.equal(studio.ok, true);
    if (!studio.ok) return;
    assert.equal(studio.value.quota.cap, 40);
    assert.equal(studio.value.quota.remaining, 40);
    assert.equal(studio.value.actions.generate.enabled, true);

    const zero = await setUserDailyCap(world.roles, world.quota, {
      actorId: "user-1",
      userId: world.userId,
      cap: 0,
    });
    assert.equal(zero.ok, true);
    const blocked = await getStudioImageState(world.catalog, world.projects, world.quota, {
      userId: world.userId,
      projectId: world.projectId,
      now: at,
    });
    assert.equal(blocked.ok, true);
    if (!blocked.ok) return;
    assert.equal(blocked.value.quota.cap, 0);
    assert.equal(blocked.value.quota.remaining, 0);
    assert.equal(blocked.value.actions.generate.enabled, false);
    assert.equal(blocked.value.actions.generate.code, "quota_exceeded");

    const clearedSelf = await clearUserDailyCap(world.roles, world.quota, {
      actorId: "user-1",
      userId: world.userId,
    });
    assert.equal(clearedSelf.ok, true);
    assert.equal((await world.quota.snapshot(world.userId, at)).cap, 30);

    const global = await setGlobalDailyCap(world.roles, world.quota, {
      userId: "user-1",
      cap: 8,
    });
    assert.equal(global.ok, true);
    assert.equal((await world.quota.snapshot("user-2", at)).cap, 2);
    assert.equal((await world.quota.snapshot(world.userId, at)).cap, 8);

    const cleared = await clearUserDailyCap(world.roles, world.quota, {
      actorId: "user-1",
      userId: "user-2",
    });
    assert.equal(cleared.ok, true);
    const restored = await world.quota.snapshot("user-2", at);
    assert.equal(restored.cap, 8);
    assert.equal(restored.remaining, 8);
  });

  it("stops debiting once the user's own daily cap is spent and still allows the global cap for everyone else", async () => {
    const world = createMemoryGatewayWorld({
      cap: 30,
      roles: { "user-1": "admin" },
    });
    const at = world.now?.() ?? 0;
    const set = await setUserDailyCap(world.roles, world.quota, {
      actorId: "user-1",
      userId: world.userId,
      cap: 2,
    });
    assert.equal(set.ok, true);

    const first = await runImageJob(world, jobInput(world));
    const second = await runImageJob(world, jobInput(world));
    const third = await runImageJob(world, jobInput(world));
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(third.ok, false);
    if (!third.ok) assert.equal(third.code, "quota_exceeded");
    assert.equal(world.calls.length, 2);
    const spent = await world.quota.snapshot(world.userId, at);
    assert.equal(spent.used, 2);
    assert.equal(spent.remaining, 0);
    assert.equal(spent.cap, 2);

    await world.projects.create({
      id: "prj_other",
      userId: "user-2",
      currentImageModelId: DEFAULT_IMAGE_MODEL_ID,
      createdAt: 1,
      deletedAt: null,
    });
    const other = await runImageJob(
      world,
      jobInput(world, { userId: "user-2", projectId: "prj_other" }),
    );
    assert.equal(other.ok, true);
    const otherSnap = await world.quota.snapshot("user-2", at);
    assert.equal(otherSnap.cap, 30);
    assert.equal(otherSnap.used, 1);
    assert.equal(otherSnap.remaining, 29);

    const zeroed = await setUserDailyCap(world.roles, world.quota, {
      actorId: "user-1",
      userId: "user-2",
      cap: 0,
    });
    assert.equal(zeroed.ok, true);
    const refused = await runImageJob(
      world,
      jobInput(world, { userId: "user-2", projectId: "prj_other" }),
    );
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.code, "quota_exceeded");
    assert.equal((await world.quota.snapshot("user-2", at)).used, 1);
    assert.equal(world.calls.length, 3);
  });

  it("rejects a non-admin setting or clearing a user's daily cap", async () => {
    const world = createMemoryGatewayWorld({
      cap: 30,
      roles: { "admin-1": "admin" },
    });
    const at = world.now?.() ?? 0;

    const denied = await setUserDailyCap(world.roles, world.quota, {
      actorId: world.userId,
      userId: "user-2",
      cap: 2,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "forbidden");
    assert.equal((await world.quota.snapshot("user-2", at)).cap, 30);

    const anonymous = await setUserDailyCap(world.roles, world.quota, {
      actorId: "",
      userId: "user-2",
      cap: 2,
    });
    assert.equal(anonymous.ok, false);
    if (!anonymous.ok) assert.equal(anonymous.code, "unauthorized");

    const invalid = await setUserDailyCap(world.roles, world.quota, {
      actorId: "admin-1",
      userId: "user-2",
      cap: 10000,
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, "forbidden");
    assert.equal((await world.quota.snapshot("user-2", at)).cap, 30);

    const set = await setUserDailyCap(world.roles, world.quota, {
      actorId: "admin-1",
      userId: "user-2",
      cap: 2,
    });
    assert.equal(set.ok, true);

    const clearDenied = await clearUserDailyCap(world.roles, world.quota, {
      actorId: world.userId,
      userId: "user-2",
    });
    assert.equal(clearDenied.ok, false);
    if (!clearDenied.ok) assert.equal(clearDenied.code, "forbidden");
    assert.equal((await world.quota.snapshot("user-2", at)).cap, 2);

    const cleared = await clearUserDailyCap(world.roles, world.quota, {
      actorId: "admin-1",
      userId: "user-2",
    });
    assert.equal(cleared.ok, true);
    assert.equal((await world.quota.snapshot("user-2", at)).cap, 30);
  });
});

function jobInput(
  world: ReturnType<typeof createMemoryGatewayWorld>,
  patch: Partial<RunImageJobInput> = {},
): RunImageJobInput {
  return {
    userId: world.userId,
    projectId: world.projectId,
    action: "generate",
    slot: "kv",
    prompt: "a quiet editorial board",
    aspect: "16:9",
    n: 1,
    ...patch,
  };
}
