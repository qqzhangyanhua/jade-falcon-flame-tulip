import {
  IMAGE_JOB_ERROR_CODES,
  type ImageJobErrorCode,
} from "./types.ts";

export const IMAGE_JOB_USER_MESSAGES: Record<ImageJobErrorCode, string> = {
  unauthorized: "请先登录",
  forbidden: "无权访问该项目",
  images_unavailable: "出图暂不可用",
  model_disabled: "当前模型已停用，请另选模型",
  capability_denied: "当前模型不支持该操作",
  quota_exceeded: "今日额度已用完",
  in_flight: "当前有进行中的出图",
  not_found: "项目不存在",
  unknown_slot: "这个物料槽不在当前项目里",
  invalid_n: "出图张数不正确",
  upstream_failed: "出图失败",
  project_deleted: "项目已删除",
  invalid_image: "图片格式不支持，请上传 PNG、JPEG 或 WebP",
  image_too_large: "图片过大，请压缩后重试",
  version_conflict: "项目已在别处更新，已载入最新版本",
  invalid_document: "项目数据格式不正确",
  document_too_large: "项目内容过大，无法保存",
};

export const CAPABILITY_DENIED_REASONS: Record<
  "direction" | "generate" | "tune" | "compose",
  string
> = {
  direction: "当前模型不支持方向候选",
  generate: "当前模型不支持槽位出图",
  tune: "当前模型不支持微调",
  compose: "当前模型不支持换构图",
};

export class ImageJobError extends Error {
  readonly code: ImageJobErrorCode;

  constructor(code: ImageJobErrorCode) {
    super(code);
    this.name = "ImageJobError";
    this.code = code;
  }
}

export function isImageJobErrorCode(value: string): value is ImageJobErrorCode {
  return (IMAGE_JOB_ERROR_CODES as readonly string[]).includes(value);
}

export function imageJobErrorCode(err: unknown): ImageJobErrorCode | null {
  if (err instanceof ImageJobError) return err.code;
  if (err instanceof Error && isImageJobErrorCode(err.message)) return err.message;
  if (err instanceof Error && err.message === "Unauthorized") return "unauthorized";
  return null;
}

export function messageForImageJobError(err: unknown): string {
  const code = imageJobErrorCode(err);
  if (code) return IMAGE_JOB_USER_MESSAGES[code];
  return IMAGE_JOB_USER_MESSAGES.upstream_failed;
}
