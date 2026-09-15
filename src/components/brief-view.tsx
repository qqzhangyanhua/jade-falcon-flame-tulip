"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { AtmosphereGrid } from "@/components/atmosphere-grid";
import { DeleteProjectControl } from "@/components/delete-project-control";
import { QuotaMeter } from "@/components/quota-meter";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { parseBrief } from "@/app/actions/brief";
import {
  createStudioProjectFn,
  generateCandidate,
  getDailyQuotaFn,
  listImageModelsFn,
} from "@/app/actions/studio";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { messageForImageJobError, type StudioQuota } from "@/lib/image-jobs";
import { PRESETS } from "@/lib/presets";
import { fileToDataUrl } from "@/lib/resize-image";
import { useStudio } from "@/lib/store";
import { adoptedRev, SLOTS, type Project } from "@/lib/types";
import { uid } from "@/lib/utils";

const EXAMPLES = [
  "面向都市年轻人的春季训练营健身 App",
  "独立设计师用的极简记账工具",
  "新中式茶空间的品牌官网",
];

const STEPS = [
  { n: "01", title: "描述产品", body: "一句话，或加上线框。" },
  { n: "02", title: "锁定方向", body: "四个正交气质，选一条。" },
  { n: "03", title: "同一 DNA 出图", body: "旗舰页、KV、官网共用。" },
];

function projectCover(project: Project): string | null {
  const style = project.styles.find((s) => s.id === project.currentStyleId) ?? project.styles[0];
  if (style) {
    for (const slot of SLOTS) {
      const asset = style.assets[slot.id];
      const adopted = adoptedRev(asset);
      if (adopted?.url) return adopted.url;
      const last = asset.revs.at(-1);
      if (last?.url) return last.url;
    }
    if (style.candidateUrl) return style.candidateUrl;
  }
  return project.candidates.find((c) => c.url)?.url ?? project.prototypeDataUrl;
}

function phaseLabel(phase: Project["phase"]): string {
  if (phase === "studio") return "工作台";
  if (phase === "direction") return "选方向";
  return "草稿";
}

export function BriefView() {
  const [brief, setBrief] = useState("");
  const [proto, setProto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createProject = useStudio((s) => s.createProject);
  const setIntent = useStudio((s) => s.setIntent);
  const setCandidates = useStudio((s) => s.setCandidates);
  const patchCandidate = useStudio((s) => s.patchCandidate);
  const projects = useStudio((s) => s.projects);
  const { user, isPending: authPending } = useCurrentUserState();
  const router = useRouter();
  const [imagesUnavailable, setImagesUnavailable] = useState(false);
  const [quota, setQuota] = useState<StudioQuota | null>(null);

  useEffect(() => {
    if (!user) return;
    void listImageModelsFn()
      .then((models) => setImagesUnavailable(models.length === 0))
      .catch(() => setImagesUnavailable(false));
    void getDailyQuotaFn()
      .then(setQuota)
      .catch(() => setQuota(null));
  }, [user]);

  async function onFile(file: File) {
    try {
      setProto(await fileToDataUrl(file));
    } catch {
      toast.error("图片读取失败");
    }
  }

  async function start() {
    if (authPending) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const text = brief.trim();
    if (!text) {
      toast.error("先写一句产品描述");
      return;
    }
    if (quota && quota.remaining <= 0) {
      toast.error("今日额度已用完");
      return;
    }
    setBusy(true);
    try {
      const created = await createStudioProjectFn({ data: { name: text.slice(0, 24) } });
      createProject({
        brief: text,
        prototypeDataUrl: proto,
        id: created.id,
        currentImageModelId: created.currentImageModelId,
      });
      const seeds = PRESETS.map((p) => ({
        id: uid("can"),
        presetId: p.id,
        dna: p.dna,
        url: null,
        status: "pending" as const,
      }));
      setCandidates(seeds);
      let product = text;
      try {
        const intent = await parseBrief({ data: { brief: text } });
        setIntent(intent);
        product = intent.productName || text;
      } catch {
        /* keep raw brief */
      }
      const failures: string[] = [];
      await Promise.all(
        seeds.map(async (c) => {
          try {
            const res = await generateCandidate({
              data: { projectId: created.id, presetId: c.presetId, product },
            });
            const url = res.urls[0];
            if (!url) throw new Error("upstream_failed");
            patchCandidate(c.id, { url, status: "ready" });
          } catch (err) {
            patchCandidate(c.id, { status: "error" });
            failures.push(messageForImageJobError(err));
          }
        }),
      );
      if (failures[0]) toast.error(failures[0]);
      const nextQuota = await getDailyQuotaFn().catch(() => null);
      if (nextQuota) setQuota(nextQuota);
    } catch (e) {
      toast.error(messageForImageJobError(e));
    } finally {
      setBusy(false);
    }
  }

  const cta = busy
    ? "正在解析并出四个方向…"
    : imagesUnavailable
      ? "出图暂不可用"
      : quota && quota.remaining <= 0
        ? "今日额度已用完"
        : !user && !authPending
          ? "登录后生成四个方向"
          : "生成四个方向";

  const blocked = busy || authPending || imagesUnavailable || (quota !== null && quota.remaining <= 0);

  return (
    <div className="page-shell">
      <AppHeader leading={<Wordmark />} />

      <main className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 md:pt-14">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16">
          <section className="order-2 space-y-8 lg:order-1">
            <div className="animate-rise space-y-4">
              <p className="text-xs uppercase tracking-kicker text-subtle">定调工作台</p>
              <h1 className="font-display text-4xl leading-none tracking-tight text-fg md:text-5xl">
                先锁方向，再出同一品牌的图
              </h1>
              <p className="max-w-lg text-sm leading-relaxed text-muted md:text-base">
                结构和气质拆开。一次锁定，产品界面、品牌主视觉、官网首屏共用一套视觉 DNA。
              </p>
            </div>

            <ol className="animate-rise grid gap-3 sm:grid-cols-3">
              {STEPS.map((step) => (
                <li key={step.n} className="rounded-lg border border-border bg-surface/60 px-4 py-4">
                  <p className="text-xs tabular-nums text-subtle">{step.n}</p>
                  <p className="mt-2 font-medium text-fg">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{step.body}</p>
                </li>
              ))}
            </ol>

            <AtmosphereGrid className="animate-rise" />
          </section>

          <section className="order-1 lg:sticky lg:top-8 lg:order-2">
            <div className="rounded-xl bg-surface p-2 shadow-border">
              <div className="rounded-lg bg-bg p-4 md:p-5">
                <label htmlFor="brief" className="text-sm font-medium text-fg">
                  产品或品牌描述
                </label>
                <textarea
                  id="brief"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  rows={4}
                  placeholder="例如：面向都市年轻人的春季训练营健身 App，要干净、有运动感，不要游戏风"
                  className="mt-3 w-full resize-none rounded-md border border-border bg-surface px-3 py-3 text-base leading-relaxed text-fg outline-none placeholder:text-subtle focus:border-accent"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setBrief(ex)}
                      className="min-h-11 rounded-full border border-border px-3 text-xs text-muted transition-colors duration-150 hover:border-accent hover:text-fg"
                    >
                      {ex}
                    </button>
                  ))}
                </div>

                <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted transition-colors duration-150 hover:border-accent hover:text-fg">
                  <ImagePlus className="size-4 shrink-0" />
                  <span>{proto ? "已上传原型，将作为结构参考" : "可选：上传线框 / 草图 / 截图"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onFile(f);
                    }}
                  />
                </label>
                {proto ? (
                  <img
                    src={proto}
                    alt="原型"
                    className="frame mt-3 max-h-24 rounded-md object-contain"
                  />
                ) : null}

                <Button
                  className="mt-4 w-full"
                  size="lg"
                  disabled={blocked}
                  onClick={() => void start()}
                >
                  {cta}
                  {!busy && !imagesUnavailable && !(quota && quota.remaining <= 0) ? (
                    <ArrowRight className="size-4" />
                  ) : null}
                </Button>
                <div className="mt-3 flex flex-col items-center gap-2">
                  {user ? <QuotaMeter quota={quota} /> : null}
                  <p className="text-center text-xs leading-relaxed text-subtle">
                    {imagesUnavailable
                      ? "出图暂不可用"
                      : "解析描述不扣额度；每个方向候选会占用 1 次今日额度。"}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {projects.length > 0 ? (
          <section className="mt-16">
            <p className="mb-4 text-xs uppercase tracking-kicker text-subtle">最近项目</p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => {
                const cover = projectCover(p);
                return (
                  <li key={p.id} className="overflow-hidden rounded-lg bg-surface shadow-border">
                    <button
                      type="button"
                      className="block w-full text-left"
                      onClick={() => {
                        useStudio.setState({ currentId: p.id });
                      }}
                    >
                      <div className="aspect-video bg-surface-2">
                        {cover ? (
                          <img src={cover} alt="" className="frame size-full object-cover" />
                        ) : (
                          <div className="flex size-full items-center justify-center text-xs text-subtle">
                            尚未出图
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3 px-3 py-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-fg">{p.name}</span>
                          <span className="text-xs text-subtle">{phaseLabel(p.phase)}</span>
                        </span>
                      </div>
                    </button>
                    <div className="flex justify-end border-t border-border px-2 py-1">
                      <DeleteProjectControl projectId={p.id} compact />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <p className="mt-16 max-w-xl text-sm leading-relaxed text-subtle">
          Keystone 把风格锁成可复用的 DNA，而不是又一张好看的图。
        </p>
      </main>
    </div>
  );
}
