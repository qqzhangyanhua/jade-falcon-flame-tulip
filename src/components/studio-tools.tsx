import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RangeSlider } from "@/components/ui/slider";
import type { StudioImageState } from "@/lib/image-jobs";
import { SLOTS, type Slot } from "@/lib/types";
import { cn } from "@/lib/utils";

export const TUNE_PRESETS = [
  {
    id: "like",
    label: "更像风格卡",
    action: "tune" as const,
    instruction: "Push colors, materials, and lighting closer to the locked brand system. Keep composition.",
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
    instruction: "Change composition and camera, keep the same subject, palette, and brand feeling.",
  },
];

export function sliderInstruction(sliders: { brightness: number; warmth: number; contrast: number }): string {
  const bits: string[] = [];
  if (sliders.brightness !== 50) bits.push(sliders.brightness > 50 ? "brighter" : "darker");
  if (sliders.warmth !== 50) bits.push(sliders.warmth > 50 ? "warmer color temperature" : "cooler color temperature");
  if (sliders.contrast !== 50) bits.push(sliders.contrast > 50 ? "higher contrast" : "softer contrast");
  return bits.length ? `Adjust: ${bits.join(", ")}. Keep composition.` : "Subtle polish, keep composition.";
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

export function StudioGenerateBar({
  slot,
  content,
  generating,
  generateBlocked,
  generateReason,
  busyLabel,
  onSlot,
  onContent,
  onGenerate,
}: {
  slot: Slot;
  content: string;
  generating: boolean;
  generateBlocked: boolean;
  generateReason: string | null;
  busyLabel: string | null;
  onSlot: (slot: Slot) => void;
  onContent: (value: string) => void;
  onGenerate: () => void;
}) {
  return (
    <footer className="grid shrink-0 gap-2 border-t border-border bg-surface p-3 md:grid-cols-[1fr_auto]">
      <div className="flex gap-1 overflow-x-auto md:hidden">
        {SLOTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSlot(item.id)}
            className={cn(
              "h-11 shrink-0 rounded-md px-3 text-sm transition-colors duration-150",
              slot === item.id ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div>
        <input
          value={content}
          onChange={(event) => onContent(event.target.value)}
          placeholder="一句内容：产品名 / 卖点 / 活动名"
          disabled={generating || generateBlocked}
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm outline-none placeholder:text-subtle focus:border-accent"
        />
        {generateReason ? <p className="mt-1 text-xs text-danger">{generateReason}</p> : null}
      </div>
      <Button className="h-11 min-w-28" disabled={generating || generateBlocked} onClick={onGenerate}>
        {generating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {busyLabel ?? "生成中"}
          </>
        ) : generateBlocked ? (
          generateReason ?? "出图暂不可用"
        ) : (
          "出 2 张"
        )}
      </Button>
    </footer>
  );
}
