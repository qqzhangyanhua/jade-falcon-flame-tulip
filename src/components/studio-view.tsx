"use client";

import { useMemo, useState } from "react";
import { Download, PanelLeft } from "lucide-react";
import { toast } from "sonner";
import { AuthSlot } from "@/components/auth-slot";
import { DeleteProjectControl } from "@/components/delete-project-control";
import { JobHistoryLink } from "@/components/job-history-link";
import { ImageModelPicker } from "@/components/image-model-picker";
import { QuotaMeter } from "@/components/quota-meter";
import { StudioHistoryPanel, StyleCard } from "@/components/studio-panels";
import { StudioGenerateBar, StudioTunePanel } from "@/components/studio-tools";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import {
  composeImageFn,
  generateSlotFn,
  tuneImageFn,
} from "@/app/actions/studio";
import { messageForImageJobError } from "@/lib/image-jobs";
import { useStudioImageGate } from "@/hooks/use-studio-image-gate";
import { useStudio } from "@/lib/store";
import {
  SLOTS,
  adoptedRev,
  currentDna,
  type Slot,
  type StyleDna,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export function StudioView() {
  const project = useStudio((s) => s.current());
  const setCurrentStyle = useStudio((s) => s.setCurrentStyle);
  const setSlot = useStudio((s) => s.setSlot);
  const setMode = useStudio((s) => s.setMode);
  const addImageRevs = useStudio((s) => s.addImageRevs);
  const adoptImage = useStudio((s) => s.adoptImage);
  const writebackStyle = useStudio((s) => s.writebackStyle);
  const setStyleRev = useStudio((s) => s.setStyleRev);
  const setCurrentImageModel = useStudio((s) => s.setCurrentImageModel);
  const { state: imageGate, pick, refresh } = useStudioImageGate(project?.id);

  const [content, setContent] = useState("");
  const [tab, setTab] = useState<"image" | "style">("image");
  const [mobile, setMobile] = useState<"canvas" | "style" | "history">("canvas");
  const [confirmWrite, setConfirmWrite] = useState<null | { instruction: string }>(null);
  const [sliders, setSliders] = useState({ brightness: 50, warmth: 50, contrast: 50 });
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  const style = project?.styles.find((s) => s.id === project.currentStyleId) ?? null;
  const dna = style ? currentDna(style) : null;
  const slot: Slot = project?.currentSlot ?? "kv";
  const asset = style?.assets[slot];
  const currentImg = asset ? adoptedRev(asset) : null;
  const generating = project?.mode === "generating";
  const generateBlocked = Boolean(imageGate && !imageGate.actions.generate.enabled);
  const generateReason = imageGate?.actions.generate.reason ?? null;

  const pair = useMemo(() => {
    if (!asset) return [];
    const last = asset.revs.slice(-2);
    if (last.length === 2 && last.every((r) => r.action === "generate")) return last;
    return currentImg ? [currentImg] : last;
  }, [asset, currentImg]);

  if (!project || !style || !dna) return null;

  const product = project.intent?.productName || project.name;

  async function runGenerate() {
    if (!project || !style || !dna) return;
    if (generateBlocked) {
      toast.error(generateReason ?? "出图暂不可用");
      return;
    }
    setMode("generating");
    setBusyLabel("出图中");
    try {
      const ref = slot === "ui_hero" ? project.prototypeDataUrl : style.candidateUrl;
      const res = await generateSlotFn({
        data: { projectId: project.id, dna, slot, product, content, refUrl: ref },
      });
      addImageRevs({
        styleId: style.id,
        slot,
        urls: res.urls,
        action: "generate",
        diff: content.trim() || "首次生成",
        parentId: currentImg?.id ?? null,
        jobId: res.jobId,
      });
      toast.success("已生成 2 张变体，点「采用」选定");
    } catch (e) {
      toast.error(messageForImageJobError(e));
    } finally {
      setMode("idle");
      setBusyLabel(null);
      void refresh();
    }
  }

  async function runTune(instruction: string, writeback: boolean, action: "tune" | "compose") {
    if (!currentImg) {
      toast.error("先出图并采用一张");
      return;
    }
    const availability = imageGate?.actions[action];
    if (availability && !availability.enabled) {
      toast.error(availability.reason ?? "当前模型不支持该操作");
      return;
    }
    if (writeback) {
      setConfirmWrite({ instruction });
      return;
    }
    await applyTune(instruction, false, action);
  }

  async function applyTune(instruction: string, writeback: boolean, action: "tune" | "compose" = "tune") {
    if (!project || !style || !dna || !currentImg) return;
    setBeforeUrl(currentImg.url);
    setMode("generating");
    setBusyLabel(action === "compose" ? "换构图中" : "微调中");
    setConfirmWrite(null);
    try {
      const fn = action === "compose" ? composeImageFn : tuneImageFn;
      const res = await fn({
        data: { projectId: project.id, dna, imageUrl: currentImg.url, instruction, slot },
      });
      const ids = addImageRevs({
        styleId: style.id,
        slot,
        urls: res.urls,
        action,
        diff: instruction.slice(0, 24),
        parentId: currentImg.id,
        writeback: writeback ? "promoted" : "none",
        jobId: res.jobId,
      });
      if (ids[0]) adoptImage(style.id, slot, ids[0]);
      if (writeback) {
        writebackStyle({
          styleId: style.id,
          changeLog: instruction.slice(0, 32),
          dna: { ...dna } satisfies StyleDna,
        });
        toast.success("已写回风格。旧图保留，之后新图会带上这次修改。");
      } else {
        toast.success("只改了这一张，风格 DNA 未动");
      }
    } catch (e) {
      toast.error(messageForImageJobError(e));
    } finally {
      setMode("idle");
      setBusyLabel(null);
      void refresh();
    }
  }

  const standby = project.styles.filter((s) => s.status === "standby");

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <header className="grid h-auto min-h-14 shrink-0 grid-cols-[1fr_auto] items-center gap-2 border-b border-border px-3 py-2 md:grid-cols-[auto_1fr_auto] md:px-4">
        <button onClick={() => useStudio.setState({ currentId: null })}>
          <Wordmark />
        </button>
        <div className="hidden min-w-0 items-center gap-2 overflow-x-auto md:flex">
          <select
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
            value={style.id}
            disabled={generating}
            onChange={(e) => setCurrentStyle(e.target.value)}
          >
            {project.styles
              .filter((s) => s.status !== "archived")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.status === "active" ? " · 当前" : " · 备选"}
                </option>
              ))}
          </select>
          <select
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
            value={style.currentRev}
            disabled={generating}
            onChange={(e) => setStyleRev(style.id, Number(e.target.value))}
          >
            {style.revs.map((r) => (
              <option key={r.rev} value={r.rev}>
                rev{r.rev} · {r.changeLog}
              </option>
            ))}
          </select>
          <ImageModelPicker
            state={imageGate}
            disabled={generating}
            onPick={(modelId) => {
              setCurrentImageModel(modelId);
              void pick(modelId).catch((e) => toast.error(messageForImageJobError(e)));
            }}
          />
          <span className="truncate text-sm text-muted">
            {SLOTS.find((s) => s.id === slot)?.label} · {currentImg ? `v${asset!.revs.findIndex((r) => r.id === currentImg.id) + 1}` : "未出图"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <QuotaMeter quota={imageGate?.quota} className="hidden sm:block" />
          <a
            className={cn(
              "inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm",
              !currentImg && "pointer-events-none opacity-40",
            )}
            href={currentImg?.url}
            target="_blank"
            rel="noreferrer"
          >
            <Download className="size-3.5" />
            下载
          </a>
          <DeleteProjectControl projectId={project.id} compact />
          <JobHistoryLink compact />
          <AuthSlot compact />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[260px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-4 md:flex">
          <StyleCard dna={dna} />
          {standby.length > 0 ? (
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-subtle">备选风格</p>
              <div className="flex gap-2">
                {standby.map((s) => (
                  <button
                    key={s.id}
                    disabled={generating}
                    onClick={() => setCurrentStyle(s.id)}
                    className="overflow-hidden rounded-md border border-border"
                    title={s.name}
                  >
                    {s.candidateUrl ? (
                      <img src={s.candidateUrl} alt={s.name} className="h-14 w-20 object-cover" />
                    ) : (
                      <span className="block h-14 w-20 bg-surface-2" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.16em] text-subtle">物料槽</p>
            <div className="flex flex-col gap-1">
              {SLOTS.map((s) => (
                <button
                  key={s.id}
                  disabled={generating}
                  onClick={() => setSlot(s.id)}
                  className={cn(
                    "rounded-md px-3 py-2 text-left text-sm",
                    slot === s.id ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {s.label}
                  <span className={cn("mt-0.5 block text-xs", slot === s.id ? "text-accent-fg/70" : "text-subtle")}>
                    {s.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex gap-2 border-b border-border px-3 py-2 md:hidden">
            {(["canvas", "style", "history"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setMobile(k)}
                className={cn(
                  "h-9 flex-1 rounded-md text-sm",
                  mobile === k ? "bg-surface-2 text-fg" : "text-muted",
                )}
              >
                {k === "canvas" ? "画布" : k === "style" ? "风格" : "版本"}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 md:hidden">
            <ImageModelPicker
              state={imageGate}
              disabled={generating}
              onPick={(modelId) => {
                setCurrentImageModel(modelId);
                void pick(modelId).catch((e) => toast.error(messageForImageJobError(e)));
              }}
            />
            <QuotaMeter quota={imageGate?.quota} />
          </div>

          <div className={cn("min-h-0 flex-1 overflow-auto p-4", mobile !== "canvas" && "hidden md:block")}>
            {pair.length === 0 && !currentImg ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
                <PanelLeft className="mb-3 size-5 text-subtle" />
                <p className="text-sm text-muted">选物料槽，填一句内容，出两张变体</p>
                {generateReason ? <p className="mt-2 text-xs text-danger">{generateReason}</p> : null}
              </div>
            ) : (
              <div className="grid h-full gap-3 md:grid-cols-2">
                {beforeUrl ? (
                  <figure className="overflow-hidden rounded-lg border border-border bg-surface">
                    <figcaption className="border-b border-border px-3 py-2 text-xs text-subtle">改前</figcaption>
                    <img src={beforeUrl} alt="改前" className="max-h-[62vh] w-full object-contain" />
                  </figure>
                ) : null}
                {pair.map((rev, i) => (
                  <figure key={rev.id} className="overflow-hidden rounded-lg border border-border bg-surface">
                    <figcaption className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-subtle">
                      <span>
                        {rev.diff} · rev{rev.styleRev}
                        {asset?.adoptedId === rev.id ? " · 采用" : ""}
                      </span>
                      {asset?.adoptedId !== rev.id ? (
                        <button className="text-accent" onClick={() => adoptImage(style.id, slot, rev.id)}>
                          采用
                        </button>
                      ) : null}
                    </figcaption>
                    <img src={rev.url} alt={`变体 ${i + 1}`} className="max-h-[62vh] w-full object-contain" />
                  </figure>
                ))}
              </div>
            )}

            <StudioTunePanel
              imageGate={imageGate}
              generating={generating}
              hasImage={Boolean(currentImg)}
              sliders={sliders}
              onSlider={(key, value) => setSliders((s) => ({ ...s, [key]: value }))}
              onTune={(instruction, writeback, action) => void runTune(instruction, writeback, action)}
            />
          </div>

          {mobile === "style" ? (
            <div className="overflow-auto p-4 md:hidden">
              <StyleCard dna={dna} />
            </div>
          ) : null}
        </section>

        <aside
          className={cn(
            "w-full shrink-0 overflow-y-auto border-l border-border md:w-[300px]",
            mobile !== "history" && "hidden md:block",
          )}
        >
          <StudioHistoryPanel
            tab={tab}
            onTab={setTab}
            assetRevs={asset?.revs ?? []}
            adoptedId={asset?.adoptedId}
            style={style}
            onAdopt={(imageId) => adoptImage(style.id, slot, imageId)}
            onStyleRev={(rev) => setStyleRev(style.id, rev)}
          />
        </aside>
      </div>

      <StudioGenerateBar
        slot={slot}
        content={content}
        generating={generating}
        generateBlocked={generateBlocked}
        generateReason={generateReason}
        busyLabel={busyLabel}
        onSlot={setSlot}
        onContent={setContent}
        onGenerate={() => void runGenerate()}
      />

      {confirmWrite ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 md:items-center">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-5">
            <h2 className="font-display text-xl">写回风格？</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              会影响这条风格线以后出的新图。已采用的图不会自动变。确定要把这次修改升为新的风格版本吗？
            </p>
            <div className="mt-5 flex gap-2">
              <Button className="flex-1" onClick={() => void applyTune(confirmWrite.instruction, true)}>
                写回并微调
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setConfirmWrite(null)}>
                取消
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
