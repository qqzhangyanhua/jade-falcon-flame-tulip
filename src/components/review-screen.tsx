"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  hideReviewImageFn,
  listReviewImagesFn,
  unhideReviewImageFn,
} from "@/app/actions/review";
import { AppHeader } from "@/components/app-header";
import { HIDDEN_IMAGES_CHANGED_EVENT, HiddenImagePlaceholder } from "@/components/owned-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { imageJobErrorCode, messageForImageJobError } from "@/lib/image-jobs";
import { HIDE_REASON_MAX, type ReviewImage } from "@/lib/image-jobs/image-hide";
import type { StudioRole } from "@/lib/image-jobs/types";
import { formatJobTime } from "@/lib/open-from-job";

function reviewError(err: unknown): string {
  const code = imageJobErrorCode(err);
  if (code === "forbidden" || code === "unauthorized") return "仅管理员可审核图片";
  if (code === "not_found") return "图片不存在";
  if (code) return messageForImageJobError(err);
  return err instanceof Error ? err.message : "操作失败";
}

function userLabel(image: ReviewImage): string {
  if (image.userName && image.userEmail) return `${image.userName} · ${image.userEmail}`;
  return image.userName || image.userEmail || image.userId;
}

export function ReviewScreen() {
  const { user, isPending } = useCurrentUserState();
  const [role, setRole] = useState<StudioRole | null>(null);
  const [images, setImages] = useState<ReviewImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");

  const load = useCallback((userQuery: string) => {
    setLoading(true);
    return listReviewImagesFn({ data: { userQuery } })
      .then((payload) => {
        setRole(payload.role);
        setImages(payload.images);
      })
      .catch((err) => {
        toast.error(reviewError(err));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isPending || !user) return;
    void load("");
  }, [isPending, user, load]);

  if (isPending) {
    return (
      <div className="min-h-dvh bg-bg">
        <AppHeader />
        <main className="mx-auto max-w-6xl px-5 py-10 md:px-8">
          <div className="h-8 w-32 animate-pulse rounded-md bg-surface-2" />
          <div className="mt-6 h-40 animate-pulse rounded-xl bg-surface" />
        </main>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;

  function onFilter(event: FormEvent) {
    event.preventDefault();
    const next = query.trim();
    setApplied(next);
    void load(next);
  }

  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 pb-20 pt-8 md:px-8 md:pt-12">
        <div className="max-w-2xl">
          <p className="section-label">审核</p>
          <h1 className="mt-3 font-display text-4xl leading-none tracking-tight text-fg md:text-5xl">
            内容审核
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            最近生成的图片，新的在前。隐藏后任何人都看不到原图，包括所有者。撤销会恢复原图。
          </p>
          <div className="mt-4 flex flex-wrap gap-x-4">
            <Link href="/models" className="inline-flex h-11 items-center text-sm text-fg hover:text-accent">
              模型目录
            </Link>
            <Link href="/account" className="inline-flex h-11 items-center text-sm text-fg hover:text-accent">
              返回账户
            </Link>
          </div>
        </div>

        {loading && role === null ? (
          <div className="h-40 animate-pulse rounded-xl bg-surface" />
        ) : role !== "admin" ? (
          <section className="max-w-xl rounded-xl bg-surface p-5 shadow-border">
            <p className="text-sm leading-relaxed text-muted">仅管理员可审核图片。</p>
            <Link
              href="/account"
              className="mt-4 inline-flex h-11 items-center text-sm text-fg hover:text-accent"
            >
              返回账户
            </Link>
          </section>
        ) : (
          <>
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onFilter}>
              <label className="block min-w-0 flex-1 space-y-1.5">
                <span className="text-sm text-muted">按用户筛选</span>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="名称、邮箱或用户 ID"
                  maxLength={80}
                />
              </label>
              <Button type="submit" disabled={loading}>
                筛选
              </Button>
              {applied ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => {
                    setQuery("");
                    setApplied("");
                    void load("");
                  }}
                >
                  清除
                </Button>
              ) : null}
            </form>

            {loading ? (
              <div className="h-40 animate-pulse rounded-xl bg-surface" />
            ) : images.length === 0 ? (
              <p className="rounded-xl border border-border bg-surface px-5 py-8 text-sm text-muted">
                {applied ? "没有符合的图片。" : "还没有生成的图片。"}
              </p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((image) => (
                  <li key={image.id}>
                    <ReviewCard
                      image={image}
                      onChanged={() => {
                        window.dispatchEvent(new Event(HIDDEN_IMAGES_CHANGED_EVENT));
                        void load(applied);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ReviewCard({ image, onChanged }: { image: ReviewImage; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  function fail(err: unknown) {
    toast.error(reviewError(err));
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl bg-surface shadow-border">
      <div className="aspect-video bg-surface-2">
        {image.hidden ? (
          <HiddenImagePlaceholder className="size-full" />
        ) : (
          <img
            src={`/api/admin/images/${encodeURIComponent(image.id)}`}
            alt=""
            className="frame size-full object-cover"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-fg">{userLabel(image)}</p>
          <p className="truncate font-mono text-xs text-subtle">{image.userId}</p>
          <p className="mt-1 text-xs text-subtle">{formatJobTime(image.createdAt)}</p>
          {image.hidden && image.reason ? (
            <p className="mt-2 text-sm leading-relaxed text-muted">原因：{image.reason}</p>
          ) : null}
        </div>
        {image.hidden ? (
          <Button
            type="button"
            variant="outline"
            className="mt-auto w-full"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void unhideReviewImageFn({ data: { imageId: image.id } })
                .then(() => {
                  toast.success("已撤销隐藏");
                  onChanged();
                })
                .catch(fail)
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "撤销中…" : "撤销"}
          </Button>
        ) : (
          <div className="mt-auto space-y-2">
            <label className="block space-y-1.5">
              <span className="text-sm text-muted">原因（可选）</span>
              <Input
                value={reason}
                maxLength={HIDE_REASON_MAX}
                disabled={busy}
                placeholder="例如：不当内容"
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <Button
              type="button"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void hideReviewImageFn({ data: { imageId: image.id, reason } })
                  .then(() => {
                    toast.success("已隐藏");
                    setReason("");
                    onChanged();
                  })
                  .catch(fail)
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "隐藏中…" : "隐藏"}
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
