import type { ImageRev, StyleBranch, StyleDna } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StyleCard({ dna }: { dna: StyleDna }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <h2 className="font-display text-lg">{dna.name}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">{dna.oneLiner}</p>
      <div className="mt-3 flex gap-1">
        {Object.values(dna.colors).map((hex) => (
          <span key={hex} className="h-6 flex-1 rounded-sm" style={{ background: hex }} title={hex} />
        ))}
      </div>
      <p className="mt-3 text-xs text-subtle">不要：{dna.forbidden.join(" / ")}</p>
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
      <div className="flex border-b border-border">
        <button className={cn("flex-1 py-3 text-sm", tab === "image" ? "text-fg" : "text-muted")} onClick={() => onTab("image")}>
          图版本
        </button>
        <button className={cn("flex-1 py-3 text-sm", tab === "style" ? "text-fg" : "text-muted")} onClick={() => onTab("style")}>
          风格版本
        </button>
      </div>
      {tab === "image" ? (
        <ul className="p-3">
          {assetRevs
            .slice()
            .reverse()
            .map((rev, idx, arr) => (
              <li key={rev.id}>
                <button className="flex w-full gap-3 rounded-md p-2 text-left hover:bg-surface-2" onClick={() => onAdopt(rev.id)}>
                  <img src={rev.url} alt="" className="h-12 w-16 rounded-sm object-cover" />
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
          {!assetRevs.length ? <p className="p-3 text-sm text-subtle">这个槽还没有图版本</p> : null}
        </ul>
      ) : (
        <ul className="p-3">
          {style.revs
            .slice()
            .reverse()
            .map((rev) => (
              <li key={rev.rev}>
                <button className="w-full rounded-md p-2 text-left hover:bg-surface-2" onClick={() => onStyleRev(rev.rev)}>
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
