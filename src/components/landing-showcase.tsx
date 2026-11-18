"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { CASES, SLOTS, order, shot, type CaseItem } from "@/components/landing-data";
import { cn } from "@/lib/utils";

const CELLS = {
  key: { className: "aspect-4/5", sizes: "(min-width: 1024px) 34vw, 60vw", index: 0 },
  product: { className: "aspect-square", sizes: "(min-width: 1024px) 22vw, 40vw", index: 1 },
  hero: { className: "min-h-0 flex-1", sizes: "(min-width: 1024px) 22vw, 40vw", index: 2 },
} as const;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Cycles the hero through the example brands; the progress bar's animationend drives the timer. */
export function HeroShowcase() {
  const [active, setActive] = useState(0);
  // Server and hydration render as reduced motion so autoplay only starts on the client.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
  const current = CASES[active];

  return (
    <div className="showcase relative lg:col-span-7">
      <div className="grid grid-cols-5 gap-3">
        <ShowcaseCell slot="key" active={active} className="col-span-3" />
        <div className="col-span-2 flex flex-col gap-3">
          <ShowcaseCell slot="product" active={active} />
          <ShowcaseCell slot="hero" active={active} />
        </div>
      </div>
      <DnaCard item={current} className="mt-3 sm:absolute sm:-left-6 sm:top-10 sm:mt-0 sm:w-72" />

      <div className="mt-5 grid grid-cols-3 gap-4" role="group" aria-label="切换示例品牌">
        {CASES.map((c, i) => {
          const isActive = i === active;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActive(i)}
              className="group min-h-11 text-left"
            >
              <span className="block h-0.5 overflow-hidden bg-border">
                <span
                  key={`${c.id}-${active}`}
                  className={cn(
                    "block h-full origin-left bg-fg",
                    isActive ? (reducedMotion ? "" : "showcase-progress") : "scale-x-0",
                  )}
                  onAnimationEnd={
                    isActive ? () => setActive((n) => (n + 1) % CASES.length) : undefined
                  }
                />
              </span>
              <span className="mt-2 flex items-baseline gap-2 text-xs">
                <span className="text-seal">{`0${i + 1}`}</span>
                <span
                  className={cn(
                    "transition-colors duration-150",
                    isActive ? "text-fg" : "text-subtle group-hover:text-fg",
                  )}
                >
                  {c.name}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ShowcaseCell({
  slot,
  active,
  className,
}: {
  slot: keyof typeof CELLS;
  active: number;
  className?: string;
}) {
  const cell = CELLS[slot];
  const label = SLOTS.find((s) => s.id === slot)?.label ?? "";
  return (
    <div
      className={cn("hero-wipe relative overflow-hidden bg-surface-2", cell.className, className)}
      style={order(cell.index)}
    >
      {CASES.map((c, si) => (
        <Image
          key={c.id}
          src={shot(c.id, slot).src}
          alt={si === active ? `${c.name} ${label}` : ""}
          aria-hidden={si !== active}
          data-active={si === active}
          fill
          sizes={cell.sizes}
          priority={si === 0}
          className="showcase-img object-cover"
          style={{ transitionDelay: `${cell.index * 110}ms` }}
        />
      ))}
    </div>
  );
}

function DnaCard({ item, className }: { item: CaseItem; className?: string }) {
  return (
    <div className={cn("hero-fade bg-surface p-4 shadow-lift", className)} style={order(4)}>
      <div key={item.id} className="dna-swap">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-subtle">风格 DNA · v3</p>
            <p className="mt-1 font-display text-lg text-fg">
              {item.name} <span className="text-muted">{item.zh}</span>
            </p>
          </div>
          <span className="seal seal-stamp">已锁定</span>
        </div>
        <div className="mt-3 flex h-6" aria-hidden>
          {item.palette.map((color, i) => (
            <span
              key={color}
              className="swatch flex-1"
              style={{ ...order(i), background: color }}
            />
          ))}
        </div>
        <dl className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
          {item.rows.map(([term, value], i) => (
            <div key={term} className="dna-row flex gap-3" style={order(i)}>
              <dt className="w-8 shrink-0 text-subtle">{term}</dt>
              <dd className="text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
