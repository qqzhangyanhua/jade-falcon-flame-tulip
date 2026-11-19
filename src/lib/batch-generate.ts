export type BatchSlot = {
  id: string;
  name: string;
};

export type BatchPlan = {
  /** Slots to start. Empty when quota does not cover every one of them. */
  start: BatchSlot[];
  /** Enabled slots left out because a task is already running. */
  skipped: BatchSlot[];
  /** One quota unit per task that would start, including when the batch is refused. */
  cost: number;
  quotaEnough: boolean;
};

/** Short remaining refuses the whole start list. It never returns a prefix that fits. */
export function planBatch(input: {
  enabled: readonly BatchSlot[];
  runningIds: readonly string[];
  remaining: number;
}): BatchPlan {
  const running = new Set(input.runningIds);
  const eligible: BatchSlot[] = [];
  const skipped: BatchSlot[] = [];
  for (const slot of input.enabled) {
    const copy = { id: slot.id, name: slot.name };
    if (running.has(slot.id)) skipped.push(copy);
    else eligible.push(copy);
  }
  const cost = eligible.length;
  const quotaEnough = input.remaining >= cost;
  return {
    start: quotaEnough ? eligible : [],
    skipped,
    cost,
    quotaEnough,
  };
}

/** Upstream allows more, but a batch stays at 4 so a burst does not sit on the limit. */
export const BATCH_CONCURRENCY = 4;

export type BatchTaskStatus = "queued" | "running" | "done" | "failed" | "dropped";

export type BatchTaskOutcome = {
  id: string;
  status: "done" | "failed" | "dropped";
};

type QueuedTask = {
  id: string;
  run: () => Promise<unknown>;
  resolve: (outcome: BatchTaskOutcome) => void;
};

export type BatchQueue = {
  enqueue(
    tasks: ReadonlyArray<{ id: string; run: () => Promise<unknown> }>,
    onStatus?: (id: string, status: BatchTaskStatus) => void,
  ): Promise<BatchTaskOutcome[]>;
  /** Drops tasks whose runner has not been called. Invoked runners are left to finish. */
  cancel(): void;
};

export function createBatchQueue(concurrency = BATCH_CONCURRENCY): BatchQueue {
  const pending: QueuedTask[] = [];
  let active = 0;
  const listeners = new Set<(id: string, status: BatchTaskStatus) => void>();

  function emit(id: string, status: BatchTaskStatus) {
    for (const listener of listeners) listener(id, status);
  }

  function finish(task: QueuedTask, status: "done" | "failed" | "dropped") {
    emit(task.id, status);
    task.resolve({ id: task.id, status });
  }

  function pump() {
    while (active < concurrency && pending.length > 0) {
      const task = pending.shift();
      if (!task) break;
      active += 1;
      emit(task.id, "running");
      let result: Promise<unknown>;
      try {
        result = task.run();
      } catch (error) {
        result = Promise.reject(error);
      }
      void Promise.resolve(result).then(
        () => {
          active -= 1;
          finish(task, "done");
          pump();
        },
        () => {
          active -= 1;
          finish(task, "failed");
          pump();
        },
      );
    }
  }

  return {
    enqueue(tasks, onStatus) {
      if (onStatus) listeners.add(onStatus);
      const outcomes = tasks.map(
        (task) =>
          new Promise<BatchTaskOutcome>((resolve) => {
            pending.push({ id: task.id, run: task.run, resolve });
            onStatus?.(task.id, "queued");
          }),
      );
      pump();
      return Promise.all(outcomes).finally(() => {
        if (onStatus) listeners.delete(onStatus);
      });
    },
    cancel() {
      const dropped = pending.splice(0, pending.length);
      for (const task of dropped) finish(task, "dropped");
    },
  };
}
