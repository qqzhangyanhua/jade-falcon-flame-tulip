import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { RangeSlider } from "@/components/ui/slider";
import {
  BATCH_CONCURRENCY,
  planBatch,
  type BatchPlan,
  type BatchTaskStatus,
} from "@/lib/batch-generate";
import type { StudioImageState } from "@/lib/image-jobs";
import {
  canSubmitCopyRewrite,
  canSubmitTuneInstruction,
  copyRewriteInstruction,
  mergeTuneInstruction,
  TUNE_INSTRUCTION_MAX_LENGTH,
} from "@/lib/prompts";
import { customSlotIssue, type CustomSlotDraft } from "@/lib/project/ops";
import { SUPPORTED_ASPECTS } from "@/lib/project/slots";
import type { Slot } from "@/lib/types";
import { cn } from "@/lib/utils";

export type StudioSlotChoice = {
  id: string;
  name: string;
  aspect: string;
  purpose: string;
  extraPrompt?: string;
  custom?: boolean;
};

const ASPECT_ITEMS = SUPPORTED_ASPECTS.map((aspect) => ({ value: aspect, label: aspect }));

const GENERATE_COUNTS = [1, 2, 4] as const;

export type GenerateCount = (typeof GENERATE_COUNTS)[number];

const SLOT_PHASE_LABEL: Record<Exclude<BatchTaskStatus, "dropped">, string> = {
  queued: "排队",
  running: "出图中",
  done: "完成",
  failed: "失败",
};

function SlotPhaseLine({
  phase,
  inverted = false,
}: {
  phase: BatchTaskStatus | undefined;
  inverted?: boolean;
}) {
  if (!phase || phase === "dropped") return null;
  return (
    <span
      className={cn(
        "text-xs",
        phase === "failed" ? "text-danger" : inverted ? "text-accent-fg" : "text-muted",
      )}
    >
      {SLOT_PHASE_LABEL[phase]}
    </span>
  );
}

export const TUNE_PRESETS = [
  {
    id: "like",
    label: "更像风格卡",
    action: "tune" as const,
    instruction:
      "Push colors, materials, and lighting closer to the locked brand system. Keep composition.",
  },
  {
    id: "clean",
    label: "更干净",
    action: "tune" as const,
    instruction: "Remove clutter, increase whitespace, simplify backgrounds. Keep the same layout.",
  },
  {
    id: "compose",
    label: "换构图",
    action: "compose" as const,
    instruction:
      "Change composition and camera, keep the same subject, palette, and brand feeling.",
  },
];

const tuneFieldClass =
  "mt-1 w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-base leading-relaxed text-fg outline-none placeholder:text-subtle focus:border-accent";

export function StudioTunePanel({
  imageGate,
  generating,
  hasImage,
  sliders,
  onSlider,
  onTune,
}: {
  imageGate: StudioImageState | null;
  generating: boolean;
  hasImage: boolean;
  sliders: { brightness: number; warmth: number; contrast: number };
  onSlider: (key: "brightness" | "warmth" | "contrast", value: number) => void;
  onTune: (instruction: string, writeback: boolean, action: "tune" | "compose") => void;
}) {
  const [freeText, setFreeText] = useState("");
  const [copyText, setCopyText] = useState("");
  const tuneBlocked = Boolean(imageGate && !imageGate.actions.tune.enabled);
  const instruction = mergeTuneInstruction(freeText, sliders);
  const tuneReady = canSubmitTuneInstruction(instruction);
  const copyReady = canSubmitCopyRewrite(copyText);
  const overLimit = instruction.trim().length > TUNE_INSTRUCTION_MAX_LENGTH;
  const copyOver = copyText.trim().length > TUNE_INSTRUCTION_MAX_LENGTH;
  const fieldsLocked = generating || !hasImage || tuneBlocked;

  return (
    <div className="shrink-0 border-t border-border bg-surface px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {TUNE_PRESETS.map((preset) => {
          const blocked = Boolean(imageGate && !imageGate.actions[preset.action].enabled);
          return (
            <Button
              key={preset.id}
              size="sm"
              variant="outline"
              disabled={generating || !hasImage || blocked}
              title={blocked ? (imageGate?.actions[preset.action].reason ?? undefined) : undefined}
              onClick={() => onTune(preset.instruction, false, preset.action)}
            >
              {preset.label}
            </Button>
          );
        })}
        <div className="mx-1 hidden h-4 w-px bg-border lg:block" />
        {(
          [
            ["brightness", "明暗"],
            ["warmth", "冷暖"],
            ["contrast", "对比"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex min-w-28 flex-1 items-center gap-2 text-xs text-muted">
            <span className="shrink-0">{label}</span>
            <RangeSlider
              className="h-9"
              value={sliders[key]}
              disabled={fieldsLocked}
              onValueChange={(value) => onSlider(key, value)}
            />
          </label>
        ))}
      </div>
      <label className="mt-2 block text-xs text-muted">
        自由文字
        <textarea
          value={freeText}
          disabled={fieldsLocked}
          rows={2}
          placeholder="例如：把背景换成户外"
          className={tuneFieldClass}
          onChange={(event) => setFreeText(event.target.value)}
        />
      </label>
      <p className="mt-1 text-xs text-subtle">局部修改请在这里用文字描述，不能框选。</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="min-h-11"
          disabled={fieldsLocked || !tuneReady}
          onClick={() => onTune(instruction, false, "tune")}
        >
          只改此图
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={fieldsLocked || !tuneReady}
          onClick={() => onTune(instruction, true, "tune")}
        >
          写回风格…
        </Button>
        {imageGate && !imageGate.actions.tune.enabled ? (
          <p className="text-xs text-danger">{imageGate.actions.tune.reason}</p>
        ) : (
          <p className="text-xs text-subtle">默认只改这一张；写回才影响以后的新图。</p>
        )}
        {overLimit ? (
          <p className="text-xs text-danger">指令最多 {TUNE_INSTRUCTION_MAX_LENGTH} 个字</p>
        ) : null}
      </div>
      {hasImage ? (
        <form
          className="mt-2 flex flex-col gap-2 border-t border-border pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (fieldsLocked || !copyReady) return;
            onTune(copyRewriteInstruction(copyText), false, "tune");
          }}
        >
          <label className="block text-xs text-muted">
            换成的标题或文案
            <textarea
              value={copyText}
              disabled={fieldsLocked}
              rows={2}
              placeholder="输入要替换的文字"
              className={tuneFieldClass}
              onChange={(event) => setCopyText(event.target.value)}
            />
          </label>
          <p className="text-xs text-subtle">只是尽量保持版式、画面和色板，不保证完全一致。</p>
          {copyOver ? (
            <p className="text-xs text-danger">文案最多 {TUNE_INSTRUCTION_MAX_LENGTH} 个字</p>
          ) : null}
          <Button
            type="submit"
            size="sm"
            className="min-h-11 self-start"
            disabled={fieldsLocked || !copyReady}
          >
            换文案
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function SlotMenuButton({
  text,
  label,
  disabled,
  onClick,
}: {
  text: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="h-11 shrink-0 self-center rounded-md px-2 text-xs text-muted hover:bg-surface hover:text-fg"
    >
      {text}
    </button>
  );
}

function CustomSlotEditor({
  disabled,
  editing,
  onCreate,
  onEdit,
  onClose,
}: {
  disabled: boolean;
  editing: StudioSlotChoice | null;
  onCreate: (draft: CustomSlotDraft) => void;
  onEdit: (id: string, draft: CustomSlotDraft) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [aspect, setAspect] = useState(editing?.aspect ?? "");
  const [purpose, setPurpose] = useState(editing?.purpose ?? "");
  const [extra, setExtra] = useState(editing?.extraPrompt ?? "");
  const [error, setError] = useState<string | null>(null);
  const fieldClass =
    "mt-1 w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-base leading-relaxed text-fg outline-none placeholder:text-subtle focus:border-accent";

  function submit() {
    const draft = { name, aspect, purpose, extraPrompt: extra };
    const issue = customSlotIssue(draft);
    if (issue) {
      setError(issue);
      return;
    }
    if (editing) onEdit(editing.id, draft);
    else onCreate(draft);
    onClose();
  }

  return (
    <form
      className="mt-2 flex flex-col gap-2 rounded-md bg-surface-2 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-fg">{editing ? "编辑自定义物料槽" : "新建自定义物料槽"}</p>
      <label className="block text-xs text-muted">
        名称
        <Input
          value={name}
          disabled={disabled}
          maxLength={40}
          placeholder="例如：电梯海报"
          className="mt-1"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div>
        <p className="mb-1 text-xs text-muted">比例</p>
        <SelectField
          label="比例"
          value={aspect}
          disabled={disabled}
          placeholder="选择比例"
          items={ASPECT_ITEMS}
          onValueChange={setAspect}
        />
      </div>
      <label className="block text-xs text-muted">
        用途说明
        <textarea
          value={purpose}
          disabled={disabled}
          rows={2}
          maxLength={200}
          placeholder="这个物料槽用来做什么"
          className={fieldClass}
          onChange={(event) => setPurpose(event.target.value)}
        />
      </label>
      <label className="block text-xs text-muted">
        补充提示词（可选）
        <textarea
          value={extra}
          disabled={disabled}
          rows={2}
          maxLength={400}
          placeholder="可选，会写进出图提示词"
          className={fieldClass}
          onChange={(event) => setExtra(event.target.value)}
        />
      </label>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="min-h-11 flex-1" disabled={disabled}>
          {editing ? "保存" : "创建"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11"
          disabled={disabled}
          onClick={onClose}
        >
          取消
        </Button>
      </div>
    </form>
  );
}

export function StudioSlotList({
  slots,
  available,
  current,
  disabled,
  layout,
  slotPhases = {},
  onSelect,
  onEnable,
  onHide,
  onCreate,
  onEdit,
  onDelete,
}: {
  slots: StudioSlotChoice[];
  available: { id: string; name: string }[];
  current: string;
  disabled: boolean;
  layout: "stack" | "row";
  slotPhases?: Record<string, BatchTaskStatus>;
  onSelect: (id: string) => void;
  onEnable: (id: string) => void;
  onHide: (id: string) => void;
  onCreate: (draft: CustomSlotDraft) => void;
  onEdit: (id: string, draft: CustomSlotDraft) => void;
  onDelete: (id: string) => void;
}) {
  const [editor, setEditor] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const canRemove = slots.length > 1;
  const editing = slots.find((slot) => slot.id === editor && slot.custom) ?? null;
  const pendingDelete = slots.find((slot) => slot.id === pendingDeleteId && slot.custom) ?? null;
  const add =
    available.length > 0 ? (
      <SelectField
        key={available.map((slot) => slot.id).join(",")}
        label="添加物料槽"
        className={layout === "row" ? "w-36 shrink-0" : "mt-2"}
        value=""
        disabled={disabled}
        placeholder="添加物料槽"
        items={available.map((slot) => ({ value: slot.id, label: slot.name }))}
        onValueChange={onEnable}
      />
    ) : null;

  function openCreate() {
    setPendingDeleteId(null);
    setEditor("new");
  }

  function openEdit(slot: StudioSlotChoice) {
    setPendingDeleteId(null);
    setEditor(slot.id);
  }

  const extras = (
    <>
      {pendingDelete ? (
        <div className="rounded-md bg-surface-2 px-3 py-2">
          <p className="text-xs leading-relaxed text-muted">
            删除「{pendingDelete.name}」后，这个物料槽不再显示。它们会留在文档里但不再显示。
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="danger"
              className="min-h-11"
              disabled={disabled}
              onClick={() => {
                onDelete(pendingDelete.id);
                setPendingDeleteId(null);
                if (editor === pendingDelete.id) setEditor(null);
              }}
            >
              确认删除
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={disabled}
              onClick={() => setPendingDeleteId(null)}
            >
              取消
            </Button>
          </div>
        </div>
      ) : null}
      {editor ? (
        <CustomSlotEditor
          key={editor}
          disabled={disabled}
          editing={editing}
          onCreate={onCreate}
          onEdit={onEdit}
          onClose={() => setEditor(null)}
        />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={openCreate}
          className="min-h-11 rounded-md px-3 text-left text-sm text-muted hover:bg-surface hover:text-fg"
        >
          新建自定义物料槽
        </button>
      )}
    </>
  );

  function actions(slot: StudioSlotChoice) {
    if (slot.custom) {
      return (
        <>
          <SlotMenuButton
            text="编辑"
            label={`编辑${slot.name}`}
            disabled={disabled}
            onClick={() => openEdit(slot)}
          />
          {canRemove ? (
            <SlotMenuButton
              text="删除"
              label={`删除${slot.name}`}
              disabled={disabled}
              onClick={() => {
                setEditor(null);
                setPendingDeleteId(slot.id);
              }}
            />
          ) : null}
        </>
      );
    }
    if (!canRemove) return null;
    return (
      <SlotMenuButton
        text="隐藏"
        label={`隐藏${slot.name}`}
        disabled={disabled}
        onClick={() => onHide(slot.id)}
      />
    );
  }

  if (layout === "row") {
    return (
      <div className="flex min-w-0 flex-col gap-2 md:hidden">
        <div className="flex min-w-0 items-center gap-1">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {slots.map((slot) => (
              <div key={slot.id} className="flex shrink-0 items-stretch gap-1">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(slot.id)}
                  className={cn(
                    "flex min-h-11 max-w-40 shrink-0 flex-col items-start justify-center rounded-md px-3 py-1.5 text-left",
                    current === slot.id ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
                  )}
                >
                  <span className="w-full truncate text-sm">{slot.name}</span>
                  <span
                    className={cn(
                      "w-full truncate text-xs",
                      current === slot.id ? "text-accent-fg" : "text-subtle",
                    )}
                  >
                    {slot.aspect} · {slot.purpose}
                  </span>
                  {slotPhases[slot.id] ? (
                    <SlotPhaseLine phase={slotPhases[slot.id]} inverted={current === slot.id} />
                  ) : null}
                </button>
                {actions(slot)}
              </div>
            ))}
          </div>
          {add}
        </div>
        {extras}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 section-label">物料槽</p>
      <div className="flex flex-col gap-1">
        {slots.map((slot) => (
          <div key={slot.id} className="flex items-stretch gap-1">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(slot.id)}
              className={cn(
                "min-w-0 flex-1 rounded-md px-3 py-2.5 text-left transition-colors duration-150",
                current === slot.id
                  ? "bg-surface-2 text-fg"
                  : "text-muted hover:bg-surface hover:text-fg",
              )}
            >
              <span className="text-sm">{slot.name}</span>
              <span className="mt-0.5 block text-xs text-subtle">
                {slot.aspect} · {slot.purpose}
              </span>
              {slotPhases[slot.id] ? (
                <span className="mt-0.5 block">
                  <SlotPhaseLine phase={slotPhases[slot.id]} />
                </span>
              ) : null}
            </button>
            {actions(slot)}
          </div>
        ))}
      </div>
      {add}
      {extras}
    </div>
  );
}

export function StudioGenerateBar({
  slots,
  available,
  slot,
  content,
  generating,
  generateBlocked,
  generateReason,
  busyLabel,
  slotPhases = {},
  runningIds,
  remaining,
  onSlot,
  onEnable,
  onHide,
  onCreate,
  onEdit,
  onDelete,
  onContent,
  onGenerate,
  onStartBatch,
}: {
  slots: StudioSlotChoice[];
  available: { id: string; name: string }[];
  slot: Slot;
  content: string;
  generating: boolean;
  generateBlocked: boolean;
  generateReason: string | null;
  busyLabel: string | null;
  slotPhases?: Record<string, BatchTaskStatus>;
  runningIds: readonly string[];
  remaining: number | null;
  onSlot: (slot: Slot) => void;
  onEnable: (slotId: string) => void;
  onHide: (slotId: string) => void;
  onCreate: (draft: CustomSlotDraft) => void;
  onEdit: (slotId: string, draft: CustomSlotDraft) => void;
  onDelete: (slotId: string) => void;
  onContent: (value: string) => void;
  onGenerate: (n: GenerateCount) => void;
  onStartBatch: (n: GenerateCount, slotIds: readonly string[]) => void;
}) {
  const [count, setCount] = useState<GenerateCount>(2);
  const [batchConfirm, setBatchConfirm] = useState<{
    plan: BatchPlan;
    count: GenerateCount;
    remaining: number | null;
  } | null>(null);
  const controlsDisabled = generating || generateBlocked;
  const slotPhase = slotPhases[slot];
  const slotBusy = slotPhase === "queued" || slotPhase === "running";
  const quotaKnown = batchConfirm?.remaining !== null && batchConfirm?.remaining !== undefined;
  const canStart = Boolean(
    batchConfirm &&
    quotaKnown &&
    batchConfirm.plan.quotaEnough &&
    batchConfirm.plan.cost > 0 &&
    !generateBlocked,
  );

  function openBatch() {
    const quotaRemaining = remaining;
    setBatchConfirm({
      plan: planBatch({
        enabled: slots.map((item) => ({ id: item.id, name: item.name })),
        runningIds,
        remaining: quotaRemaining ?? Number.POSITIVE_INFINITY,
      }),
      count,
      remaining: quotaRemaining,
    });
  }

  return (
    <>
      <footer className="grid min-w-0 shrink-0 gap-2 border-t border-border bg-surface p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,auto)]">
        <StudioSlotList
          layout="row"
          slots={slots}
          available={available}
          current={slot}
          disabled={generating}
          slotPhases={slotPhases}
          onSelect={onSlot}
          onEnable={onEnable}
          onHide={onHide}
          onCreate={onCreate}
          onEdit={onEdit}
          onDelete={onDelete}
        />
        <div className="min-w-0">
          <input
            value={content}
            onChange={(event) => onContent(event.target.value)}
            placeholder="一句内容：产品名 / 卖点 / 活动名"
            disabled={generating || generateBlocked}
            className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm outline-none placeholder:text-subtle focus:border-accent"
          />
          {generateReason ? <p className="mt-1 text-xs text-danger">{generateReason}</p> : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
          <div
            role="group"
            aria-label="出图张数"
            className="flex h-11 shrink-0 items-center rounded-md border border-border bg-bg p-0.5"
          >
            {GENERATE_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={count === n}
                disabled={controlsDisabled}
                onClick={() => setCount(n)}
                className={cn(
                  "h-10 min-w-11 rounded-xs px-2 text-sm disabled:opacity-40",
                  count === n ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                )}
              >
                {n} 张
              </button>
            ))}
          </div>
          <Button
            className="h-11 min-w-28 flex-1 md:flex-none"
            disabled={controlsDisabled || slotBusy}
            onClick={() => onGenerate(count)}
          >
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {busyLabel ?? "生成中"}
              </>
            ) : slotPhase === "queued" || slotPhase === "running" ? (
              SLOT_PHASE_LABEL[slotPhase]
            ) : generateBlocked ? (
              (generateReason ?? "出图暂不可用")
            ) : (
              `出 ${count} 张`
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={slots.length === 0}
            onClick={openBatch}
          >
            所有物料槽各出一套
          </Button>
        </div>
      </footer>
      {batchConfirm ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-fg/40 p-4 md:place-items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-generate-title"
            className="w-full max-w-md rounded-xl bg-surface p-6 shadow-border"
          >
            <h2 id="batch-generate-title" className="font-display text-2xl tracking-tight">
              所有物料槽各出一套
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              将开始 {batchConfirm.plan.cost} 个任务，每个任务出 {batchConfirm.count} 张。将扣{" "}
              {batchConfirm.plan.cost} 个额度。
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              同一时间最多运行 {BATCH_CONCURRENCY}{" "}
              个，其余排队。离开页面后，还没开始的任务会丢弃，不扣额度。
            </p>
            {batchConfirm.plan.cost === 0 ? (
              <p className="mt-3 text-sm text-fg">没有可以开始的任务。</p>
            ) : null}
            {batchConfirm.remaining === null ? (
              <p className="mt-3 text-sm text-danger">还没有拿到剩余额度，无法开始。</p>
            ) : null}
            {batchConfirm.remaining !== null && !batchConfirm.plan.quotaEnough ? (
              <p className="mt-3 text-sm text-danger">
                剩余额度 {batchConfirm.remaining}，不够扣 {batchConfirm.plan.cost}{" "}
                个。额度不足，无法开始。
              </p>
            ) : null}
            {quotaKnown && batchConfirm.plan.quotaEnough && generateBlocked ? (
              <p className="mt-3 text-sm text-danger">{generateReason ?? "出图暂不可用"}</p>
            ) : null}
            <div className="mt-4 max-h-64 overflow-y-auto rounded-md bg-bg p-3 shadow-border">
              <p className="section-label">跳过的物料槽</p>
              {batchConfirm.plan.skipped.length === 0 ? (
                <p className="mt-2 text-sm text-muted">没有因正在运行而跳过的物料槽。</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1 text-sm text-fg">
                  {batchConfirm.plan.skipped.map((item) => (
                    <li key={item.id}>{item.name}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-6 flex gap-2">
              {canStart ? (
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => {
                    const chosen = batchConfirm;
                    setBatchConfirm(null);
                    onStartBatch(
                      chosen.count,
                      chosen.plan.start.map((item) => item.id),
                    );
                  }}
                >
                  开始出图
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setBatchConfirm(null)}
              >
                {canStart ? "取消" : "关闭"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
