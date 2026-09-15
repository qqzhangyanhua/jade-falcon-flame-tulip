import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ImagePlus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { DeleteProjectControl } from "@/components/delete-project-control";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { QuotaMeter } from "@/components/quota-meter";
import { parseBrief, generateCandidate } from "@/lib/ai";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  createStudioProjectFn,
  getDailyQuotaFn,
  listImageModelsFn,
  messageForImageJobError,
  type StudioQuota,
} from "@/lib/image-jobs";
import { PRESETS } from "@/lib/presets";
import { fileToDataUrl } from "@/lib/resize-image";
import { useStudio } from "@/lib/store";
import { uid } from "@/lib/utils";

const EXAMPLES = [
  "面向都市年轻人的春季训练营健身 App",
  "独立设计师用的极简记账工具",
  "新中式茶空间的品牌官网",
];

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
  const navigate = useNavigate();
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
      navigate({ to: "/login" });
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

  return (
    <div className="min-h-dvh bg-bg">
      <AppHeader leading={<Wordmark />} />

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-5 pb-12 pt-4 md:pt-8">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.22em] text-subtle">Style lock-in</p>
          <h1 className="font-display text-3xl leading-[1.12] tracking-tight text-fg md:text-4xl">
            先锁定方向，再出同一品牌的图
          </h1>
          <p className="max-w-lg text-sm leading-relaxed text-muted md:text-base">
            结构和气质拆开。一次锁定，产品界面、品牌主视觉、官网首屏共用一套视觉 DNA。
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 md:p-5">
          <label className="text-sm font-medium text-fg">产品或品牌描述</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder="例如：面向都市年轻人的春季训练营健身 App，要干净、有运动感，不要游戏风"
            className="mt-2 w-full resize-none rounded-md border border-border bg-bg px-3 py-3 text-base text-fg outline-none placeholder:text-subtle focus:border-accent"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setBrief(ex)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-fg"
              >
                {ex}
              </button>
            ))}
          </div>

          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted hover:border-accent">
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
            <img src={proto} alt="原型" className="mt-3 max-h-24 rounded-md border border-border object-contain" />
          ) : null}

          <Button
            className="mt-4 w-full"
            size="lg"
            disabled={
              busy || authPending || imagesUnavailable || (quota !== null && quota.remaining <= 0)
            }
            onClick={() => void start()}
          >
            {busy
              ? "正在解析并出四个方向…"
              : imagesUnavailable
                ? "出图暂不可用"
                : quota && quota.remaining <= 0
                  ? "今日额度已用完"
                  : !user && !authPending
                    ? "登录后生成四个方向"
                    : "生成四个方向"}
            {!busy && !imagesUnavailable && !(quota && quota.remaining <= 0) ? (
              <ArrowRight className="size-4" />
            ) : null}
          </Button>
          <div className="mt-2 flex flex-col items-center gap-1">
            {user ? <QuotaMeter quota={quota} /> : null}
            <p className="text-center text-xs text-subtle">
              {imagesUnavailable
                ? "出图暂不可用"
                : "解析描述不扣额度；每个方向候选会占用 1 次今日额度。"}
            </p>
          </div>
        </div>

        {projects.length > 0 ? (
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-subtle">已有项目</p>
            <ul className="space-y-2">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1"
                >
                  <button
                    className="flex min-h-11 min-w-0 flex-1 items-center justify-between px-2 py-2 text-left hover:text-accent"
                    onClick={() => {
                      useStudio.setState({ currentId: p.id });
                    }}
                  >
                    <span className="truncate text-sm text-fg">{p.name}</span>
                    <span className="ml-3 shrink-0 text-xs text-subtle">
                      {p.phase === "studio" ? "出图工作台" : p.phase === "direction" ? "选方向" : "草稿"}
                    </span>
                  </button>
                  <DeleteProjectControl projectId={p.id} compact />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </main>
    </div>
  );
}
