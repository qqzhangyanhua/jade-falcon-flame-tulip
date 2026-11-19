"use client";

import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { ConsistencyBadge } from "@/components/color-consistency-badge";
import { DeleteProjectControl } from "@/components/delete-project-control";
import { ProjectRenameControl } from "@/components/project-rename-control";
import { PROJECTS_CHANGED_EVENT } from "@/components/recent-projects";
import { ImageModelPicker } from "@/components/image-model-picker";
import { QuotaMeter } from "@/components/quota-meter";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { messageForImageJobError } from "@/lib/image-jobs";
import { useStudioImageGate } from "@/hooks/use-studio-image-gate";
import { paletteOfDna } from "@/lib/project/dna-export";
import { useStudio } from "@/lib/store";

export function DirectionView() {
  const project = useStudio((s) => s.current());
  const lockCandidate = useStudio((s) => s.lockCandidate);
  const setCurrentImageModel = useStudio((s) => s.setCurrentImageModel);
  const { state: imageGate, pick } = useStudioImageGate(project?.id);

  if (!project) return null;
  const pending = project.candidates.some((c) => c.status === "pending");
  const tailoring = project.mode === "tailoring";
  const hasReference = project.candidates.some((c) => c.presetId === "reference");

  return (
    <div className="page-shell">
      <AppHeader
        leading={
          <button
            type="button"
            className="min-h-11 text-left"
            onClick={() => useStudio.setState({ currentId: null })}
          >
            <Wordmark />
          </button>
        }
        extra={
          <div className="flex items-center gap-2">
            <ImageModelPicker
              className="hidden w-44 sm:block"
              state={imageGate}
              disabled={pending}
              onPick={(modelId) => {
                setCurrentImageModel(modelId);
                void pick(modelId).catch((e) => toast.error(messageForImageJobError(e)));
              }}
            />
            <QuotaMeter quota={imageGate?.quota} className="hidden sm:inline-flex" />
            <DeleteProjectControl projectId={project.id} compact />
          </div>
        }
      />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-8 md:px-8 md:pt-12">
        <div className="mb-10 max-w-2xl">
          <p className="section-label">第一步 · 锁定方向</p>
          <div className="mt-3">
            <ProjectRenameControl
              appearance="title"
              projectId={project.id}
              name={project.name}
              onRenamed={() => window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT))}
            />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted md:text-base">
            {hasReference
              ? "一条参考图方向，加上四个预设。锁定一张作为当前工作风格，其余最多保留两条备选。"
              : "四个正交方向，同一主题。锁定一张作为当前工作风格，其余最多保留两条备选。"}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {project.candidates.map((c) => {
            const isReference = c.presetId === "reference";
            return (
              <article
                key={c.id}
                className="overflow-hidden rounded-xl bg-surface p-2 shadow-border"
              >
                <div className="relative aspect-video overflow-hidden rounded-lg bg-surface-2">
                  {c.url ? (
                    <img src={c.url} alt={c.dna.name} className="frame size-full object-cover" />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center text-subtle">
                      {c.status === "error" ? (
                        <p className="text-sm text-danger">出图失败</p>
                      ) : (
                        <>
                          <Loader2 className="size-6 animate-spin" />
                          {tailoring ? <p className="text-sm">正在定制方向</p> : null}
                        </>
                      )}
                    </div>
                  )}
                  {c.url ? (
                    <ConsistencyBadge
                      className="absolute inset-x-2 bottom-2 z-10"
                      url={c.url}
                      palette={paletteOfDna(c.dna)}
                      offerTune={false}
                    />
                  ) : null}
                  <div className="absolute left-3 top-3 flex gap-1.5">
                    {Object.values(c.dna.colors)
                      .slice(0, 5)
                      .map((hex) => (
                        <span
                          key={hex}
                          className="size-3 rounded-full shadow-border"
                          style={{ background: hex }}
                        />
                      ))}
                  </div>
                </div>
                <div className="space-y-3 px-3 py-4">
                  <div>
                    {isReference ? <p className="text-xs font-medium text-fg">参考图方向</p> : null}
                    <h2
                      className={`font-display text-2xl tracking-tight text-fg ${isReference ? "mt-1" : ""}`}
                    >
                      {c.dna.name}
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{c.dna.oneLiner}</p>
                  </div>
                  <p className="text-xs text-subtle">
                    {c.dna.material} · {c.dna.light} · {c.dna.density}
                  </p>
                  <Button
                    className="w-full"
                    disabled={c.status !== "ready" || pending}
                    onClick={() => {
                      lockCandidate(c.id);
                      toast.success(
                        `已锁定 ${isReference ? "参考图方向" : c.dna.name}，其余方向保留为备选`,
                      );
                    }}
                  >
                    <Check className="size-4" />
                    锁定为当前风格
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
        {pending ? (
          <p className="mt-8 text-center text-sm text-muted">
            {tailoring
              ? "正在按你的需求定制方向…"
              : hasReference
                ? "正在出方向，卡片会逐张亮起。"
                : "正在出四个方向，卡片会逐张亮起。"}
          </p>
        ) : null}
      </main>
    </div>
  );
}
