import { zipSync } from "fflate";
import { exportManifest } from "./manifest.ts";
import type { StyleBranch } from "./schema.ts";

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function extensionOfContentType(contentType: string | null, fallback = "png"): string {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return EXTENSION_BY_TYPE[type] ?? fallback;
}

function safeName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  return cleaned || fallback;
}

export function exportZipName(projectName: string, styleName: string, rev: number): string {
  return `${safeName(projectName, "project")}-${safeName(styleName, "style")}-rev${rev}.zip`;
}

export type ExportZip = { fileName: string; bytes: Uint8Array };

/**
 * Fetches the manifest's images and zips them with dna.json, the design-token
 * files and prompts.md. The extension comes from the response content type,
 * since /api/images/<id> urls carry none. Token text is the viewed rev; no model call.
 */
export async function buildExportZip(input: {
  projectName: string;
  styleLine: StyleBranch;
  fetchImpl?: typeof fetch;
  enabledSlotIds?: readonly string[];
  product?: string;
}): Promise<ExportZip> {
  const { styleLine } = input;
  const fetchImpl = input.fetchImpl ?? fetch;
  const manifest = exportManifest(styleLine, {
    enabledSlotIds: input.enabledSlotIds,
    product: input.product,
  });
  if (manifest.images.length === 0) throw new Error("没有可导出的图片");

  const files: Record<string, Uint8Array> = {};
  for (const image of manifest.images) {
    const response = await fetchImpl(image.url);
    if (!response.ok) throw new Error(`${image.slot} 图片获取失败（${response.status}）`);
    const extension = extensionOfContentType(
      response.headers.get("content-type"),
      image.fileName.split(".").pop(),
    );
    files[`${image.slot}.${extension}`] = new Uint8Array(await response.arrayBuffer());
  }
  const encode = (content: string) => new TextEncoder().encode(content);
  files[manifest.dna.fileName] = encode(manifest.dna.content);
  files[manifest.tokens.css.fileName] = encode(manifest.tokens.css.content);
  files[manifest.tokens.tailwind.fileName] = encode(manifest.tokens.tailwind.content);
  files[manifest.tokens.w3c.fileName] = encode(manifest.tokens.w3c.content);
  files[manifest.prompts.fileName] = encode(manifest.prompts.content);

  return {
    fileName: exportZipName(input.projectName, styleLine.name, styleLine.currentRev),
    bytes: zipSync(files),
  };
}
