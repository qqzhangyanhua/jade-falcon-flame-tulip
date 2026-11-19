import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { RangeSlider } from "@/components/ui/slider";
import type { StudioImageState } from "@/lib/image-jobs";
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

export function sliderInstruction(sliders: {
  brightness: number;
  warmth: number;
  contrast: number;
}): string {
  const bits: string[] = [];
  if (sliders.brightness !== 50) bits.push(sliders.brightness > 50 ? "brighter" : "darker");
  if (sliders.warmth !== 50)
    bits.push(sliders.warmth > 50 ? "warmer color temperature" : "cooler color temperature");
  if (sliders.contrast !== 50)
    bits.push(sliders.contrast > 50 ? "higher contrast" : "softer contrast");
  return bits.length
    ? `Adjust: ${bits.join(", ")}. Keep composition.`
    : "Subtle polish, keep composition.";
}

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
  const tuneBlocked = Boolean(imageGate && !imageGate.actions.tune.enabled);
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
              disabled={generating || !hasImage || tuneBlocked}
              onValueChange={(value) => onSlider(key, value)}
            />
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={generating || !hasImage || tuneBlocked}
          onClick={() => onTune(sliderInstruction(sliders), false, "tune")}
        >
          只改此图
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={generating || !hasImage || tuneBlocked}
          onClick={() => onTune(sliderInstruction(sliders), true, "tune")}
        >
          写回风格…
        </Button>
        {imageGate && !imageGate.actions.tune.enabled ? (
          <p className="text-xs text-danger">{imageGate.actions.tune.reason}</p>
        ) : (
          <p className="text-xs text-subtle">默认只改这一张；写回才影响以后的新图。</p>
        )}
      </div>
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
  onSlot,
  onEnable,
  onHide,
  onCreate,
  onEdit,
  onDelete,
  onContent,
  onGenerate,
}: {
  slots: StudioSlotChoice[];
  available: { id: string; name: string }[];
  slot: Slot;
  content: string;
  generating: boolean;
  generateBlocked: boolean;
  generateReason: string | null;
  busyLabel: string | null;
  onSlot: (slot: Slot) => void;
  onEnable: (slotId: string) => void;
  onHide: (slotId: string) => void;
  onCreate: (draft: CustomSlotDraft) => void;
  onEdit: (slotId: string, draft: CustomSlotDraft) => void;
  onDelete: (slotId: string) => void;
  onContent: (value: string) => void;
  onGenerate: (n: GenerateCount) => void;
}) {
  const [count, setCount] = useState<GenerateCount>(2);
  const controlsDisabled = generating || generateBlocked;
  return (
    <footer className="grid min-w-0 shrink-0 gap-2 border-t border-border bg-surface p-3 md:grid-cols-[minmax(0,1fr)_auto]">
      <StudioSlotList
        layout="row"
        slots={slots}
        available={available}
        current={slot}
        disabled={generating}
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
      <div className="flex min-w-0 items-center gap-2">
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
          className="h-11 min-w-28 flex-1"
          disabled={controlsDisabled}
          onClick={() => onGenerate(count)}
        >
          {generating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {busyLabel ?? "生成中"}
            </>
          ) : generateBlocked ? (
            (generateReason ?? "出图暂不可用")
          ) : (
            `出 ${count} 张`
          )}
        </Button>
      </div>
    </footer>
  );
}
