"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Columns2, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select";
import { compareLines } from "@/lib/project/ops";
import { BUILTIN_SLOTS } from "@/lib/project/slots";
import { useStudio } from "@/lib/store";
import type { Project } from "@/lib/types";

function enabledSlotChoices(project: Project): { id: string; name: string }[] {
  const custom = project.customSlots ?? [];
  return project.enabledSlotIds.map((id) => {
    const builtin = BUILTIN_SLOTS.find((item) => item.id === id);
    if (builtin) return { id, name: builtin.name };
    const own = custom.find((item) => item.id === id);
    return { id, name: own?.name ?? id };
  });
}

export function StyleLineCompare({
  disabled,
  onGoGenerate,
}: {
  disabled?: boolean;
  onGoGenerate?: () => void;
}) {
  const project = useStudio((s) => s.current());
  const setCurrentStyle = useStudio((s) => s.setCurrentStyle);
  const setSlot = useStudio((s) => s.setSlot);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!project || project.enabledSlotIds.length === 0) return null;

  const slots = enabledSlotChoices(project);
  const slot =
    (picked && slots.some((item) => item.id === picked) ? picked : null) ??
    (slots.some((item) => item.id === project.currentSlot) ? project.currentSlot : slots[0].id);
  const rows = compareLines(project, slot);
  const slotName = slots.find((item) => item.id === slot)?.name ?? slot;

  function close() {
    setOpen(false);
  }

  function goGenerate(styleId: string) {
    setCurrentStyle(styleId);
    setSlot(slot);
    setOpen(false);
    onGoGenerate?.();
  }

  const dialog = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-fg/40 p-3 md:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="style-line-compare-title"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl rounded-xl bg-surface p-4 shadow-border outline-none md:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="style-line-compare-title" className="font-display text-2xl tracking-tight">
              风格线对比
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              选一个物料槽，并排看每条可用风格线采用的图。切换后，原来的当前风格线变为备选。
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="关闭" onClick={close}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="mt-4 max-w-xs">
          <p className="mb-2 section-label">物料槽</p>
          <SelectField
            id="style-line-compare-slot"
            label="物料槽"
            value={slot}
            items={slots.map((item) => ({ value: item.id, label: item.name }))}
            onValueChange={setPicked}
          />
        </div>

        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const current = row.styleId === project.currentStyleId;
            return (
              <li
                key={row.styleId}
                className="flex min-w-0 flex-col gap-3 rounded-lg bg-bg p-3 shadow-border"
              >
                <div className="flex min-h-11 items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm text-fg">{row.name}</p>
                  <span className="shrink-0 text-xs text-subtle">{current ? "当前" : "备选"}</span>
                </div>
                {row.image ? (
                  <div className="grid h-48 place-items-center overflow-hidden rounded-md bg-surface-2">
                    <img
                      src={row.image.url}
                      alt={`${row.name}在${slotName}上采用的图`}
                      className="frame max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="grid h-48 place-items-center rounded-md bg-surface-2 text-center">
                    <div>
                      <ImageIcon className="mx-auto size-5 text-subtle" />
                      <p className="mt-2 text-sm text-muted">还没有图</p>
                    </div>
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full"
                  disabled={disabled || current}
                  onClick={() => setCurrentStyle(row.styleId)}
                >
                  设为当前风格线
                </Button>
                {row.image ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={disabled}
                    onClick={() => goGenerate(row.styleId)}
                  >
                    去出图
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 shrink-0 px-3"
        disabled={disabled}
        onClick={() => {
          setPicked(project.currentSlot);
          setOpen(true);
        }}
      >
        <Columns2 className="size-4" />
        风格线对比
      </Button>
      {open ? createPortal(dialog, document.body) : null}
    </>
  );
}
