"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, Loader2, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { designTokens, formatPromptPack, promptPack } from "@/lib/project/dna-export";
import { buildExportZip, extensionOfContentType } from "@/lib/project/export-zip";
import { exportManifest } from "@/lib/project/manifest";
import { slotPromptMetas, type SlotPromptMeta } from "@/lib/project/slots";
import type { StyleBranch, StyleDna } from "@/lib/types";
import { cn } from "@/lib/utils";

const iconButton =
  "inline-flex size-11 items-center justify-center rounded-md border border-border text-fg transition-colors duration-150 hover:bg-surface-2";

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
      className={cn(iconButton, !url && "pointer-events-none opacity-40")}
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
  enabledSlotIds,
  customSlots,
  product,
}: {
  projectName: string;
  styleLine: StyleBranch;
  enabledSlotIds?: readonly string[];
  customSlots?: readonly SlotPromptMeta[];
  product?: string;
}) {
  const [busy, setBusy] = useState(false);
  const empty = exportManifest(styleLine, { enabledSlotIds, customSlots, product }).images.length === 0;
  const label = empty ? "导出（还没有图片可导出）" : "导出整套物料";

  async function runExport() {
    setBusy(true);
    try {
      const { fileName, bytes } = await buildExportZip({
        projectName,
        styleLine,
        enabledSlotIds,
        customSlots,
        product,
      });
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
      className={cn(iconButton, (empty || busy) && "pointer-events-none opacity-40")}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <PackageOpen className="size-4" />}
    </button>
  );
}

async function copyText(text: string, confirmation: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(confirmation);
  } catch {
    toast.error("复制失败，请重试");
  }
}

function CopyRow({ label, onCopy }: { label: string; onCopy: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onCopy}
      className="flex h-11 w-full items-center rounded-md px-3 text-left text-sm text-fg transition-colors duration-150 hover:bg-surface-2"
    >
      {label}
    </button>
  );
}

/** Copies the viewed rev's token formats and each enabled slot's prompt pack. No server call. */
export function StudioCopyMenu({
  dna,
  product,
  enabledSlotIds,
  customSlots,
}: {
  dna: StyleDna;
  product: string;
  enabledSlotIds: readonly string[];
  customSlots?: readonly SlotPromptMeta[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tokens = designTokens(dna);
  const packs = promptPack(dna, slotPromptMetas(enabledSlotIds, customSlots), product);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || !rootRef.current?.contains(target)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={cn(iconButton, open && "bg-surface-2")}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="复制设计令牌和提示词"
        title="复制设计令牌和提示词"
        onClick={() => setOpen((value) => !value)}
      >
        <Copy className="size-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="fixed top-20 right-3 z-30 max-h-[70vh] w-64 overflow-y-auto rounded-md border border-border bg-surface p-2"
        >
          <p className="px-3 py-2 text-xs text-subtle">设计令牌</p>
          <CopyRow label="CSS" onCopy={() => void copyText(tokens.css, "已复制 CSS")} />
          <CopyRow
            label="Tailwind"
            onCopy={() => void copyText(tokens.tailwind, "已复制 Tailwind")}
          />
          <CopyRow label="W3C JSON" onCopy={() => void copyText(tokens.w3c, "已复制 W3C JSON")} />
          <p className="px-3 py-2 text-xs text-subtle">提示词</p>
          {packs.map((pack) => (
            <CopyRow
              key={pack.id}
              label={pack.name}
              onCopy={() => void copyText(formatPromptPack(pack), `已复制「${pack.name}」`)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
