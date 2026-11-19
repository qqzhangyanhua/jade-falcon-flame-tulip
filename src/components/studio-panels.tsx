"use client";

import { useState } from "react";
import { DnaChangeList } from "@/components/dna-change-list";
import { RevTree } from "@/components/rev-tree";
import { Button } from "@/components/ui/button";
import { diffDna } from "@/lib/project/dna";
import type { ImageRev, StyleBranch, StyleDna, StyleRevRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

// The heading stays the DNA's own name, which an explicit rename changes; the line name only shows
// when it differs (e.g. a fork, whose DNA is a copy of the original).
export function StyleCard({ dna, lineName }: { dna: StyleDna; lineName?: string }) {
  return (
    <div>
      {lineName && lineName !== dna.name ? (
        <p className="mb-1 section-label">{lineName}</p>
      ) : null}
      <h2 className="font-display text-xl leading-tight tracking-tight">{dna.name}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{dna.oneLiner}</p>
      <div className="mt-4 flex overflow-hidden rounded-md">
        {Object.values(dna.colors).map((hex) => (
          <span key={hex} className="h-7 flex-1" style={{ background: hex }} title={hex} />
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-subtle">
        {dna.material} · {dna.light} · {dna.density}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-subtle">不要：{dna.forbidden.join(" / ")}</p>
    </div>
  );
}

export function StudioHistoryPanel({
  tab,
  onTab,
  assetRevs,
  adoptedId,
  inspectingId,
  style,
  onAdopt,
  onInspect,
  onStyleRev,
  onRollback,
}: {
  tab: "image" | "style";
  onTab: (tab: "image" | "style") => void;
  assetRevs: ImageRev[];
  adoptedId: string | null | undefined;
  inspectingId: string | null;
  style: StyleBranch;
  onAdopt: (imageId: string) => void;
  onInspect: (imageId: string | null) => void;
  onStyleRev: (rev: number) => void;
  onRollback: (rev: number) => void;
}) {
  const [imageView, setImageView] = useState<"list" | "tree">("list");
  const [rollbackRev, setRollbackRev] = useState<number | null>(null);
  const viewed = style.revs.find((record) => record.rev === style.currentRev) ?? null;
  const pending = style.revs.find((record) => record.rev === rollbackRev) ?? null;
  const pendingChanges = viewed && pending ? diffDna(viewed.dna, pending.dna) : [];

  function sameDna(rev: StyleRevRecord): boolean {
    return viewed ? diffDna(viewed.dna, rev.dna).length === 0 : true;
  }

  return (
    <>
      <div className="grid grid-cols-2 border-b border-border">
        {(
          [
            ["image", "图版本"],
            ["style", "风格版本"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "relative h-11 text-sm transition-colors duration-150",
              tab === id ? "text-fg" : "text-muted hover:text-fg",
            )}
            onClick={() => onTab(id)}
          >
            {label}
            {tab === id ? (
              <span className="absolute inset-x-4 bottom-0 h-px bg-accent" />
            ) : null}
          </button>
        ))}
      </div>
      {tab === "image" ? (
        <div className="min-w-0 max-w-full">
          <div className="flex gap-1 border-b border-border p-2">
            {(
              [
                ["list", "列表"],
                ["tree", "树"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={imageView === id}
                className={cn(
                  "h-11 flex-1 rounded-md text-sm transition-colors duration-150",
                  imageView === id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                )}
                onClick={() => setImageView(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {imageView === "list" ? (
            <ul className="p-2">
              {assetRevs
                .slice()
                .reverse()
                .map((rev, idx, arr) => (
                  <li key={rev.id}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full gap-3 rounded-md p-2 text-left transition-colors duration-150 hover:bg-surface-2"
                      onClick={() => {
                        onInspect(null);
                        onAdopt(rev.id);
                      }}
                    >
                      <img
                        src={rev.url}
                        alt=""
                        className="frame h-12 w-16 shrink-0 rounded-sm object-cover"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-fg">
                          v{arr.length - idx} · {rev.diff}
                        </span>
                        <span className="text-xs text-subtle">
                          {rev.action}
                          {adoptedId === rev.id ? " · 采用" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              {!assetRevs.length ? (
                <p className="px-3 py-8 text-center text-sm text-subtle">这个槽还没有图版本</p>
              ) : null}
            </ul>
          ) : (
            <RevTree
              revs={assetRevs}
              adoptedId={adoptedId}
              inspectingId={inspectingId}
              onInspect={onInspect}
              onAdopt={onAdopt}
            />
          )}
        </div>
      ) : (
        <ul className="p-2">
          {style.revs
            .slice()
            .reverse()
            .map((rev) => {
              const same = sameDna(rev);
              return (
                <li key={rev.rev}>
                  <div className="rounded-md transition-colors duration-150 hover:bg-surface-2">
                    <button
                      type="button"
                      className="min-h-11 w-full rounded-md p-2 text-left"
                      onClick={() => onStyleRev(rev.rev)}
                    >
                      <span className="block text-sm text-fg">
                        rev{rev.rev} · {rev.changeLog}
                        {style.currentRev === rev.rev ? " · 当前" : ""}
                      </span>
                      <span className="text-xs text-subtle">
                        {rev.parentRev !== null ? `改自 rev${rev.parentRev} · ` : ""}
                        之后新图跟这个 DNA，旧图不变
                      </span>
                    </button>
                    <div className="px-2 pb-2">
                      <button
                        type="button"
                        disabled={same}
                        title={same ? "和当前查看的 DNA 相同" : undefined}
                        className="min-h-11 w-full rounded-md px-2 text-left text-sm text-muted transition-colors duration-150 hover:text-fg disabled:opacity-40 disabled:hover:text-muted"
                        onClick={() => setRollbackRev(rev.rev)}
                      >
                        回到此版本
                      </button>
                    </div>
                  </div>
                  {rev.changes?.length ? (
                    <DnaChangeList changes={rev.changes} className="px-2 pb-3 pt-1" />
                  ) : null}
                </li>
              );
            })}
        </ul>
      )}
      {pending && viewed && pendingChanges.length > 0 ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-fg/40 p-4 md:place-items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rollback-title"
            className="w-full max-w-md rounded-xl bg-surface p-6 shadow-border"
          >
            <h2 id="rollback-title" className="font-display text-2xl tracking-tight">
              回到此版本？
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {`会追加一个新的风格版本，DNA 复制 rev${pending.rev}，修改说明为「回滚至 rev${pending.rev}」。历史版本保持原样。不调用模型，也不扣额度。`}
            </p>
            <div className="mt-4 max-h-64 overflow-y-auto rounded-md bg-bg p-3 shadow-border">
              <p className="mb-2 section-label">将改动 {pendingChanges.length} 个字段</p>
              <DnaChangeList changes={pendingChanges} />
            </div>
            <div className="mt-6 flex gap-2">
              <Button
                type="button"
                className="flex-1"
                onClick={() => {
                  onRollback(pending.rev);
                  setRollbackRev(null);
                }}
              >
                确认回滚
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setRollbackRev(null)}
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
