"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ImagePlus, Images } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { AtmosphereGrid } from "@/components/atmosphere-grid";
import { LocalMigrationPrompt } from "@/components/local-migration";
import { QuotaMeter } from "@/components/quota-meter";
import { RecentProjects } from "@/components/recent-projects";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { parseBrief, referenceDirectionFn, tailorDirections } from "@/app/actions/brief";
import {
  createStudioProjectFn,
  generateCandidate,
  getDailyQuotaFn,
  listImageModelsFn,
  uploadReferenceImageFn,
  uploadWireframeFn,
} from "@/app/actions/studio";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { messageForImageJobError, quotaExhausted, type StudioQuota } from "@/lib/image-jobs";
import { PRESETS } from "@/lib/presets";
import { presetDirections } from "@/lib/style-ai/shared";
import { fileToDataUrl } from "@/lib/resize-image";
import { useStudio } from "@/lib/store";
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

export function BriefView() {
  const [brief, setBrief] = useState("");
  const [proto, setProto] = useState<string | null>(null);
  const [references, setReferences] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const createProject = useStudio((s) => s.createProject);
  const setIntent = useStudio((s) => s.setIntent);
  const setCandidates = useStudio((s) => s.setCandidates);
  const patchCandidate = useStudio((s) => s.patchCandidate);
  const setMode = useStudio((s) => s.setMode);
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

  async function onReferences(files: FileList | null) {
    if (!files?.length) return;
    const room = 3 - references.length;
    if (room <= 0) {
      toast.error("最多三张参考图");
      return;
    }
    const picked = [...files].slice(0, room);
    if (files.length > room) toast.error("最多三张参考图");
    const next: string[] = [];
    for (const file of picked) {
      try {
        next.push(await fileToDataUrl(file));
      } catch {
        toast.error("图片读取失败");
      }
    }
    if (next.length) setReferences((current) => [...current, ...next].slice(0, 3));
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
    if (quota && quotaExhausted(quota)) {
      toast.error("今日额度已用完");
      return;
    }
    setBusy(true);
    try {
      const created = await createStudioProjectFn({ data: { name: text.slice(0, 24) } });
      const prototypeUrl = proto
        ? (await uploadWireframeFn({ data: { projectId: created.id, dataUrl: proto } })).url
        : null;
      const referenceUrls: string[] = [];
      for (const dataUrl of references) {
        try {
          referenceUrls.push(
            (await uploadReferenceImageFn({ data: { projectId: created.id, dataUrl } })).url,
          );
        } catch (err) {
          toast.error(messageForImageJobError(err));
        }
      }
      createProject({
        brief: text,
        prototypeDataUrl: prototypeUrl,
        referenceImageUrls: referenceUrls,
        id: created.id,
        currentImageModelId: created.currentImageModelId,
      });
      const presetSeeds = PRESETS.map((p) => ({
        id: uid("can"),
        presetId: p.id,
        dna: p.dna,
        url: null,
        status: "pending" as const,
      }));
      setCandidates(presetSeeds);
      let product = text;
      let seeds = presetSeeds;
      let intent: Awaited<ReturnType<typeof parseBrief>> | null = null;
      try {
        intent = await parseBrief({ data: { brief: text } });
        setIntent(intent);
        product = intent.productName || text;
        setMode("tailoring");
        const dnaByPreset = new Map(presetDirections(intent).map((d) => [d.presetId, d.dna]));
        try {
          for (const d of await tailorDirections({ data: { intent } }))
            dnaByPreset.set(d.presetId, d.dna);
        } catch {
          /* the preset directions already carry the user's mood and forbidden styles */
        }
        seeds = presetSeeds.map((seed) => ({
          ...seed,
          dna: dnaByPreset.get(seed.presetId) ?? seed.dna,
        }));
        setCandidates(seeds);
      } catch {
        /* keep raw brief */
      }
      if (referenceUrls.length > 0) {
        let extracted: Awaited<ReturnType<typeof referenceDirectionFn>> | null = null;
        if (intent) {
          try {
            extracted = await referenceDirectionFn({ data: { intent, imageUrls: referenceUrls } });
          } catch {
            extracted = null;
          }
        }
        if (extracted?.ok) {
          seeds = [
            ...seeds,
            {
              id: uid("can"),
              presetId: "reference",
              dna: extracted.dna,
              url: null,
              status: "pending" as const,
            },
          ];
          setCandidates(seeds);
        } else {
          toast.error("参考图没能提炼成方向");
        }
      }
      setMode("generating");
      const failures: string[] = [];
      await Promise.all(
        seeds.map(async (c) => {
          try {
            const res = await generateCandidate({
              data: { projectId: created.id, presetId: c.presetId, product, dna: c.dna },
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
      setMode("idle");
      setBusy(false);
    }
  }

  const hasReferences = references.length > 0;
  const cta = busy
    ? hasReferences
      ? "正在解析并出方向…"
      : "正在解析并出四个方向…"
    : imagesUnavailable
      ? "出图暂不可用"
      : quota && quotaExhausted(quota)
        ? "今日额度已用完"
        : !user && !authPending
          ? hasReferences
            ? "登录后生成方向"
            : "登录后生成四个方向"
          : hasReferences
            ? "生成方向（含参考图）"
            : "生成四个方向";

  const blocked =
    busy || authPending || imagesUnavailable || (quota !== null && quotaExhausted(quota));

  return (
    <div className="page-shell">
      <AppHeader
        leading={
          <Link href="/" className="min-h-11">
            <Wordmark />
          </Link>
        }
      />

      <main className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 md:px-8 md:pt-14">
        <LocalMigrationPrompt className="mb-8" />
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16">
          <section className="order-2 space-y-8 lg:order-1">
            <div className="animate-rise space-y-4">
              <p className="section-label">定调工作台</p>
              <h1 className="font-display text-4xl leading-none tracking-tight text-fg md:text-5xl">
                先锁方向，再出同一品牌的图
              </h1>
              <p className="max-w-lg text-sm leading-relaxed text-muted md:text-base">
                结构和气质拆开。一次锁定，产品界面、品牌主视觉、官网首屏共用一套视觉 DNA。
              </p>
            </div>

            <ol className="animate-rise grid gap-3 sm:grid-cols-3">
              {STEPS.map((step) => (
                <li
                  key={step.n}
                  className="rounded-lg border border-border bg-surface/60 px-4 py-4"
                >
                  <p className="text-xs tabular-nums text-subtle">{step.n}</p>
                  <p className="mt-2 font-medium text-fg">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {step.n === "02" && hasReferences ? "四个预设，外加参考图方向。" : step.body}
                  </p>
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
                      className="min-h-11 rounded-sm border border-border px-3 text-xs text-muted transition-colors duration-150 hover:border-fg hover:text-fg"
                    >
                      {ex}
                    </button>
                  ))}
                </div>

                <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted transition-colors duration-150 hover:border-accent hover:text-fg">
                  <ImagePlus className="size-4 shrink-0" />
                  <span>
                    {proto ? "已上传原型，将作为结构参考" : "可选：上传线框 / 草图 / 截图"}
                  </span>
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

                <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted transition-colors duration-150 hover:border-accent hover:text-fg">
                  <Images className="size-4 shrink-0" />
                  <span>
                    {references.length >= 3
                      ? "已选 3 张参考图"
                      : references.length > 0
                        ? `已选 ${references.length} 张参考图，还可再加`
                        : "可选：上传 1～3 张参考图"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void onReferences(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                {references.length > 0 ? (
                  <ul className="mt-3 grid grid-cols-3 gap-2">
                    {references.map((src, index) => (
                      <li key={`${index}-${src.slice(0, 48)}`} className="space-y-1">
                        <img
                          src={src}
                          alt={`参考图 ${index + 1}`}
                          className="frame aspect-video w-full rounded-md object-cover"
                        />
                        <button
                          type="button"
                          className="min-h-11 w-full rounded-sm border border-border px-2 text-xs text-muted transition-colors duration-150 hover:border-fg hover:text-fg"
                          onClick={() =>
                            setReferences((current) => current.filter((_, i) => i !== index))
                          }
                        >
                          移除
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <Button
                  className="mt-4 w-full"
                  size="lg"
                  disabled={blocked}
                  onClick={() => void start()}
                >
                  {cta}
                  {!busy && !imagesUnavailable && !(quota && quotaExhausted(quota)) ? (
                    <ArrowRight className="size-4" />
                  ) : null}
                </Button>
                <div className="mt-3 flex flex-col items-center gap-2">
                  {user ? <QuotaMeter quota={quota} /> : null}
                  <p className="text-center text-xs leading-relaxed text-subtle">
                    {imagesUnavailable
                      ? "出图暂不可用"
                      : hasReferences
                        ? "解析描述和参考图提炼不扣额度；每个方向候选会占用 1 次额度，先扣今日额度，再扣加量包。"
                        : "解析描述不扣额度；每个方向候选会占用 1 次额度，先扣今日额度，再扣加量包。"}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {user ? <RecentProjects /> : null}

        <p className="mt-16 max-w-xl text-sm leading-relaxed text-subtle">
          Keystone 把风格锁成可复用的 DNA，而不是又一张好看的图。
        </p>
      </main>
    </div>
  );
}
