import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runImageJob } from "./gateway.ts";
import { DEFAULT_IMAGE_MODEL_ID, createMemoryGatewayWorld } from "./memory.ts";
import { getStudioImageState } from "./projects.ts";
import {
  clearUserDailyCap,
  grantUserBoost,
  listImageUsage,
  listUserBoostLedger,
  setGlobalDailyCap,
  setUserDailyCap,
} from "./quota.ts";
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

describe("boost grant", () => {
  it("lets an admin grant a boost and records each grant on the ledger", async () => {
    const world = createMemoryGatewayWorld({
      cap: 30,
      roles: { "admin-1": "admin" },
    });
    const at = world.now?.() ?? 0;

    const before = await world.quota.snapshot("user-2", at);
    assert.equal(before.boost, 0);
    assert.equal(before.remaining, 30);
    assert.equal(before.used, 0);

    const granted = await grantUserBoost(world.roles, world.quota, {
      actorId: "admin-1",
      userId: "user-2",
      amount: 5,
      note: "试用客户",
      at,
    });
    assert.equal(granted.ok, true);
    if (!granted.ok) return;
    assert.equal(granted.balance, 5);

    const after = await world.quota.snapshot("user-2", at);
    assert.equal(after.boost, 5);
    assert.equal(after.cap, 30);
    assert.equal(after.remaining, 30);
    assert.equal(after.used, 0);

    const again = await grantUserBoost(world.roles, world.quota, {
      actorId: "admin-1",
      userId: "user-2",
      amount: 2,
      note: "再补一次",
      at: at + 1000,
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.balance, 7);
    assert.equal((await world.quota.snapshot("user-2", at)).boost, 7);
    assert.equal((await world.quota.snapshot(world.userId, at)).boost, 0);

    const ledger = await world.quota.listBoostLedger("user-2");
    assert.deepEqual(
      ledger.map((entry) => ({
        kind: entry.kind,
        amount: entry.amount,
        at: entry.at,
        adminId: entry.adminId,
        remark: entry.remark,
        jobId: entry.jobId,
      })),
      [
        {
          kind: "grant",
          amount: 5,
          at,
          adminId: "admin-1",
          remark: "试用客户",
          jobId: null,
        },
        {
          kind: "grant",
          amount: 2,
          at: at + 1000,
          adminId: "admin-1",
          remark: "再补一次",
          jobId: null,
        },
      ],
    );

    const denied = await listUserBoostLedger(world.roles, world.quota, {
      actorId: world.userId,
      userId: "user-2",
    });
    assert.deepEqual(denied, { ok: false, code: "forbidden" });
    const read = await listUserBoostLedger(world.roles, world.quota, {
      actorId: "admin-1",
      userId: "user-2",
    });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.deepEqual(
      read.entries.map((entry) => ({
        kind: entry.kind,
        amount: entry.amount,
        adminId: entry.adminId,
        remark: entry.remark,
        jobId: entry.jobId,
      })),
      ledger.map((entry) => ({
        kind: entry.kind,
        amount: entry.amount,
        adminId: entry.adminId,
        remark: entry.remark,
        jobId: entry.jobId,
      })),
    );
  });

  it("rejects a non-admin grant and leaves the balance and ledger untouched", async () => {
    const world = createMemoryGatewayWorld({
      cap: 30,
      roles: { "admin-1": "admin" },
    });
    const at = world.now?.() ?? 0;

    const denied = await grantUserBoost(world.roles, world.quota, {
      actorId: world.userId,
      userId: "user-2",
      amount: 4,
      note: "不该成功",
      at,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "forbidden");

    const anonymous = await grantUserBoost(world.roles, world.quota, {
      actorId: "",
      userId: "user-2",
      amount: 4,
      note: "不该成功",
      at,
    });
    assert.equal(anonymous.ok, false);
    if (!anonymous.ok) assert.equal(anonymous.code, "unauthorized");

    const blankUser = await grantUserBoost(world.roles, world.quota, {
      actorId: "admin-1",
      userId: "  ",
      amount: 4,
      note: "不该成功",
      at,
    });
    assert.equal(blankUser.ok, false);
    if (!blankUser.ok) assert.equal(blankUser.code, "not_found");

    for (const amount of [0, -1, 1.5, 10000]) {
      const invalid = await grantUserBoost(world.roles, world.quota, {
        actorId: "admin-1",
        userId: "user-2",
        amount,
        note: "不该成功",
        at,
      });
      assert.equal(invalid.ok, false);
      if (!invalid.ok) assert.equal(invalid.code, "forbidden");
    }

    const blankNote = await grantUserBoost(world.roles, world.quota, {
      actorId: "admin-1",
      userId: "user-2",
      amount: 4,
      note: "   ",
      at,
    });
    assert.equal(blankNote.ok, false);
    if (!blankNote.ok) assert.equal(blankNote.code, "forbidden");

    assert.equal((await world.quota.snapshot("user-2", at)).boost, 0);
    assert.deepEqual(await world.quota.listBoostLedger("user-2"), []);
  });
});

describe("boost spend", () => {
  it("spends today's cap before the boost and refuses when both are empty", async () => {
    const now = Date.parse("2026-01-01T15:00:00.000Z");
    const world = createMemoryGatewayWorld({
      cap: 1,
      now: () => now,
      roles: { "admin-1": "admin" },
    });
    const granted = await grantUserBoost(world.roles, world.quota, {
      actorId: "admin-1",
      userId: world.userId,
      amount: 2,
      note: "试用",
      at: now,
    });
    assert.equal(granted.ok, true);

    const first = await runImageJob(world, jobInput(world));
    assert.equal(first.ok, true);
    let snap = await world.quota.snapshot(world.userId, now);
    assert.equal(snap.used, 1);
    assert.equal(snap.remaining, 0);
    assert.equal(snap.boost, 2);
    assert.equal(debits(await world.quota.listBoostLedger(world.userId)).length, 0);

    const stillOpen = await getStudioImageState(world.catalog, world.projects, world.quota, {
      userId: world.userId,
      projectId: world.projectId,
      now,
    });
    assert.equal(stillOpen.ok, true);
    if (!stillOpen.ok) return;
    assert.equal(stillOpen.value.quota.remaining, 0);
    assert.equal(stillOpen.value.quota.boost, 2);
    assert.equal(stillOpen.value.actions.generate.enabled, true);

    const second = await runImageJob(world, jobInput(world));
    assert.equal(second.ok, true);
    if (!second.ok) return;
    const firstDebit = debits(await world.quota.listBoostLedger(world.userId));
    assert.equal(firstDebit.length, 1);
    assert.equal(firstDebit[0]?.amount, 1);
    assert.equal(firstDebit[0]?.adminId, null);
    assert.equal(firstDebit[0]?.jobId, second.job.id);
    assert.equal(firstDebit[0]?.remark, null);
    assert.equal(firstDebit[0]?.at, second.job.createdAt);
    snap = await world.quota.snapshot(world.userId, now);
    assert.equal(snap.used, 1);
    assert.equal(snap.remaining, 0);
    assert.equal(snap.boost, 1);

    const third = await runImageJob(world, jobInput(world));
    assert.equal(third.ok, true);
    snap = await world.quota.snapshot(world.userId, now);
    assert.equal(snap.used, 1);
    assert.equal(snap.remaining, 0);
    assert.equal(snap.boost, 0);
    assert.equal(debits(await world.quota.listBoostLedger(world.userId)).length, 2);

    const closed = await getStudioImageState(world.catalog, world.projects, world.quota, {
      userId: world.userId,
      projectId: world.projectId,
      now,
    });
    assert.equal(closed.ok, true);
    if (!closed.ok) return;
    assert.equal(closed.value.actions.generate.enabled, false);
    assert.equal(closed.value.actions.generate.code, "quota_exceeded");
    assert.equal(closed.value.actions.generate.reason, "今日额度已用完");

    world.calls.length = 0;
    const blocked = await runImageJob(world, jobInput(world));
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.code, "quota_exceeded");
      assert.equal(blocked.job, undefined);
    }
    assert.equal(world.calls.length, 0);
    snap = await world.quota.snapshot(world.userId, now);
    assert.equal(snap.used, 1);
    assert.equal(snap.remaining, 0);
    assert.equal(snap.boost, 0);
    assert.equal(debits(await world.quota.listBoostLedger(world.userId)).length, 2);
  });

  it("keeps a boost balance across Beijing midnight and spends the new day's cap first", async () => {
    let now = Date.parse("2026-01-01T15:59:59.999Z");
    const nextDay = Date.parse("2026-01-01T16:00:00.000Z");
    const world = createMemoryGatewayWorld({
      cap: 1,
      now: () => now,
      roles: { "admin-1": "admin" },
    });
    const granted = await grantUserBoost(world.roles, world.quota, {
      actorId: "admin-1",
      userId: world.userId,
      amount: 2,
      note: "跨日",
      at: now,
    });
    assert.equal(granted.ok, true);
    assert.equal((await runImageJob(world, jobInput(world))).ok, true);
    assert.equal((await world.quota.snapshot(world.userId, now)).boost, 2);
    assert.equal((await runImageJob(world, jobInput(world))).ok, true);
    assert.equal((await world.quota.snapshot(world.userId, now)).boost, 1);

    now = nextDay;
    const rolled = await world.quota.snapshot(world.userId, now);
    assert.equal(rolled.beijingDay, "2026-01-02");
    assert.equal(rolled.used, 0);
    assert.equal(rolled.remaining, 1);
    assert.equal(rolled.boost, 1);
    assert.equal((await world.quota.snapshot(world.userId, nextDay - 1)).boost, 1);

    assert.equal((await runImageJob(world, jobInput(world))).ok, true);
    const after = await world.quota.snapshot(world.userId, now);
    assert.equal(after.used, 1);
    assert.equal(after.remaining, 0);
    assert.equal(after.boost, 1);
    assert.equal(debits(await world.quota.listBoostLedger(world.userId)).length, 1);
  });

  it("spends the boost when the daily cap is zero", async () => {
    const world = createMemoryGatewayWorld({
      cap: 30,
      roles: { "admin-1": "admin" },
    });
    const at = world.now?.() ?? 0;
    const zero = await setUserDailyCap(world.roles, world.quota, {
      actorId: "admin-1",
      userId: world.userId,
      cap: 0,
    });
    assert.equal(zero.ok, true);
    const granted = await grantUserBoost(world.roles, world.quota, {
      actorId: "admin-1",
      userId: world.userId,
      amount: 1,
      note: "上限为零",
      at,
    });
    assert.equal(granted.ok, true);

    const result = await runImageJob(world, jobInput(world));
    assert.equal(result.ok, true);
    const snap = await world.quota.snapshot(world.userId, at);
    assert.equal(snap.cap, 0);
    assert.equal(snap.used, 0);
    assert.equal(snap.remaining, 0);
    assert.equal(snap.boost, 0);
    assert.equal(debits(await world.quota.listBoostLedger(world.userId)).length, 1);

    const blocked = await runImageJob(world, jobInput(world));
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, "quota_exceeded");
    assert.equal(world.calls.length, 1);
  });

  it("does not refund a boost debit when the image job fails", async () => {
    const world = createMemoryGatewayWorld({
      cap: 1,
      roles: { "admin-1": "admin" },
      upstream: async () => {
        throw new Error("upstream down");
      },
    });
    const at = world.now?.() ?? 0;
    const granted = await grantUserBoost(world.roles, world.quota, {
      actorId: "admin-1",
      userId: world.userId,
      amount: 2,
      note: "失败不退",
      at,
    });
    assert.equal(granted.ok, true);

    const daily = await runImageJob(world, jobInput(world));
    assert.equal(daily.ok, false);
    if (!daily.ok) assert.equal(daily.code, "upstream_failed");
    let snap = await world.quota.snapshot(world.userId, at);
    assert.equal(snap.used, 1);
    assert.equal(snap.remaining, 0);
    assert.equal(snap.boost, 2);
    assert.equal(debits(await world.quota.listBoostLedger(world.userId)).length, 0);

    const boosted = await runImageJob(world, jobInput(world));
    assert.equal(boosted.ok, false);
    if (boosted.ok) return;
    assert.equal(boosted.code, "upstream_failed");
    assert.equal(boosted.job?.status, "failed");
    snap = await world.quota.snapshot(world.userId, at);
    assert.equal(snap.used, 1);
    assert.equal(snap.remaining, 0);
    assert.equal(snap.boost, 1);
    const rows = debits(await world.quota.listBoostLedger(world.userId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.amount, 1);
    assert.equal(rows[0]?.adminId, null);
    assert.equal(rows[0]?.jobId, boosted.job?.id);
    assert.equal(rows[0]?.remark, null);
  });

  it("does not overspend the daily cap plus the boost when generates run together", async () => {
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    const world = createMemoryGatewayWorld({
      cap: 1,
      roles: { "admin-1": "admin" },
      upstream: async () => {
        started += 1;
        await held;
        return { ok: true, urls: ["https://img.example/a.png"] };
      },
    });
    const at = world.now?.() ?? 0;
    const granted = await grantUserBoost(world.roles, world.quota, {
      actorId: "admin-1",
      userId: world.userId,
      amount: 1,
      note: "并发",
      at,
    });
    assert.equal(granted.ok, true);

    let rejected = 0;
    const pending = Promise.all(
      Array.from({ length: 8 }, () =>
        runImageJob(world, jobInput(world, { action: "direction", n: 1 })).then((result) => {
          if (!result.ok) rejected += 1;
          return result;
        }),
      ),
    );
    const startedAt = Date.now();
    while (started < 2 || rejected < 6) {
      if (Date.now() - startedAt > 1000) {
        throw new Error(`timed out with ${started} started and ${rejected} rejected`);
      }
      await new Promise((resolve) => setImmediate(resolve));
    }

    const mid = await world.quota.snapshot(world.userId, at);
    assert.equal(started, 2);
    assert.equal(mid.used, 1);
    assert.equal(mid.remaining, 0);
    assert.equal(mid.boost, 0);
    assert.equal(debits(await world.quota.listBoostLedger(world.userId)).length, 1);

    release();
    const results = await pending;
    assert.equal(results.filter((result) => result.ok).length, 2);
    assert.equal(
      results.filter((result) => !result.ok && result.code === "quota_exceeded").length,
      6,
    );
    const after = await world.quota.snapshot(world.userId, at);
    assert.equal(after.used, 1);
    assert.equal(after.remaining, 0);
    assert.equal(after.boost, 0);
    const rows = debits(await world.quota.listBoostLedger(world.userId));
    assert.equal(rows.length, 1);
    assert.ok(
      rows.every(
        (entry) =>
          entry.amount === 1 &&
          entry.adminId === null &&
          entry.remark === null &&
          (entry.jobId?.length ?? 0) > 0,
      ),
    );
  });
});

describe("image usage over 30 Beijing days", () => {
  it("returns 30 days ending today and fills unused days with zero", async () => {
    const now = Date.parse("2026-03-15T04:00:00.000Z");
    const world = createMemoryGatewayWorld({ cap: 30, now: () => now });
    const days = await listImageUsage(world.quota, { userId: world.userId, atMs: now });

    assert.equal(days.length, 30);
    assert.equal(days[0]?.day, "2026-02-14");
    assert.equal(days[15]?.day, "2026-03-01");
    assert.equal(days[29]?.day, "2026-03-15");
    for (let index = 1; index < days.length; index += 1) {
      assert.equal(days[index]?.day, nextUtcDay(days[index - 1]!.day));
    }
    assert.ok(days.every((day) => day.daily === 0 && day.boost === 0));
  });

  it("counts a day's cap spends and 加量包 debits separately, and ignores a grant", async () => {
    let now = Date.parse("2026-03-10T04:00:00.000Z");
    const world = createMemoryGatewayWorld({
      cap: 1,
      now: () => now,
      roles: { "admin-1": "admin" },
    });
    const granted = await grantUserBoost(world.roles, world.quota, {
      actorId: "admin-1",
      userId: world.userId,
      amount: 4,
      note: "试用加量包",
      at: now,
    });
    assert.equal(granted.ok, true);

    now = Date.parse("2026-03-15T04:00:00.000Z");
    assert.equal((await runImageJob(world, jobInput(world))).ok, true);
    assert.equal((await runImageJob(world, jobInput(world))).ok, true);

    const days = await listImageUsage(world.quota, { userId: world.userId, atMs: now });
    assert.equal(days.length, 30);
    assert.deepEqual(
      days.find((day) => day.day === "2026-03-10"),
      { day: "2026-03-10", daily: 0, boost: 0 },
    );
    assert.deepEqual(
      days.find((day) => day.day === "2026-03-15"),
      { day: "2026-03-15", daily: 1, boost: 1 },
    );
    assert.equal(
      days.reduce((sum, day) => sum + day.daily, 0),
      1,
    );
    assert.equal(
      days.reduce((sum, day) => sum + day.boost, 0),
      1,
    );
  });

  it("lands a spend just before Beijing midnight and one just after on different days", async () => {
    let now = Date.parse("2026-01-01T15:59:59.999Z");
    const afterMidnight = Date.parse("2026-01-01T16:00:00.000Z");
    const world = createMemoryGatewayWorld({
      cap: 1,
      now: () => now,
      roles: { "admin-1": "admin" },
    });
    const granted = await grantUserBoost(world.roles, world.quota, {
      actorId: "admin-1",
      userId: world.userId,
      amount: 1,
      note: "跨日",
      at: now,
    });
    assert.equal(granted.ok, true);
    assert.equal((await runImageJob(world, jobInput(world))).ok, true);

    now = afterMidnight;
    assert.equal((await runImageJob(world, jobInput(world))).ok, true);
    assert.equal((await runImageJob(world, jobInput(world))).ok, true);

    const days = await listImageUsage(world.quota, { userId: world.userId, atMs: afterMidnight });
    assert.equal(days.length, 30);
    assert.equal(days[0]?.day, "2025-12-04");
    assert.equal(days[29]?.day, "2026-01-02");
    assert.deepEqual(
      days.find((day) => day.day === "2026-01-01"),
      { day: "2026-01-01", daily: 1, boost: 0 },
    );
    assert.deepEqual(
      days.find((day) => day.day === "2026-01-02"),
      { day: "2026-01-02", daily: 1, boost: 1 },
    );
  });

  it("returns only the requested user's daily cap and 加量包 spends", async () => {
    const now = Date.parse("2026-03-15T04:00:00.000Z");
    const world = createMemoryGatewayWorld({
      cap: 1,
      now: () => now,
      roles: { "admin-1": "admin" },
    });
    await world.projects.create({
      id: "prj_other",
      userId: "user-2",
      currentImageModelId: DEFAULT_IMAGE_MODEL_ID,
      createdAt: 1,
      deletedAt: null,
    });
    const granted = await grantUserBoost(world.roles, world.quota, {
      actorId: "admin-1",
      userId: "user-2",
      amount: 3,
      note: "别人的加量包",
      at: now,
    });
    assert.equal(granted.ok, true);
    assert.equal(
      (await runImageJob(world, jobInput(world, { userId: "user-2", projectId: "prj_other" }))).ok,
      true,
    );
    assert.equal(
      (await runImageJob(world, jobInput(world, { userId: "user-2", projectId: "prj_other" }))).ok,
      true,
    );

    const mine = await listImageUsage(world.quota, { userId: world.userId, atMs: now });
    assert.equal(mine.length, 30);
    assert.ok(mine.every((day) => day.daily === 0 && day.boost === 0));

    const theirs = await listImageUsage(world.quota, { userId: "user-2", atMs: now });
    assert.deepEqual(
      theirs.find((day) => day.day === "2026-03-15"),
      { day: "2026-03-15", daily: 1, boost: 1 },
    );
    assert.equal(
      theirs.reduce((sum, day) => sum + day.boost, 0),
      1,
    );
  });
});

function nextUtcDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, (month ?? 1) - 1, date!) + 86_400_000);
  const monthText = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dateText = String(utc.getUTCDate()).padStart(2, "0");
  return `${utc.getUTCFullYear()}-${monthText}-${dateText}`;
}

function debits(
  entries: Awaited<
    ReturnType<ReturnType<typeof createMemoryGatewayWorld>["quota"]["listBoostLedger"]>
  >,
) {
  return entries.filter((entry) => entry.kind === "debit");
}

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
