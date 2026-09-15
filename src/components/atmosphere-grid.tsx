import { PRESETS } from "@/lib/presets";

export function AtmosphereGrid({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="mb-3 text-xs uppercase tracking-kicker text-subtle">四个正交方向</p>
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((preset) => {
          const { dna } = preset;
          return (
            <article
              key={preset.id}
              className="overflow-hidden rounded-lg shadow-border"
              style={{ background: dna.colors.bg, color: dna.colors.text }}
            >
              <div className="px-3 pt-3">
                <h2 className="font-display text-base leading-tight">{dna.name}</h2>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: dna.colors.muted }}>
                  {dna.oneLiner}
                </p>
              </div>
              <div className="m-2 grid grid-cols-3 gap-1 rounded-md p-2" style={{ background: dna.colors.surface }}>
                <div
                  className="col-span-2 h-8 rounded-sm"
                  style={{ background: dna.colors.primary, opacity: 0.88 }}
                />
                <div className="h-8 rounded-sm" style={{ background: dna.colors.accent, opacity: 0.75 }} />
                <div
                  className="col-span-3 h-4 rounded-sm"
                  style={{ background: dna.colors.muted, opacity: 0.22 }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
