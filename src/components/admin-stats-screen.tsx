"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import { getAdminStatsFn, type AdminStatsDto } from "@/app/actions/admin-stats";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { beijingCalendarDay } from "@/lib/image-jobs/beijing-day";
import { formatCostUsd } from "@/lib/image-jobs/admin-stats";
import { messageForImageJobError } from "@/lib/image-jobs";

const StatsChart = dynamic(
  () => import("@/components/admin-stats-chart").then((mod) => mod.AdminStatsChart),
  {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded-md bg-surface-2" />,
  },
);

const PRESETS = [
  { id: "today", label: "今天", back: 0 },
  { id: "7", label: "近 7 天", back: 6 },
  { id: "30", label: "近 30 天", back: 29 },
] as const;

function shiftBeijingDay(day: string, deltaDays: number): string {
  const ms = Date.parse(`${day}T00:00:00+08:00`) + deltaDays * 86_400_000;
  return beijingCalendarDay(ms);
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)} 毫秒`;
  const seconds = Math.round((ms / 1000) * 10) / 10;
  return Number.isInteger(seconds) ? `${seconds} 秒` : `${seconds.toFixed(1)} 秒`;
}

function formatFailureRate(rate: number): string {
  const pct = Math.round(rate * 1000) / 10;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

function CostValue({ ticks }: { ticks: string | null }) {
  if (ticks === null) return <span>未知</span>;
  try {
    return <span className="tabular-nums">{formatCostUsd(BigInt(ticks))}</span>;
  } catch {
    return <span>未知</span>;
  }
}

export function AdminStatsScreen() {
  const { user, isPending } = useCurrentUserState();
  const [fromDay, setFromDay] = useState<string | null>(null);
  const [toDay, setToDay] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStatsDto | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = beijingCalendarDay(Date.now());
    setFromDay(shiftBeijingDay(today, -6));
    setToDay(today);
  }, []);

  useEffect(() => {
    if (isPending || !user || !fromDay || !toDay) return;
    let cancelled = false;
    setLoading(true);
    void getAdminStatsFn({ data: { fromDay, toDay } })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setStats(null);
          if (result.code === "forbidden") {
            setDenied(true);
            return;
          }
          setDenied(false);
          toast.error("请选择不超过一年的时间范围");
          return;
        }
        setDenied(false);
        setStats(result.stats);
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
  }, [isPending, user, fromDay, toDay]);

  if (isPending || !fromDay || !toDay) {
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

  const today = beijingCalendarDay(Date.now());
  const activePreset = PRESETS.find(
    (preset) => fromDay === shiftBeijingDay(today, -preset.back) && toDay === today,
  )?.id;

  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 pb-20 pt-8 md:px-8 md:pt-12">
        <div className="max-w-2xl">
          <p className="section-label">管理</p>
          <h1 className="mt-3 font-display text-4xl leading-none tracking-tight text-fg md:text-5xl">
            任务统计
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            按模型查看所选时间范围内的任务数、失败率、P50/P90 耗时和实际成本。日期按北京时间。没有费用记录的任务显示为未知，不按
            0 美元计算。
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/models" className="inline-flex h-11 items-center text-fg hover:text-accent">
              模型目录
            </Link>
            <Link href="/account" className="inline-flex h-11 items-center text-muted hover:text-fg">
              返回账户
            </Link>
          </div>
        </div>

        <section className="rounded-xl bg-surface p-5 shadow-border">
          <h2 className="font-display text-xl tracking-tight">时间范围</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                size="md"
                variant={activePreset === preset.id ? "primary" : "outline"}
                onClick={() => {
                  const nextToday = beijingCalendarDay(Date.now());
                  setFromDay(shiftBeijingDay(nextToday, -preset.back));
                  setToDay(nextToday);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm text-muted">开始日期</span>
              <Input
                type="date"
                value={fromDay}
                max={toDay}
                onChange={(event) => {
                  if (event.target.value) setFromDay(event.target.value);
                }}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-muted">结束日期</span>
              <Input
                type="date"
                value={toDay}
                min={fromDay}
                onChange={(event) => {
                  if (event.target.value) setToDay(event.target.value);
                }}
              />
            </label>
          </div>
        </section>

        {loading ? (
          <div className="h-40 animate-pulse rounded-xl bg-surface" />
        ) : denied ? (
          <section className="max-w-xl rounded-xl bg-surface p-5 shadow-border">
            <p className="text-sm leading-relaxed text-muted">仅管理员可查看任务统计。</p>
            <Link
              href="/account"
              className="mt-4 inline-flex h-11 items-center text-sm text-fg hover:text-accent"
            >
              返回账户
            </Link>
          </section>
        ) : !stats || stats.models.length === 0 ? (
          <section className="rounded-xl bg-surface p-5 shadow-border">
            <p className="text-sm leading-relaxed text-muted">这段时间没有出图任务。</p>
          </section>
        ) : (
          <>
            <section className="min-w-0 rounded-xl bg-surface p-5 shadow-border">
              <h2 className="font-display text-xl tracking-tight">按天</h2>
              <p className="mt-2 text-sm text-muted">每天的任务数和失败数。</p>
              <div className="mt-4">
                <StatsChart days={stats.days} />
              </div>
            </section>

            <section className="min-w-0 rounded-xl bg-surface p-5 shadow-border">
              <h2 className="font-display text-xl tracking-tight">按模型</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-subtle">
                      <th className="py-3 pr-4 font-medium">模型</th>
                      <th className="py-3 pr-4 font-medium">任务数</th>
                      <th className="py-3 pr-4 font-medium">失败率</th>
                      <th className="py-3 pr-4 font-medium">P50</th>
                      <th className="py-3 pr-4 font-medium">P90</th>
                      <th className="py-3 pr-4 font-medium">已知成本</th>
                      <th className="py-3 font-medium">费用未知</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.models.map((model) => (
                      <tr key={model.catalogModelId} className="border-b border-border last:border-0">
                        <th className="py-3 pr-4 text-left font-medium text-fg">{model.displayName}</th>
                        <td className="py-3 pr-4 tabular-nums text-fg">{model.jobCount}</td>
                        <td className="py-3 pr-4 tabular-nums text-fg">
                          {formatFailureRate(model.failureRate)}
                        </td>
                        <td className="py-3 pr-4 tabular-nums text-fg">{formatDuration(model.p50Ms)}</td>
                        <td className="py-3 pr-4 tabular-nums text-fg">{formatDuration(model.p90Ms)}</td>
                        <td className="py-3 pr-4 text-fg">
                          <CostValue ticks={model.costTicks} />
                        </td>
                        <td className="py-3 tabular-nums text-fg">{model.unknownCostCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
