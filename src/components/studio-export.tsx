"use client";

import { useState } from "react";
import { Download, Loader2, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { buildExportZip, extensionOfContentType } from "@/lib/project/export-zip";
import { exportManifest } from "@/lib/project/manifest";
import type { StyleBranch } from "@/lib/types";
import { cn } from "@/lib/utils";

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The download attribute alone would name the file without an extension, because
 * /api/images/<id> urls carry none; the click re-saves it with the real type.
 */
export function StudioDownloadLink({ url, slot }: { url: string | undefined; slot: string }) {
  async function download(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!url) return;
    event.preventDefault();
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`下载失败（${response.status}）`);
      const extension = extensionOfContentType(response.headers.get("content-type"));
      saveBlob(await response.blob(), `${slot}.${extension}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "下载失败，请重试");
    }
  }

  return (
    <a
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-md border border-border text-fg transition-colors duration-150 hover:bg-surface-2",
        !url && "pointer-events-none opacity-40",
      )}
      href={url}
      download={url ? slot : undefined}
      onClick={(event) => void download(event)}
      aria-label="下载当前图片"
      title={url ? "下载当前图片" : "当前物料槽还没有图片"}
    >
      <Download className="size-4" />
    </a>
  );
}

export function StudioExportButton({
  projectName,
  styleLine,
}: {
  projectName: string;
  styleLine: StyleBranch;
}) {
  const [busy, setBusy] = useState(false);
  const empty = exportManifest(styleLine).images.length === 0;
  const label = empty ? "导出（还没有图片可导出）" : "导出整套物料";

  async function runExport() {
    setBusy(true);
    try {
      const { fileName, bytes } = await buildExportZip({ projectName, styleLine });
      saveBlob(new Blob([bytes as BlobPart], { type: "application/zip" }), fileName);
      toast.success(`已导出 ${fileName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void runExport()}
      disabled={empty || busy}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-md border border-border text-fg transition-colors duration-150 hover:bg-surface-2",
        (empty || busy) && "pointer-events-none opacity-40",
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <PackageOpen className="size-4" />}
    </button>
  );
}
