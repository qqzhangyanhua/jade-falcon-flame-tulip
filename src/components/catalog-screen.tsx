"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  listCatalogModelsFn,
  renameCatalogModelFn,
  setCatalogImageDefaultFn,
  setCatalogModelEnabledFn,
} from "@/app/actions/catalog";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { messageForImageJobError } from "@/lib/image-jobs";
import type { CatalogModel, ImageJobAction, StudioRole } from "@/lib/image-jobs/types";

const KIND_LABEL: Record<CatalogModel["kind"], string> = {
  image: "出图",
  chat: "对话",
};

const ACTION_LABEL: Record<ImageJobAction, string> = {
  direction: "方向",
  generate: "出图",
  tune: "微调",
  compose: "换构图",
};

function patchModel(models: CatalogModel[], next: CatalogModel): CatalogModel[] {
  const replaced = models.map((model) => (model.id === next.id ? next : model));
  if (next.isAdminDefault && next.kind === "image") {
    return replaced.map((model) =>
      model.kind === "image" ? { ...model, isAdminDefault: model.id === next.id } : model,
    );
  }
  return replaced;
}

export function CatalogScreen() {
  const { user, isPending } = useCurrentUserState();
  const [role, setRole] = useState<StudioRole | null>(null);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isPending || !user) return;
    let cancelled = false;
    setLoading(true);
    void listCatalogModelsFn()
      .then((payload) => {
        if (cancelled) return;
        setRole(payload.role);
        setModels(payload.models);
      })
      .catch((err) => {
        if (!cancelled) toast.error(messageForImageJobError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, user]);

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

  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 pb-20 pt-8 md:px-8 md:pt-12">
        <div className="max-w-2xl">
          <p className="section-label">模型</p>
          <h1 className="mt-3 font-display text-4xl leading-none tracking-tight text-fg md:text-5xl">
            模型目录
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            管理员可改显示名、开关模型，并把一个出图模型设为新项目默认。上游 ID 只读。
          </p>
        </div>

        {loading ? (
          <div className="h-40 animate-pulse rounded-xl bg-surface" />
        ) : role !== "admin" ? (
          <section className="max-w-xl rounded-xl bg-surface p-5 shadow-border">
            <p className="text-sm leading-relaxed text-muted">仅管理员可配置模型目录。</p>
            <Link
              href="/account"
              className="mt-4 inline-flex h-11 items-center text-sm text-fg hover:text-accent"
            >
              返回账户
            </Link>
          </section>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {models.map((model) => (
              <li key={model.id}>
                <ModelCard
                  model={model}
                  onChange={(next) => setModels((current) => patchModel(current, next))}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function ModelCard({
  model,
  onChange,
}: {
  model: CatalogModel;
  onChange: (model: CatalogModel) => void;
}) {
  const [name, setName] = useState(model.displayName);
  const [savingName, setSavingName] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(model.displayName);
  }, [model.displayName]);

  const nameDirty = name.trim() !== model.displayName;

  return (
    <article className="h-full rounded-xl bg-surface p-5 shadow-border">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
          {KIND_LABEL[model.kind]}
        </span>
        {model.isAdminDefault ? (
          <span className="rounded-md bg-accent px-2 py-1 text-xs text-accent-fg">默认</span>
        ) : null}
        {!model.enabled ? (
          <span className="rounded-md border border-border px-2 py-1 text-xs text-subtle">
            已停用
          </span>
        ) : null}
      </div>

      <label className="mt-4 block space-y-1.5">
        <span className="text-sm text-muted">显示名称</span>
        <Input
          value={name}
          maxLength={40}
          disabled={savingName}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={savingName || !nameDirty}
          onClick={() => {
            setSavingName(true);
            void renameCatalogModelFn({ data: { id: model.id, displayName: name } })
              .then((next) => {
                onChange(next);
                toast.success("显示名已保存");
              })
              .catch((err) =>
                toast.error(err instanceof Error ? err.message : messageForImageJobError(err)),
              )
              .finally(() => setSavingName(false));
          }}
        >
          {savingName ? "保存中…" : "保存名称"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void setCatalogModelEnabledFn({ data: { id: model.id, enabled: !model.enabled } })
              .then((next) => {
                onChange(next);
                toast.success(next.enabled ? "已启用" : "已停用");
              })
              .catch((err) =>
                toast.error(err instanceof Error ? err.message : messageForImageJobError(err)),
              )
              .finally(() => setBusy(false));
          }}
        >
          {model.enabled ? "停用" : "启用"}
        </Button>
        {model.kind === "image" ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy || model.isAdminDefault}
            onClick={() => {
              setBusy(true);
              void setCatalogImageDefaultFn({ data: { id: model.id } })
                .then((next) => {
                  onChange(next);
                  toast.success("已设为新项目默认出图模型");
                })
                .catch((err) =>
                  toast.error(err instanceof Error ? err.message : messageForImageJobError(err)),
                )
                .finally(() => setBusy(false));
            }}
          >
            {model.isAdminDefault ? "当前默认" : "设为默认"}
          </Button>
        ) : null}
      </div>

      <dl className="mt-5 grid gap-3 border-t border-border pt-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="shrink-0 text-subtle">上游 ID</dt>
          <dd className="truncate font-mono text-xs text-fg">{model.upstreamId}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="shrink-0 text-subtle">能力</dt>
          <dd className="text-right text-fg">
            {model.capabilities.length
              ? model.capabilities.map((action) => ACTION_LABEL[action]).join(" · ")
              : "—"}
          </dd>
        </div>
      </dl>
    </article>
  );
}
