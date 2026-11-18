import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select";
import { RangeSlider } from "@/components/ui/slider";
import type { StudioImageState } from "@/lib/image-jobs";
import type { Slot } from "@/lib/types";
import { cn } from "@/lib/utils";

export type StudioSlotChoice = {
  id: string;
  name: string;
  aspect: string;
  purpose: string;
};

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

export function StudioSlotList({
  slots,
  available,
  current,
  disabled,
  layout,
  onSelect,
  onEnable,
  onHide,
}: {
  slots: StudioSlotChoice[];
  available: { id: string; name: string }[];
  current: string;
  disabled: boolean;
  layout: "stack" | "row";
  onSelect: (id: string) => void;
  onEnable: (id: string) => void;
  onHide: (id: string) => void;
}) {
  const canHide = slots.length > 1;
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

  if (layout === "row") {
    return (
      <div className="flex min-w-0 items-center gap-1 md:hidden">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {slots.map((slot) => (
            <div key={slot.id} className="flex shrink-0 items-stretch gap-1">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(slot.id)}
                className={cn(
                  "flex min-h-11 shrink-0 flex-col items-start justify-center rounded-md px-3 py-1.5 text-left",
                  current === slot.id ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
                )}
              >
                <span className="whitespace-nowrap text-sm">{slot.name}</span>
                <span
                  className={cn(
                    "whitespace-nowrap text-xs",
                    current === slot.id ? "text-accent-fg" : "text-subtle",
                  )}
                >
                  {slot.aspect} · {slot.purpose}
                </span>
              </button>
              {canHide ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onHide(slot.id)}
                  aria-label={`隐藏${slot.name}`}
                  className="h-11 shrink-0 rounded-md px-3 text-xs text-muted"
                >
                  隐藏
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {add}
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
            {canHide ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onHide(slot.id)}
                aria-label={`隐藏${slot.name}`}
                className="h-11 shrink-0 self-center rounded-md px-2 text-xs text-muted hover:bg-surface hover:text-fg"
              >
                隐藏
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {add}
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
  onContent: (value: string) => void;
  onGenerate: () => void;
}) {
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
      <Button
        className="h-11 min-w-28"
        disabled={generating || generateBlocked}
        onClick={onGenerate}
      >
        {generating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {busyLabel ?? "生成中"}
          </>
        ) : generateBlocked ? (
          (generateReason ?? "出图暂不可用")
        ) : (
          "出 2 张"
        )}
      </Button>
    </footer>
  );
}
