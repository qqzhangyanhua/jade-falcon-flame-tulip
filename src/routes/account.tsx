import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getProfile, saveProfile } from "@/lib/profile";
import type { ProfileRecord } from "@/lib/types";

export const Route = createFileRoute("/account")({ component: Account });

function Account() {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id ?? null;
  const sessionName = user?.displayName ?? "";
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isPending || !userId) return;
    let cancelled = false;
    setLoading(true);
    void getProfile()
      .then((row) => {
        if (cancelled) return;
        setProfile(row);
        setDisplayName(row.displayName || sessionName);
        setTitle(row.title);
        setBio(row.bio);
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
        <main className="mx-auto max-w-xl px-5 py-10">
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
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-5 pb-16 pt-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">Account</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight text-fg">用户信息</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            登录身份来自当前会话。下方资料只属于你，保存后会写入账户记录。
          </p>
        </div>

        <section className="rounded-xl border border-border bg-surface p-5">
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
                {profile?.updatedAt ? profile.updatedAt.replace("T", " ").slice(0, 16) : "尚未保存"}
              </dd>
            </div>
          </dl>
        </section>

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
      </main>
    </div>
  );
}
