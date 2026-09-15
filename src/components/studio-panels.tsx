import type { ImageRev, StyleBranch, StyleDna } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StyleCard({ dna }: { dna: StyleDna }) {
  return (
    <div>
      <h2 className="font-display text-xl leading-tight tracking-tight">{dna.name}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{dna.oneLiner}</p>
      <div className="mt-4 flex overflow-hidden rounded-md">
        {Object.values(dna.colors).map((hex) => (
          <span key={hex} className="h-7 flex-1" style={{ background: hex }} title={hex} />
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-subtle">
        {dna.material} · {dna.light} · {dna.density}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-subtle">不要：{dna.forbidden.join(" / ")}</p>
    </div>
  );
}

export function StudioHistoryPanel({
  tab,
  onTab,
  assetRevs,
  adoptedId,
  style,
  onAdopt,
  onStyleRev,
}: {
  tab: "image" | "style";
  onTab: (tab: "image" | "style") => void;
  assetRevs: ImageRev[];
  adoptedId: string | null | undefined;
  style: StyleBranch;
  onAdopt: (imageId: string) => void;
  onStyleRev: (rev: number) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 border-b border-border">
        {(
          [
            ["image", "图版本"],
            ["style", "风格版本"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "relative h-11 text-sm transition-colors duration-150",
              tab === id ? "text-fg" : "text-muted hover:text-fg",
            )}
            onClick={() => onTab(id)}
          >
            {label}
            {tab === id ? (
              <span className="absolute inset-x-4 bottom-0 h-px bg-accent" />
            ) : null}
          </button>
        ))}
      </div>
      {tab === "image" ? (
        <ul className="p-2">
          {assetRevs
            .slice()
            .reverse()
            .map((rev, idx, arr) => (
              <li key={rev.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full gap-3 rounded-md p-2 text-left transition-colors duration-150 hover:bg-surface-2"
                  onClick={() => onAdopt(rev.id)}
                >
                  <img src={rev.url} alt="" className="frame h-12 w-16 shrink-0 rounded-sm object-cover" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg">
                      v{arr.length - idx} · {rev.diff}
                    </span>
                    <span className="text-xs text-subtle">
                      {rev.action}
                      {adoptedId === rev.id ? " · 采用" : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          {!assetRevs.length ? (
            <p className="px-3 py-8 text-center text-sm text-subtle">这个槽还没有图版本</p>
          ) : null}
        </ul>
      ) : (
        <ul className="p-2">
          {style.revs
            .slice()
            .reverse()
            .map((rev) => (
              <li key={rev.rev}>
                <button
                  type="button"
                  className="min-h-11 w-full rounded-md p-2 text-left transition-colors duration-150 hover:bg-surface-2"
                  onClick={() => onStyleRev(rev.rev)}
                >
                  <span className="block text-sm text-fg">
                    rev{rev.rev} · {rev.changeLog}
                    {style.currentRev === rev.rev ? " · 当前" : ""}
                  </span>
                  <span className="text-xs text-subtle">之后新图跟这个 DNA，旧图不变</span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </>
  );
}
