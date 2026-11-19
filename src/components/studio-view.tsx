"use client";

import { useMemo, useState } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthSlot } from "@/components/auth-slot";
import { getProjectSync } from "@/components/project-sync";
import { DnaChangeList } from "@/components/dna-change-list";
import { DeleteProjectControl } from "@/components/delete-project-control";
import { JobHistoryLink } from "@/components/job-history-link";
import { ImageModelPicker } from "@/components/image-model-picker";
import { QuotaMeter } from "@/components/quota-meter";
import { StudioHistoryPanel, StyleCard } from "@/components/studio-panels";
import { StyleRevCompare } from "@/components/style-rev-compare";
import {
  StudioBrandGuideLink,
  StudioCopyMenu,
  StudioDownloadLink,
  StudioExportButton,
} from "@/components/studio-export";
import { StyleLineActions } from "@/components/style-line-actions";
import { ConsistencyImage } from "@/components/color-consistency-badge";
import {
  StudioGenerateBar,
  StudioSlotList,
  StudioTunePanel,
  TUNE_PRESETS,
  type StudioSlotChoice,
} from "@/components/studio-tools";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select";
import { Wordmark } from "@/components/wordmark";
import { composeImageFn, generateSlotFn, tuneImageFn } from "@/app/actions/studio";
import { mergeStyleInstructionFn } from "@/app/actions/writeback";
import type { DnaChange } from "@/lib/project/dna";
import { paletteForStyleRev } from "@/lib/project/dna-export";
import { messageForMergeError } from "@/lib/style-ai/shared";
import { messageForImageJobError } from "@/lib/image-jobs";
import { useStudioImageGate } from "@/hooks/use-studio-image-gate";
import { BUILTIN_SLOTS } from "@/lib/project/slots";
import { useStudio } from "@/lib/store";
import { adoptedRev, currentDna, type Slot, type StyleDna } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StudioView() {
  const project = useStudio((s) => s.current());
  const setCurrentStyle = useStudio((s) => s.setCurrentStyle);
  const setSlot = useStudio((s) => s.setSlot);
  const enableBuiltinSlot = useStudio((s) => s.enableBuiltinSlot);
  const hideBuiltinSlot = useStudio((s) => s.hideBuiltinSlot);
  const createCustomSlot = useStudio((s) => s.createCustomSlot);
  const editCustomSlot = useStudio((s) => s.editCustomSlot);
  const deleteCustomSlot = useStudio((s) => s.deleteCustomSlot);
  const setMode = useStudio((s) => s.setMode);
  const addImageRevs = useStudio((s) => s.addImageRevs);
  const adoptImage = useStudio((s) => s.adoptImage);
  const writebackStyle = useStudio((s) => s.writebackStyle);
  const rollbackStyle = useStudio((s) => s.rollbackStyle);
  const setStyleRev = useStudio((s) => s.setStyleRev);
  const setCurrentImageModel = useStudio((s) => s.setCurrentImageModel);
  const { state: imageGate, pick, refresh } = useStudioImageGate(project?.id);

  const [content, setContent] = useState("");
  const [tab, setTab] = useState<"image" | "style">("image");
  const [compareOpen, setCompareOpen] = useState(false);
  const [mobile, setMobile] = useState<"canvas" | "style" | "history">("canvas");
  const [confirmWrite, setConfirmWrite] = useState<null | {
    instruction: string;
    dna: StyleDna;
    changes: DnaChange[];
    fromRev: number;
  }>(null);
  const [merging, setMerging] = useState(false);
  const [sliders, setSliders] = useState({ brightness: 50, warmth: 50, contrast: 50 });
  const [beforeFrame, setBeforeFrame] = useState<{
    url: string;
    palette: readonly string[] | null;
  } | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  const style = project?.styles.find((s) => s.id === project.currentStyleId) ?? null;
  const dna = style ? currentDna(style) : null;
  const slot: Slot = project?.currentSlot ?? "kv";
  const asset = style?.assets[slot];
  const currentImg = asset ? adoptedRev(asset) : null;
  const generating = project?.mode === "generating" || merging;
  const generateBlocked = Boolean(imageGate && !imageGate.actions.generate.enabled);
  const generateReason = imageGate?.actions.generate.reason ?? null;
  const likeTune = TUNE_PRESETS.find((preset) => preset.id === "like");
  const tuneBlocked = Boolean(imageGate && !imageGate.actions.tune.enabled);

  const pair = useMemo(() => {
    if (!asset) return [];
    const last = asset.revs.slice(-2);
    if (last.length === 2 && last.every((r) => r.action === "generate")) return last;
    return currentImg ? [currentImg] : last;
  }, [asset, currentImg]);

  if (!project || !style || !dna) return null;

  const product = project.intent?.productName || project.name;
  const customSlots = project.customSlots ?? [];
  const enabledSlots: StudioSlotChoice[] = project.enabledSlotIds.flatMap((id) => {
    const builtin = BUILTIN_SLOTS.find((item) => item.id === id);
    if (builtin) {
      return [
        {
          id: builtin.id,
          name: builtin.name,
          aspect: builtin.aspect,
          purpose: builtin.purpose,
        },
      ];
    }
    const custom = customSlots.find((item) => item.id === id);
    if (!custom) return [];
    return [
      {
        id: custom.id,
        name: custom.name,
        aspect: custom.aspect,
        purpose: custom.purpose,
        extraPrompt: custom.extraPrompt,
        custom: true,
      },
    ];
  });
  const availableSlots = BUILTIN_SLOTS.filter(
    (item) => !project.enabledSlotIds.includes(item.id),
  ).map((item) => ({ id: item.id, name: item.name }));

  async function flushDocument() {
    if (!project) return;
    await getProjectSync()?.flush(project.id);
  }

  async function runGenerate() {
    if (!project || !style || !dna) return;
    if (generateBlocked) {
      toast.error(generateReason ?? "出图暂不可用");
      return;
    }
    setMode("generating");
    await flushDocument();
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
      await previewWriteback(instruction);
      return;
    }
    await applyTune(instruction, false, action);
  }

  async function previewWriteback(instruction: string) {
    if (!style || !dna) return;
    setMerging(true);
    setBusyLabel("合并风格中");
    try {
      const merged = await mergeStyleInstructionFn({ data: { dna, instruction } });
      if (!merged.ok) {
        toast.error(messageForMergeError(merged.error));
        return;
      }
      setConfirmWrite({
        instruction,
        dna: merged.dna,
        changes: merged.changes,
        fromRev: style.currentRev,
      });
    } catch {
      toast.error(messageForMergeError("network"));
    } finally {
      setMerging(false);
      setBusyLabel(null);
    }
  }

  async function confirmWriteback() {
    if (!confirmWrite || !style) return;
    const { instruction, dna: nextDna, changes } = confirmWrite;
    setConfirmWrite(null);
    writebackStyle({
      styleId: style.id,
      changeLog: instruction.slice(0, 32),
      dna: nextDna,
      changes,
    });
    await applyTune(instruction, true, "tune", nextDna);
  }

  async function applyTune(
    instruction: string,
    writeback: boolean,
    action: "tune" | "compose" = "tune",
    tuneDna: StyleDna | null = dna,
  ) {
    if (!project || !style || !tuneDna || !currentImg) return;
    setBeforeFrame({
      url: currentImg.url,
      palette: paletteForStyleRev(style.revs, currentImg.styleRev),
    });
    setMode("generating");
    await flushDocument();
    setBusyLabel(action === "compose" ? "换构图中" : "微调中");
    try {
      const fn = action === "compose" ? composeImageFn : tuneImageFn;
      const res = await fn({
        data: { projectId: project.id, dna: tuneDna, imageUrl: currentImg.url, instruction, slot },
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
      toast.success(
        writeback
          ? "已写回风格。旧图保留，之后新图会带上这次修改。"
          : "只改了这一张，风格 DNA 未动",
      );
    } catch (e) {
      const reason = messageForImageJobError(e);
      toast.error(
        writeback
          ? reason === "出图失败"
            ? "风格已写回，出图失败，可重试"
            : `风格已写回，出图失败，可重试（${reason}）`
          : reason,
      );
    } finally {
      setMode("idle");
      setBusyLabel(null);
      void refresh();
    }
  }

  const standby = project.styles.filter((s) => s.status === "standby");
  const liveStyles = project.styles.filter((s) => s.status !== "archived");

  return (
    <div className="flex h-dvh min-w-0 flex-col overflow-x-hidden bg-bg text-fg">
      <header className="grid min-h-16 shrink-0 grid-cols-[auto_1fr] items-center gap-3 border-b border-border px-3 py-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:px-4">
        <button
          type="button"
          className="min-h-11 text-left"
          onClick={() => useStudio.setState({ currentId: null })}
        >
          <Wordmark />
        </button>
        <div className="hidden min-w-0 items-center gap-2 overflow-x-auto md:flex">
          <p className="shrink-0 truncate font-display text-lg tracking-tight">{product}</p>
          <SelectField
            label="风格线"
            className="w-44 shrink-0"
            value={style.id}
            disabled={generating}
            items={liveStyles.map((s) => ({
              value: s.id,
              label: `${s.name}${s.status === "active" ? " · 当前" : " · 备选"}`,
            }))}
            onValueChange={setCurrentStyle}
          />
          <SelectField
            label="风格版本"
            className="w-40 shrink-0"
            value={String(style.currentRev)}
            disabled={generating}
            items={style.revs.map((r) => ({
              value: String(r.rev),
              label: `rev${r.rev} · ${r.changeLog}`,
            }))}
            onValueChange={(value) => setStyleRev(style.id, Number(value))}
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => setCompareOpen(true)}
          >
            对比版本
          </Button>
          <ImageModelPicker
            className="w-44 shrink-0"
            state={imageGate}
            disabled={generating}
            onPick={(modelId) => {
              setCurrentImageModel(modelId);
              void pick(modelId).catch((e) => toast.error(messageForImageJobError(e)));
            }}
          />
        </div>
        <div className="flex items-center justify-end gap-1">
          <QuotaMeter quota={imageGate?.quota} className="hidden sm:inline-flex" />
          <StudioDownloadLink url={currentImg?.url} slot={slot} />
          <StudioCopyMenu
            dna={dna}
            product={product}
            enabledSlotIds={project.enabledSlotIds}
            customSlots={customSlots}
          />
          <StudioBrandGuideLink projectId={project.id} styleId={style.id} rev={style.currentRev} />
          <StudioExportButton
            projectName={project.name}
            product={product}
            enabledSlotIds={project.enabledSlotIds}
            customSlots={customSlots}
            styleLine={style}
          />
          <DeleteProjectControl projectId={project.id} compact />
          <JobHistoryLink compact />
          <AuthSlot compact />
        </div>
      </header>

      <div className="flex gap-1 border-b border-border p-2 md:hidden">
        {(["canvas", "style", "history"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setMobile(k)}
            className={cn(
              "h-11 flex-1 rounded-md text-sm transition-colors duration-150",
              mobile === k ? "bg-surface-2 text-fg" : "text-muted",
            )}
          >
            {k === "canvas" ? "画布" : k === "style" ? "风格" : "版本"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col gap-8 overflow-y-auto border-r border-border p-5 md:flex">
          <StyleCard dna={dna} lineName={style?.name} />
          {standby.length > 0 ? (
            <div>
              <p className="mb-3 section-label">备选风格</p>
              <div className="flex gap-2">
                {standby.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={generating}
                    onClick={() => setCurrentStyle(s.id)}
                    className="overflow-hidden rounded-md shadow-border"
                    title={s.name}
                  >
                    {s.candidateUrl ? (
                      <img
                        src={s.candidateUrl}
                        alt={s.name}
                        className="frame h-14 w-20 object-cover"
                      />
                    ) : (
                      <span className="block h-14 w-20 bg-surface-2" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <StyleLineActions styles={project.styles} style={style} disabled={generating} />
          <StudioSlotList
            layout="stack"
            slots={enabledSlots}
            available={availableSlots}
            current={slot}
            disabled={generating}
            onSelect={setSlot}
            onEnable={enableBuiltinSlot}
            onHide={hideBuiltinSlot}
            onCreate={createCustomSlot}
            onEdit={editCustomSlot}
            onDelete={deleteCustomSlot}
          />
        </aside>

        <section
          className={cn("flex min-w-0 flex-1 flex-col", mobile === "history" && "hidden md:flex")}
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
            <p className="min-w-0 flex-1 truncate text-sm text-fg">{product}</p>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() => setCompareOpen(true)}
            >
              对比版本
            </Button>
            <ImageModelPicker
              className="w-32 shrink-0"
              state={imageGate}
              disabled={generating}
              onPick={(modelId) => {
                setCurrentImageModel(modelId);
                void pick(modelId).catch((e) => toast.error(messageForImageJobError(e)));
              }}
            />
          </div>

          <div
            className={cn(
              "relative min-h-0 flex-1 overflow-auto p-4",
              mobile !== "canvas" && "hidden md:block",
            )}
          >
            {pair.length === 0 && !currentImg ? (
              <div className="flex h-full min-h-72 flex-col items-center justify-center rounded-lg bg-surface text-center shadow-border">
                <ImageIcon className="mb-4 size-6 text-subtle" />
                <p className="font-display text-xl tracking-tight">还没有图</p>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
                  选物料槽，填一句内容，出两张变体。
                </p>
                {generateReason ? (
                  <p className="mt-3 text-xs text-danger">{generateReason}</p>
                ) : null}
              </div>
            ) : (
              <div
                className={cn(
                  "grid gap-3 md:h-full",
                  (beforeFrame || pair.length > 1) && "md:grid-cols-2",
                )}
              >
                {beforeFrame ? (
                  <figure className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-surface shadow-border">
                    <figcaption className="border-b border-border px-3 py-2 text-xs text-subtle">
                      改前
                    </figcaption>
                    <ConsistencyImage
                      url={beforeFrame.url}
                      alt="改前"
                      palette={beforeFrame.palette}
                      disabled={generating || tuneBlocked}
                      disabledReason={imageGate?.actions.tune.reason ?? null}
                      onLikeStyle={() => {
                        if (!likeTune) return;
                        void runTune(likeTune.instruction, false, likeTune.action);
                      }}
                    />
                  </figure>
                ) : null}
                {pair.map((rev, i) => {
                  return (
                    <figure
                      key={rev.id}
                      className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-surface shadow-border"
                    >
                      <figcaption className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-subtle">
                        <span className="truncate">
                          {rev.diff} · rev{rev.styleRev}
                          {asset?.adoptedId === rev.id ? " · 采用" : ""}
                        </span>
                        {asset?.adoptedId !== rev.id ? (
                          <button
                            type="button"
                            className="h-8 shrink-0 rounded-md px-2 text-sm text-fg hover:bg-surface-2"
                            onClick={() => adoptImage(style.id, slot, rev.id)}
                          >
                            采用
                          </button>
                        ) : null}
                      </figcaption>
                      <ConsistencyImage
                        url={rev.url}
                        alt={`变体 ${i + 1}`}
                        palette={paletteForStyleRev(style.revs, rev.styleRev)}
                        disabled={generating || tuneBlocked}
                        disabledReason={imageGate?.actions.tune.reason ?? null}
                        onLikeStyle={() => {
                          if (!likeTune) return;
                          void runTune(likeTune.instruction, false, likeTune.action);
                        }}
                      />
                    </figure>
                  );
                })}
              </div>
            )}
            {generating ? (
              <div className="absolute inset-4 grid place-items-center rounded-lg bg-bg/60">
                <div className="flex items-center gap-2 text-sm text-fg">
                  <Loader2 className="size-4 animate-spin" />
                  {busyLabel ?? "生成中"}
                </div>
              </div>
            ) : null}
          </div>

          {currentImg ? (
            <div className={cn(mobile !== "canvas" && "hidden md:block")}>
              <StudioTunePanel
                imageGate={imageGate}
                generating={generating}
                hasImage={Boolean(currentImg)}
                sliders={sliders}
                onSlider={(key, value) => setSliders((s) => ({ ...s, [key]: value }))}
                onTune={(instruction, writeback, action) =>
                  void runTune(instruction, writeback, action)
                }
              />
            </div>
          ) : null}

          {mobile === "style" ? (
            <div className="flex flex-col gap-8 overflow-auto p-5 md:hidden">
              <StyleCard dna={dna} lineName={style?.name} />
              <StyleLineActions styles={project.styles} style={style} disabled={generating} />
            </div>
          ) : null}

          <div className={cn("min-w-0", mobile !== "canvas" && "hidden md:block")}>
            <StudioGenerateBar
              slots={enabledSlots}
              available={availableSlots}
              slot={slot}
              content={content}
              generating={generating}
              generateBlocked={generateBlocked}
              generateReason={generateReason}
              busyLabel={busyLabel}
              onSlot={setSlot}
              onEnable={enableBuiltinSlot}
              onHide={hideBuiltinSlot}
              onCreate={createCustomSlot}
              onEdit={editCustomSlot}
              onDelete={deleteCustomSlot}
              onContent={setContent}
              onGenerate={() => void runGenerate()}
            />
          </div>
        </section>

        <aside
          className={cn(
            "w-full overflow-y-auto border-l border-border md:w-72 md:shrink-0",
            mobile !== "history" ? "hidden md:block" : "min-h-0 flex-1",
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
            onRollback={(rev) => rollbackStyle(style.id, rev)}
          />
        </aside>
      </div>

      {compareOpen ? (
        <StyleRevCompare
          key={style.id}
          style={style}
          slots={enabledSlots.map((item) => ({ id: item.id, name: item.name }))}
          onClose={() => setCompareOpen(false)}
        />
      ) : null}

      {confirmWrite ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-fg/40 p-4 md:place-items-center">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl bg-surface p-6 shadow-border"
          >
            <h2 className="font-display text-2xl tracking-tight">写回风格？</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              会基于 rev{confirmWrite.fromRev}{" "}
              生成新的风格版本，影响这条风格线以后出的新图。已采用的图不会自动变。
            </p>
            <div className="mt-4 max-h-64 overflow-y-auto rounded-md bg-bg p-3 shadow-border">
              <p className="mb-2 section-label">将改动 {confirmWrite.changes.length} 个字段</p>
              <DnaChangeList changes={confirmWrite.changes} />
            </div>
            <div className="mt-6 flex gap-2">
              <Button className="flex-1" onClick={() => void confirmWriteback()}>
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
