import type { DnaChange } from "@/lib/project/dna";
import { cn } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  name: "名称",
  oneLiner: "一句话",
  "colors.bg": "背景色",
  "colors.surface": "表面色",
  "colors.text": "文字色",
  "colors.muted": "次要文字色",
  "colors.primary": "主色",
  "colors.accent": "强调色",
  light: "光线",
  material: "材质",
  geometry: "几何",
  density: "密度",
  typeMood: "字体气质",
  mood: "情绪",
  forbidden: "禁用风格",
  promptPositive: "正向提示词",
  promptNegative: "反向提示词",
};

export function dnaFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function Swatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block size-4 shrink-0 rounded-sm shadow-border"
      style={{ background: hex }}
      aria-hidden="true"
    />
  );
}

function Value({ field, value, muted }: { field: string; value: string; muted?: boolean }) {
  const isColor = field.startsWith("colors.");
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", muted && "text-subtle")}>
      {isColor ? <Swatch hex={value} /> : null}
      <span className={cn("break-words", isColor && "font-mono text-xs")}>{value || "（空）"}</span>
    </span>
  );
}

export function DnaChangeList({
  changes,
  className,
}: {
  changes: DnaChange[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {changes.map((change) => (
        <li key={change.field} className="text-xs leading-relaxed" data-testid="dna-change">
          <span className="block text-subtle">{dnaFieldLabel(change.field)}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-fg">
            <Value field={change.field} value={change.from} muted />
            <span className="text-subtle" aria-label="改为">
              →
            </span>
            <Value field={change.field} value={change.to} />
          </span>
        </li>
      ))}
    </ul>
  );
}
