"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getProfile, saveProfile } from "@/app/actions/profile";
import { getStudioAccessFn, setDailyImageCapFn } from "@/app/actions/studio";
import {
  messageForImageJobError,
  quotaExhausted,
  type StudioQuota,
  type StudioRole,
} from "@/lib/image-jobs";
import type { ProfileRecord } from "@/lib/types";

export function AccountScreen() {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id ?? null;
  const sessionName = user?.displayName ?? "";
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<StudioRole>("user");
  const [quota, setQuota] = useState<StudioQuota | null>(null);
  const [capDraft, setCapDraft] = useState("30");
  const [savingCap, setSavingCap] = useState(false);

  useEffect(() => {
    if (isPending || !userId) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([getProfile(), getStudioAccessFn()])
      .then(([row, access]) => {
        if (cancelled) return;
        setProfile(row);
        setDisplayName(row.displayName || sessionName);
        setTitle(row.title);
        setBio(row.bio);
        setRole(access.role);
        setQuota(access.quota);
        setCapDraft(String(access.globalCap));
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "资料读取失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, userId, sessionName]);

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

  const label = user.displayName ?? user.primaryEmail ?? "账户";

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await saveProfile({
        data: { displayName, title, bio },
      });
      setProfile(saved);
      toast.success("资料已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 pb-20 pt-8 md:px-8 md:pt-12">
        <div className="max-w-2xl">
          <p className="section-label">账户</p>
          <h1 className="mt-3 font-display text-4xl leading-none tracking-tight text-fg md:text-5xl">
            用户信息
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            登录身份来自当前会话。下方资料只属于你，保存后会写入账户记录。
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-8">
          <section className="rounded-xl border border-border bg-surface p-5 lg:sticky lg:top-6">
            <div className="flex items-center gap-4">
              {user.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt=""
                  className="size-16 rounded-full object-cover"
                />
              ) : (
                <span className="grid size-16 place-items-center rounded-full bg-surface-2 font-display text-xl text-fg">
                  {label.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-lg text-fg">{label}</p>
                <p className="truncate text-sm text-muted">{user.primaryEmail ?? "未绑定邮箱"}</p>
              </div>
            </div>
            <dl className="mt-5 grid gap-3 text-sm">
              <div className="flex justify-between gap-4 border-t border-border pt-3">
                <dt className="text-subtle">用户 ID</dt>
                <dd className="truncate font-mono text-xs text-fg">{user.id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">邮箱</dt>
                <dd className="truncate text-fg">{user.primaryEmail ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">资料更新</dt>
                <dd className="text-fg">
                  {profile?.updatedAt
                    ? profile.updatedAt.replace("T", " ").slice(0, 16)
                    : "尚未保存"}
                </dd>
              </div>
            </dl>
          </section>

          <div className="flex min-w-0 flex-col gap-6">
            <form
              className="space-y-4 rounded-xl border border-border bg-surface p-5"
              onSubmit={(e) => void onSave(e)}
            >
              <h2 className="font-display text-xl tracking-tight">可编辑资料</h2>
              <label className="block space-y-1.5">
                <span className="text-sm text-muted">显示名称</span>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={40}
                  required
                  disabled={loading}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm text-muted">头衔</span>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={40}
                  placeholder="例如：品牌设计师"
                  disabled={loading}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm text-muted">简介</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={200}
                  rows={4}
                  placeholder="一句话介绍你在做什么"
                  disabled={loading}
                  className="w-full resize-none rounded-md border border-border bg-bg px-3 py-3 text-base text-fg outline-none placeholder:text-subtle focus:border-accent disabled:opacity-40"
                />
              </label>
              <Button type="submit" disabled={saving || loading}>
                {saving ? "保存中…" : "保存资料"}
              </Button>
            </form>

            <section className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-display text-xl tracking-tight">今日出图额度</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                按北京时间自然日计算。方向候选、槽位出图、微调和换构图各计 1
                次；解析描述不计。失败仍占用。每日额度用完后从加量包扣，加量包不过期。
              </p>
              {quota ? (
                <div className="mt-4 space-y-1 text-sm text-fg">
                  <p>
                    今日剩余 {quota.remaining}/{quota.cap}（{quota.beijingDay}）
                  </p>
                  <p>加量包 {quota.boost}</p>
                  {quotaExhausted(quota) ? <p>今日额度已用完</p> : null}
                </div>
              ) : (
                <p className="mt-4 text-sm text-fg">读取中…</p>
              )}
              {role === "admin" ? (
                <form
                  className="mt-5 space-y-3 border-t border-border pt-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setSavingCap(true);
                    void setDailyImageCapFn({ data: { cap: Number(capDraft) } })
                      .then(async (saved) => {
                        setCapDraft(String(saved.cap));
                        const access = await getStudioAccessFn();
                        setQuota(access.quota);
                        setCapDraft(String(access.globalCap));
                        toast.success("全站每日额度已更新");
                      })
                      .catch((e) => {
                        toast.error(e instanceof Error ? e.message : messageForImageJobError(e));
                      })
                      .finally(() => setSavingCap(false));
                  }}
                >
                  <p className="text-sm text-muted">
                    管理员：修改全站每日上限。没有单独上限的用户都用这个数。
                  </p>
                  <label className="block space-y-1.5">
                    <span className="text-sm text-muted">每日额度</span>
                    <Input
                      type="number"
                      min={0}
                      max={9999}
                      step={1}
                      value={capDraft}
                      onChange={(e) => setCapDraft(e.target.value)}
                      disabled={savingCap}
                    />
                  </label>
                  <Button type="submit" disabled={savingCap || loading}>
                    {savingCap ? "保存中…" : "保存全站额度"}
                  </Button>
                </form>
              ) : null}
            </section>

            {role === "admin" ? (
              <section className="rounded-xl border border-border bg-surface p-5">
                <h2 className="font-display text-xl tracking-tight">模型目录</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  改显示名、开关模型，并指定新项目的默认出图模型。
                </p>
                <Link href="/models" className="btn btn-ink mt-4 h-11 px-4">
                  打开模型目录
                </Link>
              </section>
            ) : null}

            {role === "admin" ? (
              <section className="rounded-xl border border-border bg-surface p-5">
                <h2 className="font-display text-xl tracking-tight">用户</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  查看今日用量和生效上限，并为单个用户设置或清除每日上限。
                </p>
                <Link href="/admin/users" className="btn btn-ink mt-4 h-11 px-4">
                  打开用户列表
                </Link>
              </section>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
