"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  clearUserDailyCapFn,
  grantUserBoostFn,
  listAdminUsersFn,
  listUserBoostLedgerFn,
  setUserDailyCapFn,
  type AdminUserList,
} from "@/app/actions/admin-users";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { messageForImageJobError } from "@/lib/image-jobs";
import { BEIJING_TIME_ZONE } from "@/lib/image-jobs/beijing-day";
import type { AdminUserQuota, BoostLedgerEntry } from "@/lib/image-jobs/types";

const lastActiveFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: BEIJING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatLastActive(at: number | null): string {
  if (at === null) return "尚无活动";
  return lastActiveFormat.format(new Date(at));
}

function toastActionError(err: unknown) {
  if (err instanceof Error && err.name !== "ImageJobError") {
    toast.error(err.message);
    return;
  }
  toast.error(messageForImageJobError(err));
}

export function AdminUsersScreen() {
  const { user, isPending } = useCurrentUserState();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [list, setList] = useState<AdminUserList | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isPending || !user) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void listAdminUsersFn({ data: { query: submittedQuery } })
      .then((payload) => {
        if (!cancelled) setList(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setFailed(true);
        toastActionError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, user, submittedQuery]);

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

  const role = list?.role ?? null;
  const users = list?.users ?? [];

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setSubmittedQuery(query.trim());
  }

  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 pb-20 pt-8 md:px-8 md:pt-12">
        <div className="max-w-2xl">
          <p className="section-label">管理</p>
          <h1 className="mt-3 font-display text-4xl leading-none tracking-tight text-fg md:text-5xl">
            用户
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            查看名称、邮箱、今日用量、生效上限、加量包余额和最近活跃。单独上限覆盖全站上限，清除后回到全站上限。也可以发放不过期的加量包。
          </p>
          {role === "admin" && list ? (
            <p className="mt-2 text-sm text-muted">
              当前全站每日上限 {list.globalCap}。今日按北京时间 {list.beijingDay} 计算。
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-x-5">
            <Link
              href="/account"
              className="inline-flex h-11 items-center text-sm text-fg hover:text-accent"
            >
              返回账户
            </Link>
            {role === "admin" ? (
              <Link
                href="/models"
                className="inline-flex h-11 items-center text-sm text-fg hover:text-accent"
              >
                模型目录
              </Link>
            ) : null}
          </div>
        </div>

        {loading && !list ? (
          <div className="h-40 animate-pulse rounded-xl bg-surface" />
        ) : failed && !list ? (
          <section className="max-w-xl rounded-xl bg-surface p-5 shadow-border">
            <p className="text-sm leading-relaxed text-muted">用户列表读取失败。</p>
          </section>
        ) : role !== "admin" ? (
          <section className="max-w-xl rounded-xl bg-surface p-5 shadow-border">
            <p className="text-sm leading-relaxed text-muted">仅管理员可查看用户列表。</p>
            <Link
              href="/account"
              className="mt-4 inline-flex h-11 items-center text-sm text-fg hover:text-accent"
            >
              返回账户
            </Link>
          </section>
        ) : (
          <div className="flex flex-col gap-4">
            <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={onSearch}>
              <label className="block min-w-0 flex-1 space-y-1.5">
                <span className="text-sm text-muted">搜索名称或邮箱</span>
                <Input
                  value={query}
                  maxLength={80}
                  autoComplete="off"
                  placeholder="输入名称或邮箱"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <Button type="submit" className="w-full sm:w-auto">
                搜索
              </Button>
            </form>

            {users.length === 0 ? (
              <section className="rounded-xl bg-surface p-5 shadow-border">
                <p className="text-sm leading-relaxed text-muted">
                  {submittedQuery ? "没有匹配的用户" : "还没有用户"}
                </p>
              </section>
            ) : (
              <ul className="grid gap-4">
                {users.map((row) => (
                  <li key={row.id}>
                    <UserRow
                      user={row}
                      globalCap={list?.globalCap ?? row.cap}
                      onUpdated={(next) =>
                        setList((current) =>
                          current
                            ? {
                                ...current,
                                users: current.users.map((item) =>
                                  item.id === next.id ? next : item,
                                ),
                              }
                            : current,
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function UserRow({
  user,
  globalCap,
  onUpdated,
}: {
  user: AdminUserQuota;
  globalCap: number;
  onUpdated: (user: AdminUserQuota) => void;
}) {
  const [draft, setDraft] = useState(user.userCap === null ? "" : String(user.userCap));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"cap" | "boost" | "ledger" | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledger, setLedger] = useState<BoostLedgerEntry[] | null>(null);

  useEffect(() => {
    setDraft(user.userCap === null ? "" : String(user.userCap));
  }, [user.userCap]);

  const label = user.name.trim() || "未命名";

  function onSet(event: FormEvent) {
    event.preventDefault();
    setBusy("cap");
    void setUserDailyCapFn({ data: { userId: user.id, cap: Number(draft) } })
      .then((next) => {
        onUpdated(next);
        toast.success(`已把 ${label} 的每日上限设为 ${next.cap}`);
      })
      .catch(toastActionError)
      .finally(() => setBusy(null));
  }

  function onClear() {
    setBusy("cap");
    void clearUserDailyCapFn({ data: { userId: user.id } })
      .then((next) => {
        onUpdated(next);
        toast.success(`已清除 ${label} 的单独上限，改用全站上限`);
      })
      .catch(toastActionError)
      .finally(() => setBusy(null));
  }

  function onGrant(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(amount);
    setBusy("boost");
    void grantUserBoostFn({ data: { userId: user.id, amount: parsed, note } })
      .then((next) => {
        onUpdated(next);
        setAmount("");
        setNote("");
        toast.success(`已给 ${label} 发放加量包，余额 ${next.boost}`);
      })
      .catch(toastActionError)
      .finally(() => setBusy(null));
  }

  return (
    <article className="rounded-xl bg-surface p-5 shadow-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-display text-xl tracking-tight text-fg">{label}</h2>
            {user.userCap === null ? (
              <span className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">全站上限</span>
            ) : (
              <span className="rounded-md bg-accent px-2 py-1 text-xs text-accent-fg">单独上限</span>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-muted">{user.email || "未绑定邮箱"}</p>
        </div>
        <p className="text-sm text-subtle">最近活跃 {formatLastActive(user.lastActiveAt)}</p>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
        <div className="flex justify-between gap-4">
          <dt className="text-subtle">今日用量</dt>
          <dd className="text-fg">{user.used}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-subtle">生效上限</dt>
          <dd className="text-fg">{user.cap}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-subtle">加量包</dt>
          <dd className="text-fg">{user.boost}</dd>
        </div>
      </dl>

      <form className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={onSet}>
        <label className="block min-w-0 flex-1 space-y-1.5">
          <span className="text-sm text-muted">每日上限</span>
          <Input
            type="number"
            min={0}
            max={9999}
            step={1}
            inputMode="numeric"
            value={draft}
            placeholder={`全站 ${globalCap}`}
            disabled={busy !== null}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={busy !== null || draft.trim() === ""}
          >
            {busy === "cap" ? "保存中…" : "设置上限"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={busy !== null || user.userCap === null}
            onClick={onClear}
          >
            清除上限
          </Button>
        </div>
      </form>

      <form
        className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end"
        onSubmit={onGrant}
      >
        <label className="block min-w-0 space-y-1.5 sm:w-28">
          <span className="text-sm text-muted">加量包数量</span>
          <Input
            type="number"
            min={1}
            max={9999}
            step={1}
            inputMode="numeric"
            value={amount}
            placeholder="1"
            disabled={busy !== null}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label className="block min-w-0 flex-1 space-y-1.5">
          <span className="text-sm text-muted">备注</span>
          <Input
            value={note}
            maxLength={200}
            autoComplete="off"
            placeholder="例如：试用客户"
            disabled={busy !== null}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <Button
          type="submit"
          className="w-full sm:w-auto"
          disabled={busy !== null || amount.trim() === "" || note.trim() === ""}
        >
          {busy === "boost" ? "发放中…" : "发放加量包"}
        </Button>
      </form>

      <div className="mt-4 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => {
            if (ledgerOpen) {
              setLedgerOpen(false);
              return;
            }
            setBusy("ledger");
            void listUserBoostLedgerFn({ data: { userId: user.id } })
              .then((entries) => {
                setLedger(entries);
                setLedgerOpen(true);
              })
              .catch(toastActionError)
              .finally(() => setBusy(null));
          }}
        >
          {busy === "ledger" ? "读取中…" : ledgerOpen ? "收起流水" : "查看流水"}
        </Button>
        {ledgerOpen && ledger ? (
          ledger.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-muted">还没有加量包流水</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {ledger.map((entry, index) => (
                <li
                  key={`${entry.at}-${entry.kind}-${index}`}
                  className="rounded-xl bg-surface-2 px-3 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-fg">
                      {entry.kind === "grant" ? "发放" : "扣除"} {entry.amount}
                    </span>
                    <span className="text-subtle">{lastActiveFormat.format(new Date(entry.at))}</span>
                  </div>
                  {entry.adminId ? (
                    <p className="mt-1 font-mono text-xs text-subtle">管理员 {entry.adminId}</p>
                  ) : null}
                  {entry.remark ? <p className="mt-1 text-muted">备注 {entry.remark}</p> : null}
                  {entry.jobId ? (
                    <p className="mt-1 font-mono text-xs text-subtle">任务 {entry.jobId}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </article>
  );
}
