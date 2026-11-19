"use client";

import { useState } from "react";
import { DnaChangeList } from "@/components/dna-change-list";
import { OwnedImage } from "@/components/owned-image";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select";
import { compareRevs } from "@/lib/project/ops";
import type { ImageRev, StyleBranch } from "@/lib/types";

export function StyleRevCompare({
  style,
  slots,
  onClose,
}: {
  style: StyleBranch;
  slots: { id: string; name: string }[];
  onClose: () => void;
}) {
  const revItems = style.revs.map((rev) => ({
    value: String(rev.rev),
    label: `rev${rev.rev} · ${rev.changeLog}`,
  }));
  const fallback = style.revs[0]?.rev ?? style.currentRev;
  const other = [...style.revs].reverse().find((rev) => rev.rev !== style.currentRev)?.rev ?? fallback;
  const [revA, setRevA] = useState(String(other));
  const [revB, setRevB] = useState(String(style.currentRev));
  const compared = compareRevs(
    style,
    Number(revA),
    Number(revB),
    slots.map((slot) => slot.id),
  );
  const names = new Map(slots.map((slot) => [slot.id, slot.name]));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-fg/40 p-3 md:items-center md:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-revs-title"
        className="flex max-h-full min-h-0 w-full min-w-0 max-w-3xl flex-col overflow-hidden rounded-xl bg-surface shadow-border"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4 md:p-6">
          <div className="min-w-0">
            <h2 id="compare-revs-title" className="font-display text-2xl tracking-tight">
              对比风格版本
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              并排看两个版本的 DNA，以及每个物料槽在这两个版本下最新出的图。
            </p>
          </div>
          <Button type="button" variant="outline" className="shrink-0" onClick={onClose}>
            关闭
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <p className="mb-1 text-xs text-subtle">版本 A</p>
              <SelectField label="版本 A" value={revA} items={revItems} onValueChange={setRevA} />
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs text-subtle">版本 B</p>
              <SelectField label="版本 B" value={revB} items={revItems} onValueChange={setRevB} />
            </div>
          </div>

          <p className="mt-6 section-label">DNA</p>
          <div className="mt-3 rounded-md bg-bg p-3 shadow-border">
            <p className="mb-2 text-xs text-subtle">
              rev{revA} → rev{revB}
            </p>
            {compared.changes.length ? (
              <DnaChangeList changes={compared.changes} />
            ) : (
              <p className="text-sm text-subtle">这两个版本的 DNA 没有差异</p>
            )}
          </div>

          <p className="mt-6 section-label">物料槽</p>
          {compared.slots.length ? (
            <ul className="mt-3 flex flex-col gap-4">
              {compared.slots.map((slot) => (
                <li key={slot.slot} className="min-w-0">
                  <p className="mb-2 text-sm text-fg">{names.get(slot.slot) ?? slot.slot}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <CompareFrame label={`rev${revA}`} image={slot.revA} />
                    <CompareFrame label={`rev${revB}`} image={slot.revB} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-subtle">没有已启用的物料槽</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CompareFrame({ label, image }: { label: string; image: ImageRev | null }) {
  return (
    <figure className="min-w-0 overflow-hidden rounded-md bg-bg shadow-border">
      <figcaption className="truncate border-b border-border px-2 py-2 text-xs text-subtle">
        {label}
      </figcaption>
      {image ? (
        <OwnedImage
          src={image.url}
          alt=""
          className="aspect-video w-full object-contain"
          placeholderClassName="aspect-video w-full"
        />
      ) : (
        <p className="grid aspect-video place-items-center px-2 text-center text-xs leading-relaxed text-subtle">
          这个版本还没有图
        </p>
      )}
    </figure>
  );
}
