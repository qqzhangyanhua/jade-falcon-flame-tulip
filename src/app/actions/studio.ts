"use server";

import { requireActionUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { fetchRemoteImage, listJobImages, openJobImage } from "@/lib/image-jobs/durable";
import { ImageJobError } from "@/lib/image-jobs/errors";
import { runImageJob, unwrapImageJob } from "@/lib/image-jobs/gateway";
import { listUserJobs } from "@/lib/image-jobs/list-jobs";
import { loadProjectDocument, saveProjectDocument } from "@/lib/image-jobs/project-document";
import {
  importLocalProject,
  listProjectSummaries,
  type ImportLocalResult,
} from "@/lib/image-jobs/project-list";
import {
  createStudioProject,
  deleteStudioProject,
  ensureStudioProject,
  getStudioImageState,
  listImageModelPicker,
  pickProjectImageModel,
  unwrapProjectOp,
} from "@/lib/image-jobs/projects";
import { createSqlQuotaStore, createSqlRoleStore } from "@/lib/image-jobs/quota-sql";
import { normalizeDailyCap, resolveStudioRole, setGlobalDailyCap } from "@/lib/image-jobs/quota";
import {
  createSqlBlobStore,
  createSqlCatalogStore,
  createSqlJobStore,
  createSqlProjectStore,
  createSqlRevStore,
} from "@/lib/image-jobs/sql";
import type { ImageJobGatewayDeps } from "@/lib/image-jobs/stores";
import type {
  ImageJobAction,
  ImageJobErrorCode,
  ImageJobHistoryItem,
  PickerImageModel,
  ProjectDocumentSnapshot,
  ProjectSummary,
  StudioImageState,
  StudioQuota,
  StudioRole,
} from "@/lib/image-jobs/types";
import { uploadReferenceImage, uploadWireframe } from "@/lib/image-jobs/upload";
import { createXaiImageUpstream } from "@/lib/image-jobs/upstream";
import { styleDnaSchema } from "@/lib/project/dna";
import { PRESETS } from "@/lib/presets";
import { candidatePrompt, slotPrompt, SLOT_ASPECT, tunePrompt } from "@/lib/prompts";
import type { Slot, StyleDna } from "@/lib/types";

async function createSqlGatewayDeps(): Promise<ImageJobGatewayDeps> {
  const sql = await getSql();
  return {
    catalog: createSqlCatalogStore(sql),
    projects: createSqlProjectStore(sql),
    jobs: createSqlJobStore(sql),
    revs: createSqlRevStore(sql),
    blobs: createSqlBlobStore(sql),
    quota: createSqlQuotaStore(sql),
    roles: createSqlRoleStore(sql),
    upstream: createXaiImageUpstream(),
    fetchImage: fetchRemoteImage,
  };
}

function parseProjectId(input: { projectId: string }): { projectId: string } {
  const projectId = input.projectId.trim();
  if (!projectId) throw new ImageJobError("not_found");
  return { projectId };
}

/** The result-returning actions answer a blank id with a code instead of throwing. */
async function resolveActionContext(input: {
  projectId: string;
}): Promise<{ ok: true; userId: string; projectId: string } | { ok: false; code: ImageJobErrorCode }> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false, code: "unauthorized" };
  const projectId = input.projectId.trim();
  if (!projectId) return { ok: false, code: "not_found" };
  return { ok: true, userId, projectId };
}

export async function listImageModelsFn(): Promise<PickerImageModel[]> {
  await requireActionUser();
  const deps = await createSqlGatewayDeps();
  return listImageModelPicker(deps.catalog);
}

export async function createStudioProjectFn(_input?: { data?: { name?: string } }) {
  const { userId } = await requireActionUser();
  const deps = await createSqlGatewayDeps();
  const project = unwrapProjectOp(
    await createStudioProject(deps.catalog, deps.projects, {
      userId,
    }),
  );
  return {
    id: project.id,
    currentImageModelId: project.currentImageModelId,
  };
}

export async function ensureStudioProjectFn(input: { data: { projectId: string } }) {
  const { userId } = await requireActionUser();
  const { projectId } = parseProjectId(input.data);
  const deps = await createSqlGatewayDeps();
  const project = unwrapProjectOp(
    await ensureStudioProject(deps.catalog, deps.projects, {
      userId,
      projectId,
    }),
  );
  return {
    id: project.id,
    currentImageModelId: project.currentImageModelId,
  };
}

// Result form of ensureStudioProjectFn: production strips the message of a thrown action error,
// so the client could not tell "not yours" or "deleted" from a network failure.
export async function ensureStudioProjectResultFn(input: {
  data: { projectId: string };
}): Promise<ProjectDocumentActionResult<{ id: string }>> {
  const ctx = await resolveActionContext(input.data);
  if (!ctx.ok) return ctx;
  const deps = await createSqlGatewayDeps();
  const result = await ensureStudioProject(deps.catalog, deps.projects, {
    userId: ctx.userId,
    projectId: ctx.projectId,
  });
  if (!result.ok) return { ok: false, code: result.code };
  return { ok: true, value: { id: result.value.id } };
}

export async function uploadWireframeFn(input: {
  data: { projectId: string; dataUrl: string };
}): Promise<{ url: string }> {
  const { userId } = await requireActionUser();
  const { projectId } = parseProjectId(input.data);
  const deps = await createSqlGatewayDeps();
  const result = await uploadWireframe(deps, {
    userId,
    projectId,
    dataUrl: input.data.dataUrl,
  });
  if (!result.ok) throw new ImageJobError(result.code);
  return { url: result.url };
}

export async function uploadReferenceImageFn(input: {
  data: { projectId: string; dataUrl: string };
}): Promise<{ url: string }> {
  const { userId } = await requireActionUser();
  const { projectId } = parseProjectId(input.data);
  const deps = await createSqlGatewayDeps();
  const result = await uploadReferenceImage(deps, {
    userId,
    projectId,
    dataUrl: input.data.dataUrl,
  });
  if (!result.ok) throw new ImageJobError(result.code);
  return { url: result.url };
}

export async function pickProjectImageModelFn(input: {
  data: { projectId: string; modelId: string };
}) {
  const { userId } = await requireActionUser();
  const projectId = input.data.projectId.trim();
  const modelId = input.data.modelId.trim();
  if (!projectId) throw new ImageJobError("not_found");
  if (!modelId) throw new ImageJobError("not_found");
  const deps = await createSqlGatewayDeps();
  const project = unwrapProjectOp(
    await pickProjectImageModel(deps.catalog, deps.projects, {
      userId,
      projectId,
      modelId,
    }),
  );
  return { currentImageModelId: project.currentImageModelId };
}

export async function getImageStudioStateFn(input: {
  data: { projectId: string };
}): Promise<StudioImageState> {
  const { userId } = await requireActionUser();
  const { projectId } = parseProjectId(input.data);
  const deps = await createSqlGatewayDeps();
  return unwrapProjectOp(
    await getStudioImageState(deps.catalog, deps.projects, deps.quota, {
      userId,
      projectId,
      now: deps.now?.() ?? Date.now(),
    }),
  );
}

export async function getDailyQuotaFn(): Promise<StudioQuota> {
  const { userId } = await requireActionUser();
  const deps = await createSqlGatewayDeps();
  return deps.quota.snapshot(userId, deps.now?.() ?? Date.now());
}

export async function getStudioAccessFn(): Promise<{ role: StudioRole; quota: StudioQuota }> {
  const { userId } = await requireActionUser();
  const deps = await createSqlGatewayDeps();
  const now = deps.now?.() ?? Date.now();
  const [role, quota] = await Promise.all([
    resolveStudioRole(deps.roles, userId),
    deps.quota.snapshot(userId, now),
  ]);
  return { role, quota };
}

export async function setDailyImageCapFn(input: { data: { cap: number } }): Promise<{ cap: number }> {
  const { userId } = await requireActionUser();
  const cap = normalizeDailyCap(input.data.cap);
  if (cap === null) throw new Error("额度须为 0–9999 的整数");
  const deps = await createSqlGatewayDeps();
  const result = await setGlobalDailyCap(deps.roles, deps.quota, {
    userId,
    cap,
  });
  if (!result.ok) throw new ImageJobError(result.code);
  return { cap: result.cap };
}

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
    slot?: Slot | null;
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
      slot: input.slot ?? null,
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

export async function generateCandidate(input: {
  data: { projectId: string; presetId: string; product: string; dna?: StyleDna };
}): Promise<ImageJobFnResult> {
  const { userId } = await requireActionUser();
  const data = input.data;
  const preset = PRESETS.find((item) => item.id === data.presetId) ?? PRESETS[0];
  const tailored = styleDnaSchema.safeParse(data.dna);
  return runOwnedImageJob(userId, {
    projectId: data.projectId,
    action: "direction",
    slot: null,
    prompt: candidatePrompt(tailored.success ? tailored.data : preset.dna, data.product),
    aspect: SLOT_ASPECT.candidate,
    n: 1,
  });
}

export async function generateSlotFn(input: {
  data: {
    projectId: string;
    dna: StyleDna;
    slot: Slot;
    product: string;
    content: string;
    refUrl?: string | null;
    clientModelId?: string;
  };
}): Promise<ImageJobFnResult> {
  const { userId } = await requireActionUser();
  const data = input.data;
  const prompt = slotPrompt(data.dna, data.slot, data.product, data.content);
  const ref =
    data.refUrl && !data.refUrl.startsWith("data:image/svg") ? data.refUrl : undefined;
  return runOwnedImageJob(userId, {
    projectId: data.projectId,
    action: "generate",
    slot: data.slot,
    prompt,
    aspect: SLOT_ASPECT[data.slot],
    n: 2,
    imageUrl: ref,
    clientModelId: data.clientModelId,
  });
}

export async function tuneImageFn(input: {
  data: {
    projectId: string;
    dna: StyleDna;
    imageUrl: string;
    instruction: string;
    slot: Slot;
  };
}): Promise<ImageJobFnResult> {
  const { userId } = await requireActionUser();
  const data = input.data;
  return runOwnedImageJob(userId, {
    projectId: data.projectId,
    action: "tune",
    slot: data.slot,
    prompt: tunePrompt(data.dna, data.instruction),
    aspect: SLOT_ASPECT[data.slot],
    n: 1,
    imageUrl: data.imageUrl,
  });
}

export async function composeImageFn(input: {
  data: {
    projectId: string;
    dna: StyleDna;
    imageUrl: string;
    instruction: string;
    slot: Slot;
  };
}): Promise<ImageJobFnResult> {
  const { userId } = await requireActionUser();
  const data = input.data;
  return runOwnedImageJob(userId, {
    projectId: data.projectId,
    action: "compose",
    slot: data.slot,
    prompt: tunePrompt(data.dna, data.instruction),
    aspect: SLOT_ASPECT[data.slot],
    n: 1,
    imageUrl: data.imageUrl,
  });
}

export async function deleteStudioProjectFn(input: { data: { projectId: string } }) {
  const { userId } = await requireActionUser();
  const { projectId } = parseProjectId(input.data);
  const deps = await createSqlGatewayDeps();
  const project = unwrapProjectOp(
    await deleteStudioProject(deps, {
      userId,
      projectId,
    }),
  );
  return {
    id: project.id,
    deletedAt: project.deletedAt,
  };
}

export async function listMyJobsFn(): Promise<ImageJobHistoryItem[]> {
  const { userId } = await requireActionUser();
  const deps = await createSqlGatewayDeps();
  const result = await listUserJobs(deps, { userId });
  if (!result.ok) throw new ImageJobError(result.code);
  return result.jobs;
}

export async function listJobImagesFn(input: { data: { jobId: string } }) {
  const { userId } = await requireActionUser();
  const jobId = input.data.jobId.trim();
  if (!jobId) throw new ImageJobError("not_found");
  const deps = await createSqlGatewayDeps();
  const result = await listJobImages(deps, {
    userId,
    jobId,
  });
  if (!result.ok) throw new ImageJobError(result.code);
  return result.images;
}

export async function openJobImageFn(input: { data: { imageId: string } }) {
  const { userId } = await requireActionUser();
  const imageId = input.data.imageId.trim();
  if (!imageId) throw new ImageJobError("not_found");
  const deps = await createSqlGatewayDeps();
  const result = await openJobImage(deps, {
    userId,
    imageId,
  });
  if (!result.ok) throw new ImageJobError(result.code);
  return {
    id: result.image.id,
    jobId: result.image.jobId,
    url: result.image.url,
    contentType: result.image.contentType,
    base64: Buffer.from(result.image.bytes).toString("base64"),
  };
}

export type ProjectDocumentActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ImageJobErrorCode; current?: ProjectDocumentSnapshot };

// Returned rather than thrown: production strips error messages from thrown server action errors,
// and the client needs the code (and the server copy on a conflict) to decide what to do.
async function signedInUserId(): Promise<string | null> {
  try {
    return (await requireActionUser()).userId;
  } catch {
    return null;
  }
}

export async function loadProjectDocumentFn(input: {
  data: { projectId: string };
}): Promise<ProjectDocumentActionResult<ProjectDocumentSnapshot>> {
  const ctx = await resolveActionContext(input.data);
  if (!ctx.ok) return ctx;
  const { userId, projectId } = ctx;
  const deps = await createSqlGatewayDeps();
  return loadProjectDocument(deps, { userId, projectId });
}

export async function saveProjectDocumentFn(input: {
  data: { projectId: string; document: unknown; expectedVersion: number };
}): Promise<ProjectDocumentActionResult<{ version: number; updatedAt: number }>> {
  const ctx = await resolveActionContext(input.data);
  if (!ctx.ok) return ctx;
  const { userId, projectId } = ctx;
  const deps = await createSqlGatewayDeps();
  return saveProjectDocument(deps, {
    userId,
    projectId,
    document: input.data.document,
    expectedVersion: input.data.expectedVersion,
  });
}

export async function listProjectSummariesFn(): Promise<ProjectSummary[]> {
  const { userId } = await requireActionUser();
  const deps = await createSqlGatewayDeps();
  return unwrapProjectOp(await listProjectSummaries(deps, { userId }));
}

export async function importLocalProjectFn(input: {
  data: { projectId: string; document: unknown };
}): Promise<ProjectDocumentActionResult<ImportLocalResult>> {
  const ctx = await resolveActionContext(input.data);
  if (!ctx.ok) return ctx;
  const { userId, projectId } = ctx;
  const deps = await createSqlGatewayDeps();
  return importLocalProject(deps, { userId, projectId, document: input.data.document });
}
