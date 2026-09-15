"use client";

import * as Slider from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export function RangeSlider({
  value,
  onValueChange,
  disabled,
  className,
}: {
  value: number;
  onValueChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Slider.Root
      value={[value]}
      min={0}
      max={100}
      disabled={disabled}
      onValueChange={(next) => onValueChange(next[0] ?? 50)}
      className={cn("relative flex h-11 w-full touch-none items-center", className)}
    >
      <Slider.Track className="relative h-1 w-full rounded-full bg-surface-2">
        <Slider.Range className="absolute h-full rounded-full bg-accent" />
      </Slider.Track>
      <Slider.Thumb
        className="relative block size-4 rounded-full bg-accent outline-none after:absolute after:left-1/2 after:top-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 focus-visible:shadow-border-hover disabled:opacity-40"
        aria-label="调整"
      />
    </Slider.Root>
  );
}
