import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { candidatePrompt, slotPrompt, SLOT_ASPECT, tunePrompt } from "@/lib/prompts";
import { PRESETS } from "@/lib/presets";
import type { Slot, StyleDna } from "@/lib/types";
import { ImageJobError } from "./errors.ts";
import { runImageJob, unwrapImageJob } from "./gateway.ts";
import {
  createStudioProject,
  ensureStudioProject,
  getStudioImageState,
  listImageModelPicker,
  pickProjectImageModel,
  unwrapProjectOp,
} from "./projects.ts";
import { createSqlQuotaStore, createSqlRoleStore } from "./quota-sql.ts";
import { normalizeDailyCap, resolveStudioRole, setGlobalDailyCap } from "./quota.ts";
import {
  createSqlCatalogStore,
  createSqlJobStore,
  createSqlProjectStore,
  createSqlRevStore,
} from "./sql.ts";
import type { ImageJobGatewayDeps } from "./stores.ts";
import { createXaiImageUpstream } from "./upstream.ts";
import type {
  ImageJobAction,
  PickerImageModel,
  StudioImageState,
  StudioQuota,
  StudioRole,
} from "./types.ts";

async function createSqlGatewayDeps(): Promise<ImageJobGatewayDeps> {
  const sql = await getSql();
  return {
    catalog: createSqlCatalogStore(sql),
    projects: createSqlProjectStore(sql),
    jobs: createSqlJobStore(sql),
    revs: createSqlRevStore(sql),
    quota: createSqlQuotaStore(sql),
    roles: createSqlRoleStore(sql),
    upstream: createXaiImageUpstream(),
  };
}

function parseProjectId(input: { projectId: string }): { projectId: string } {
  const projectId = input.projectId.trim();
  if (!projectId) throw new ImageJobError("not_found");
  return { projectId };
}

export const listImageModelsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async (): Promise<PickerImageModel[]> => {
    const deps = await createSqlGatewayDeps();
    return listImageModelPicker(deps.catalog);
  });

export const createStudioProjectFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name?: string }) => input)
  .handler(async ({ context }) => {
    const deps = await createSqlGatewayDeps();
    const project = unwrapProjectOp(
      await createStudioProject(deps.catalog, deps.projects, {
        userId: context.userId,
      }),
    );
    return {
      id: project.id,
      currentImageModelId: project.currentImageModelId,
    };
  });

export const ensureStudioProjectFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseProjectId)
  .handler(async ({ context, data }) => {
    const deps = await createSqlGatewayDeps();
    const project = unwrapProjectOp(
      await ensureStudioProject(deps.catalog, deps.projects, {
        userId: context.userId,
        projectId: data.projectId,
      }),
    );
    return {
      id: project.id,
      currentImageModelId: project.currentImageModelId,
    };
  });

export const pickProjectImageModelFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { projectId: string; modelId: string }) => {
    const projectId = input.projectId.trim();
    const modelId = input.modelId.trim();
    if (!projectId) throw new ImageJobError("not_found");
    if (!modelId) throw new ImageJobError("not_found");
    return { projectId, modelId };
  })
  .handler(async ({ context, data }) => {
    const deps = await createSqlGatewayDeps();
    const project = unwrapProjectOp(
      await pickProjectImageModel(deps.catalog, deps.projects, {
        userId: context.userId,
        projectId: data.projectId,
        modelId: data.modelId,
      }),
    );
    return { currentImageModelId: project.currentImageModelId };
  });

export const getImageStudioStateFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseProjectId)
  .handler(async ({ context, data }): Promise<StudioImageState> => {
    const deps = await createSqlGatewayDeps();
    return unwrapProjectOp(
      await getStudioImageState(deps.catalog, deps.projects, deps.quota, {
        userId: context.userId,
        projectId: data.projectId,
        now: deps.now?.() ?? Date.now(),
      }),
    );
  });

export const getDailyQuotaFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<StudioQuota> => {
    const deps = await createSqlGatewayDeps();
    return deps.quota.snapshot(context.userId, deps.now?.() ?? Date.now());
  });

export const getStudioAccessFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ role: StudioRole; quota: StudioQuota }> => {
    const deps = await createSqlGatewayDeps();
    const now = deps.now?.() ?? Date.now();
    const [role, quota] = await Promise.all([
      resolveStudioRole(deps.roles, context.userId),
      deps.quota.snapshot(context.userId, now),
    ]);
    return { role, quota };
  });

export const setDailyImageCapFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { cap: number }) => {
    const cap = normalizeDailyCap(input.cap);
    if (cap === null) throw new Error("额度须为 0–9999 的整数");
    return { cap };
  })
  .handler(async ({ context, data }): Promise<{ cap: number }> => {
    const deps = await createSqlGatewayDeps();
    const result = await setGlobalDailyCap(deps.roles, deps.quota, {
      userId: context.userId,
      cap: data.cap,
    });
    if (!result.ok) throw new ImageJobError(result.code);
    return { cap: result.cap };
  });

type ImageJobFnResult = {
  ok: true;
  jobId: string;
  urls: string[];
};

async function runOwnedImageJob(
  userId: string,
  input: {
    projectId: string;
    action: ImageJobAction;
    prompt: string;
    aspect: string;
    n: number;
    imageUrl?: string;
    clientModelId?: string;
  },
): Promise<ImageJobFnResult> {
  const deps = await createSqlGatewayDeps();
  const { job, revs } = unwrapImageJob(
    await runImageJob(deps, {
      userId,
      projectId: input.projectId,
      action: input.action,
      prompt: input.prompt,
      aspect: input.aspect,
      n: input.n,
      imageUrl: input.imageUrl,
      clientModelId: input.clientModelId,
    }),
  );
  return {
    ok: true,
    jobId: job.id,
    urls: revs.map((rev) => rev.url),
  };
}

export const generateCandidate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { projectId: string; presetId: string; product: string }) => input)
  .handler(async ({ context, data }): Promise<ImageJobFnResult> => {
    const preset = PRESETS.find((item) => item.id === data.presetId) ?? PRESETS[0];
    return runOwnedImageJob(context.userId, {
      projectId: data.projectId,
      action: "direction",
      prompt: candidatePrompt(preset.dna, data.product),
      aspect: SLOT_ASPECT.candidate,
      n: 1,
    });
  });

export const generateSlotFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      projectId: string;
      dna: StyleDna;
      slot: Slot;
      product: string;
      content: string;
      refUrl?: string | null;
      clientModelId?: string;
    }) => input,
  )
  .handler(async ({ context, data }): Promise<ImageJobFnResult> => {
    const prompt = slotPrompt(data.dna, data.slot, data.product, data.content);
    const ref =
      data.refUrl && !data.refUrl.startsWith("data:image/svg") ? data.refUrl : undefined;
    return runOwnedImageJob(context.userId, {
      projectId: data.projectId,
      action: "generate",
      prompt,
      aspect: SLOT_ASPECT[data.slot],
      n: 2,
      imageUrl: ref,
      clientModelId: data.clientModelId,
    });
  });

export const tuneImageFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      projectId: string;
      dna: StyleDna;
      imageUrl: string;
      instruction: string;
      slot: Slot;
    }) => input,
  )
  .handler(async ({ context, data }): Promise<ImageJobFnResult> => {
    return runOwnedImageJob(context.userId, {
      projectId: data.projectId,
      action: "tune",
      prompt: tunePrompt(data.dna, data.instruction),
      aspect: SLOT_ASPECT[data.slot],
      n: 1,
      imageUrl: data.imageUrl,
    });
  });

export const composeImageFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      projectId: string;
      dna: StyleDna;
      imageUrl: string;
      instruction: string;
      slot: Slot;
    }) => input,
  )
  .handler(async ({ context, data }): Promise<ImageJobFnResult> => {
    return runOwnedImageJob(context.userId, {
      projectId: data.projectId,
      action: "compose",
      prompt: tunePrompt(data.dna, data.instruction),
      aspect: SLOT_ASPECT[data.slot],
      n: 1,
      imageUrl: data.imageUrl,
    });
  });
