import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBatchQueue, planBatch } from "./batch-generate.ts";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("planBatch", () => {
  it("skips slots that already have a running task and charges one unit per other slot", () => {
    const plan = planBatch({
      enabled: [
        { id: "kv", name: "品牌主视觉" },
        { id: "ui_hero", name: "产品旗舰页" },
        { id: "web_home", name: "官网首屏" },
      ],
      runningIds: ["ui_hero", "not-enabled"],
      remaining: 5,
    });

    assert.deepEqual(plan.start, [
      { id: "kv", name: "品牌主视觉" },
      { id: "web_home", name: "官网首屏" },
    ]);
    assert.deepEqual(plan.skipped, [{ id: "ui_hero", name: "产品旗舰页" }]);
    assert.equal(plan.cost, 2);
    assert.equal(plan.quotaEnough, true);
  });

  it("starts every idle slot when remaining equals the cost", () => {
    const plan = planBatch({
      enabled: [
        { id: "kv", name: "品牌主视觉" },
        { id: "ui_hero", name: "产品旗舰页" },
        { id: "web_home", name: "官网首屏" },
      ],
      runningIds: ["ui_hero"],
      remaining: 2,
    });

    assert.deepEqual(
      plan.start.map((slot) => slot.id),
      ["kv", "web_home"],
    );
    assert.equal(plan.cost, 2);
    assert.equal(plan.quotaEnough, true);
  });

  it("refuses the whole batch when remaining is short of the cost", () => {
    const plan = planBatch({
      enabled: [
        { id: "kv", name: "品牌主视觉" },
        { id: "ui_hero", name: "产品旗舰页" },
        { id: "web_home", name: "官网首屏" },
        { id: "app_icon", name: "App 图标" },
      ],
      runningIds: ["ui_hero"],
      remaining: 2,
    });

    assert.equal(plan.cost, 3);
    assert.equal(plan.quotaEnough, false);
    assert.deepEqual(plan.start, []);
    assert.deepEqual(plan.skipped, [{ id: "ui_hero", name: "产品旗舰页" }]);
  });
});

describe("createBatchQueue", () => {
  it("runs at most 4 slot tasks at once", async () => {
    const queue = createBatchQueue();
    const gates = Array.from({ length: 6 }, () => deferred<void>());
    const started: string[] = [];
    const pending = queue.enqueue(
      gates.map((gate, index) => ({
        id: `slot-${index}`,
        run: () => {
          started.push(`slot-${index}`);
          return gate.promise;
        },
      })),
    );

    assert.deepEqual(started, ["slot-0", "slot-1", "slot-2", "slot-3"]);

    gates[0].resolve();
    await gates[0].promise;
    assert.deepEqual(started, ["slot-0", "slot-1", "slot-2", "slot-3", "slot-4"]);

    for (const gate of gates) gate.resolve();
    const outcomes = await pending;
    assert.deepEqual(
      outcomes.map((item) => item.status),
      ["done", "done", "done", "done", "done", "done"],
    );
    assert.deepEqual(started, ["slot-0", "slot-1", "slot-2", "slot-3", "slot-4", "slot-5"]);
  });

  it("drops tasks that have not started and still finishes a call already made", async () => {
    const queue = createBatchQueue();
    const gates = Array.from({ length: 6 }, () => deferred<void>());
    const started: string[] = [];
    const statuses: Array<[string, string]> = [];
    const pending = queue.enqueue(
      gates.map((gate, index) => ({
        id: `slot-${index}`,
        run: () => {
          started.push(`slot-${index}`);
          return gate.promise;
        },
      })),
      (id, status) => {
        statuses.push([id, status]);
      },
    );

    assert.deepEqual(started, ["slot-0", "slot-1", "slot-2", "slot-3"]);
    queue.cancel();
    assert.deepEqual(started, ["slot-0", "slot-1", "slot-2", "slot-3"]);
    assert.deepEqual(
      statuses.filter(([id]) => id === "slot-4").map(([, status]) => status),
      ["queued", "dropped"],
    );
    assert.equal(
      statuses.some(([id, status]) => id === "slot-5" && status === "running"),
      false,
    );

    for (const gate of gates) gate.resolve();
    const outcomes = await pending;
    assert.deepEqual(
      outcomes.map((item) => item.status),
      ["done", "done", "done", "done", "dropped", "dropped"],
    );
    assert.deepEqual(started, ["slot-0", "slot-1", "slot-2", "slot-3"]);
  });

  it("keeps the other slots going when one slot fails", async () => {
    const queue = createBatchQueue();
    const gates = Array.from({ length: 5 }, () => deferred<void>());
    const started: string[] = [];
    const pending = queue.enqueue(
      gates.map((gate, index) => ({
        id: `slot-${index}`,
        run: () => {
          started.push(`slot-${index}`);
          if (index === 0) return Promise.reject(new Error("slot failed"));
          return gate.promise;
        },
      })),
    );

    assert.deepEqual(started, ["slot-0", "slot-1", "slot-2", "slot-3"]);
    await Promise.resolve();
    assert.deepEqual(started, ["slot-0", "slot-1", "slot-2", "slot-3", "slot-4"]);

    for (const gate of gates) gate.resolve();
    const outcomes = await pending;
    assert.deepEqual(
      outcomes.map((item) => item.status),
      ["failed", "done", "done", "done", "done"],
    );
  });

  it("keeps a shared status listener until every enqueue that used it has finished", async () => {
    const queue = createBatchQueue(1);
    const gate = deferred<void>();
    const seen: string[] = [];
    const listener = (id: string, status: string) => {
      if (id === "second" && status === "running") seen.push(status);
    };
    const first = queue.enqueue([{ id: "first", run: () => gate.promise }], listener);
    const second = queue.enqueue([{ id: "second", run: async () => {} }], listener);
    gate.resolve();
    await first;
    await second;
    assert.deepEqual(seen, ["running"]);
  });
});
