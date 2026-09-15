"use client";

import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { DeleteProjectControl } from "@/components/delete-project-control";
import { ImageModelPicker } from "@/components/image-model-picker";
import { QuotaMeter } from "@/components/quota-meter";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { messageForImageJobError } from "@/lib/image-jobs";
import { useStudioImageGate } from "@/hooks/use-studio-image-gate";
import { useStudio } from "@/lib/store";

export function DirectionView() {
  const project = useStudio((s) => s.current());
  const lockCandidate = useStudio((s) => s.lockCandidate);
  const setCurrentImageModel = useStudio((s) => s.setCurrentImageModel);
  const { state: imageGate, pick } = useStudioImageGate(project?.id);

  if (!project) return null;
  const pending = project.candidates.some((c) => c.status === "pending");

  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader
        className="py-4"
        leading={<Wordmark />}
        extra={
          <div className="flex items-center gap-3">
            <ImageModelPicker
              state={imageGate}
              disabled={pending}
              onPick={(modelId) => {
                setCurrentImageModel(modelId);
                void pick(modelId).catch((e) => toast.error(messageForImageJobError(e)));
              }}
            />
            <QuotaMeter quota={imageGate?.quota} />
            <DeleteProjectControl projectId={project.id} />
            <button
              type="button"
              className="h-11 px-2 text-sm text-muted hover:text-fg"
              onClick={() => useStudio.setState({ currentId: null })}
            >
              返回
            </button>
          </div>
        }
      />
      <main className="mx-auto max-w-6xl px-5 pb-16">
        <div className="mb-8 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">Step 1 · 定方向</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight md:text-4xl">{project.name}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            四个正交方向，同一主题。锁定一张作为当前工作风格，其余最多保留两条备选。确认卡会同时看界面气质和品牌 KV。
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {project.candidates.map((c) => (
            <article
              key={c.id}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <div className="relative aspect-video bg-surface-2">
                {c.url ? (
                  <img src={c.url} alt={c.dna.name} className="size-full object-cover" />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center text-subtle">
                    {c.status === "error" ? (
                      <p className="text-sm text-danger">出图失败</p>
                    ) : (
                      <Loader2 className="size-6 animate-spin" />
                    )}
                  </div>
                )}
                <div className="absolute left-3 top-3 flex gap-1.5">
                  {Object.values(c.dna.colors)
                    .slice(0, 5)
                    .map((hex) => (
                      <span
                        key={hex}
                        className="size-3 rounded-full border border-border"
                        style={{ background: hex }}
                      />
                    ))}
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <h2 className="font-display text-xl text-fg">{c.dna.name}</h2>
                  <p className="text-sm text-muted">{c.dna.oneLiner}</p>
                </div>
                <p className="text-xs text-subtle">
                  {c.dna.material} · {c.dna.light} · {c.dna.density}
                </p>
                <Button
                  className="w-full"
                  disabled={c.status !== "ready" || pending}
                  onClick={() => {
                    lockCandidate(c.id);
                    toast.success(`已锁定 ${c.dna.name}，其余方向保留为备选`);
                  }}
                >
                  <Check className="size-4" />
                  锁定为当前风格
                </Button>
              </div>
            </article>
          ))}
        </div>
        {pending ? (
          <p className="mt-6 text-center text-sm text-muted">正在出四个方向，卡片会逐张亮起。</p>
        ) : null}
      </main>
    </div>
  );
}
