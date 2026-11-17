"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listMyJobsFn } from "@/app/actions/studio";
import { messageForImageJobError, type ImageJobHistoryItem } from "@/lib/image-jobs";
import {
  actionLabel,
  formatJobTime,
  isLivingStudioProject,
  openStudioFromJob,
  slotLabel,
  statusLabel,
} from "@/lib/open-from-job";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

export function JobHistoryView() {
  const { user, isPending } = useCurrentUserState();
  const router = useRouter();
  const projects = useStudio((s) => s.projects);
  const [jobs, setJobs] = useState<ImageJobHistoryItem[] | null>(null);

  useEffect(() => {
    if (isPending || !user) return;
    let cancelled = false;
    void listMyJobsFn()
      .then((rows) => {
        if (!cancelled) setJobs(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(messageForImageJobError(err));
        setJobs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, user]);

  if (isPending) {
    return (
      <div className="min-h-dvh bg-bg">
        <AppHeader />
        <main className="mx-auto max-w-2xl px-5 py-10">
          <div className="h-8 w-40 animate-pulse rounded-md bg-surface-2" />
          <div className="mt-6 h-48 animate-pulse rounded-xl bg-surface" />
        </main>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;

  function openJob(job: ImageJobHistoryItem) {
    if (!job.projectAlive || !isLivingStudioProject(job.projectId)) return;
    const opened = openStudioFromJob({
      projectId: job.projectId,
      slot: job.slot,
      jobId: job.id,
      imageUrls: job.imageUrls,
      action: job.action,
      projectAlive: job.projectAlive,
    });
    if (opened) {
      void router.push("/studio");
      return;
    }
    toast.error("项目已不在本地");
  }

  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-5 pb-16 pt-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">Jobs</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight text-fg">我的作业历史</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            只列你自己的出图作业，按时间倒序。模型名是当时写下的快照；「已停用」看当前目录。
          </p>
        </div>

        {jobs === null ? (
          <div className="h-40 animate-pulse rounded-xl bg-surface" />
        ) : jobs.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface px-5 py-8 text-sm text-muted">
            还没有出图作业。方向候选、槽位出图、微调和换构图都会出现在这里。
          </p>
        ) : (
          <ul className="space-y-2">
            {jobs.map((job) => {
              const living =
                job.projectAlive && projects.some((project) => project.id === job.projectId);
              const projectName = job.projectAlive
                ? (projects.find((project) => project.id === job.projectId)?.name ?? "未命名项目")
                : "已删除";
              const thumb = job.projectAlive ? job.imageUrls[0] : undefined;
              const body = (
                <span className="flex items-start gap-3">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="h-12 w-16 shrink-0 rounded-md border border-border object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-[10px] text-subtle">
                      {job.projectAlive ? "无图" : "已删除"}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium text-fg">{projectName}</span>
                      <time className="shrink-0 text-xs text-subtle">{formatJobTime(job.createdAt)}</time>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span>{slotLabel(job.slot)}</span>
                      <span>·</span>
                      <span>{actionLabel(job.action)}</span>
                      <span>·</span>
                      <span>{job.displayNameSnapshot}</span>
                      {job.modelDisabled ? (
                        <span className="rounded-sm border border-border px-1.5 py-0.5 text-subtle">
                          已停用
                        </span>
                      ) : null}
                      {!job.projectAlive ? (
                        <span className="rounded-sm border border-border px-1.5 py-0.5 text-subtle">
                          已删除
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "ml-auto",
                          job.status === "failed" && "text-danger",
                          job.status === "succeeded" && "text-fg",
                        )}
                      >
                        {statusLabel(job.status)}
                      </span>
                    </span>
                  </span>
                </span>
              );

              return (
                <li key={job.id}>
                  {living ? (
                    <button
                      type="button"
                      className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left hover:border-accent"
                      onClick={() => openJob(job)}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left opacity-80">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
