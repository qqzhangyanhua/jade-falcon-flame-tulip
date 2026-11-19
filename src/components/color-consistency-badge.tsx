"use client";

import { useEffect, useRef, useState } from "react";
import { HiddenImagePlaceholder, useImageHidden } from "@/components/owned-image";
import { Button } from "@/components/ui/button";
import { consistencyScore, type RgbPixel } from "@/lib/project/dna-export";
import { cn } from "@/lib/utils";

const SAMPLE_EDGE = 64;
const LOW_SCORE = 60;

type ImageBox = { left: number; top: number; width: number; height: number };

function samplePixels(image: HTMLImageElement): RgbPixel[] {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width < 1 || height < 1) return [];
  const scale = Math.min(1, SAMPLE_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(image, 0, 0, w, h);
  const data = context.getImageData(0, 0, w, h).data;
  const pixels: RgbPixel[] = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push({ r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 });
  }
  return pixels;
}

function useConsistencyScore(url: string, paletteKey: string): number | null {
  const hidden = useImageHidden(url);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    if (hidden) {
      setScore(null);
      return;
    }
    let cancelled = false;
    setScore(null);
    const palette = paletteKey ? paletteKey.split("\n") : [];
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      try {
        const pixels = samplePixels(image);
        if (cancelled || pixels.length === 0) {
          if (!cancelled) setScore(null);
          return;
        }
        setScore(consistencyScore(pixels, palette));
      } catch {
        if (!cancelled) setScore(null);
      }
    };
    image.onerror = () => {
      if (!cancelled) setScore(null);
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, paletteKey, hidden]);

  return score;
}

/** Visible overlap of the bitmap and the positioning stage, in stage coordinates. */
function visibleImageBox(img: HTMLImageElement, stage: HTMLElement): ImageBox | null {
  const stageRect = stage.getBoundingClientRect();
  const originLeft = stageRect.left + stage.clientLeft;
  const originTop = stageRect.top + stage.clientTop;
  const originRight = originLeft + stage.clientWidth;
  const originBottom = originTop + stage.clientHeight;
  const rect = img.getBoundingClientRect();
  const left = Math.max(rect.left, originLeft);
  const top = Math.max(rect.top, originTop);
  const right = Math.min(rect.right, originRight);
  const bottom = Math.min(rect.bottom, originBottom);
  const width = right - left;
  const height = bottom - top;
  if (width < 8 || height < 8) return null;
  return { left: left - originLeft, top: top - originTop, width, height };
}

function useVisibleImageBox(url: string) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState<ImageBox | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    const stage = stageRef.current;
    if (!img || !stage) return;
    const measure = () => {
      const next = visibleImageBox(img, stage);
      setBox((prev) => {
        if (!next && !prev) return prev;
        if (
          next &&
          prev &&
          next.left === prev.left &&
          next.top === prev.top &&
          next.width === prev.width &&
          next.height === prev.height
        ) {
          return prev;
        }
        return next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(img);
    observer.observe(stage);
    img.addEventListener("load", measure);
    return () => {
      observer.disconnect();
      img.removeEventListener("load", measure);
    };
  }, [url]);

  return { stageRef, imgRef, box };
}

function ScoreChip({
  url,
  palette,
  onLikeStyle,
  disabled,
  disabledReason,
  offerTune,
  className,
}: {
  url: string;
  palette: readonly string[];
  onLikeStyle: () => void;
  disabled: boolean;
  disabledReason: string | null;
  offerTune: boolean;
  className?: string;
}) {
  const score = useConsistencyScore(url, palette.join("\n"));
  if (score === null) return null;

  return (
    <div className={cn("flex max-w-full flex-col items-start gap-1", className)}>
      <span
        className="rounded-sm border border-border bg-surface px-2 py-1 text-xs text-fg"
        title="只衡量颜色，不代表整体质量"
      >
        色彩一致性 {score}
      </span>
      {offerTune && score < LOW_SCORE ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-auto min-h-9 max-w-full whitespace-normal bg-surface py-1 text-left"
          disabled={disabled}
          title={disabled ? (disabledReason ?? undefined) : undefined}
          onClick={onLikeStyle}
        >
          可以试试更像风格卡
        </Button>
      ) : null}
    </div>
  );
}

/** Score chip only. The score stays in memory; a failed pixel read renders nothing. */
export function ConsistencyBadge({
  url,
  palette,
  onLikeStyle,
  disabled = false,
  disabledReason = null,
  offerTune = true,
  className,
}: {
  url: string;
  palette: readonly string[] | null;
  onLikeStyle?: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
  offerTune?: boolean;
  className?: string;
}) {
  if (!palette || palette.length === 0) return null;
  return (
    <ScoreChip
      className={className}
      url={url}
      palette={palette}
      onLikeStyle={onLikeStyle ?? (() => {})}
      disabled={disabled}
      disabledReason={disabledReason}
      offerTune={offerTune && Boolean(onLikeStyle)}
    />
  );
}

export function ConsistencyImage(props: {
  url: string;
  alt: string;
  palette: readonly string[] | null;
  onLikeStyle: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  const hidden = useImageHidden(props.url);
  if (hidden) return <HiddenImagePlaceholder className="h-full min-h-48 w-full" />;
  return <ConsistencyImageFrame {...props} />;
}

function ConsistencyImageFrame({
  url,
  alt,
  palette,
  onLikeStyle,
  disabled = false,
  disabledReason = null,
}: {
  url: string;
  alt: string;
  palette: readonly string[] | null;
  onLikeStyle: () => void;
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  const { stageRef, imgRef, box } = useVisibleImageBox(url);

  return (
    <div ref={stageRef} className="relative min-h-0 flex-1">
      <div className="grid h-full min-h-0 place-items-center p-3">
        <img
          ref={imgRef}
          src={url}
          alt={alt}
          className="frame max-h-full max-w-full object-contain"
        />
      </div>
      {palette && box ? (
        <div className="pointer-events-none absolute" style={box}>
          <ConsistencyBadge
            className="pointer-events-auto absolute inset-x-2 bottom-2"
            url={url}
            palette={palette}
            onLikeStyle={onLikeStyle}
            disabled={disabled}
            disabledReason={disabledReason}
          />
        </div>
      ) : null}
    </div>
  );
}
