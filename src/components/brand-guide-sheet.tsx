import { AppHeader } from "@/components/app-header";
import { DownloadPdfButton } from "@/components/download-pdf-button";
import type { BrandGuide, BrandGuideSwatch } from "@/lib/project/dna-export";

const ROLE_LABEL: Record<BrandGuideSwatch["role"], string> = {
  bg: "背景",
  surface: "表面",
  text: "文字",
  muted: "次要",
  primary: "主色",
  accent: "强调",
};

const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  .guide-chrome { display: none !important; }
  [data-sonner-toaster] { display: none !important; }
  .guide-swatch { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .guide-figure { break-inside: avoid; }
  .guide-figure img {
    width: 100% !important;
    height: 28mm !important;
    max-height: 28mm !important;
    aspect-ratio: auto !important;
    object-fit: contain;
  }
}
`;

export function BrandGuideSheet({
  guide,
  projectName,
  styleName,
  rev,
  dnaName,
  oneLiner,
}: {
  guide: BrandGuide;
  projectName: string;
  styleName: string;
  rev: number;
  dnaName: string;
  oneLiner: string;
}) {
  const lineName = styleName !== dnaName ? ` · ${styleName}` : "";

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <style>{PRINT_CSS}</style>
      <AppHeader className="guide-chrome" />
      <article className="guide-sheet mx-auto max-w-3xl px-5 py-8 md:px-8 md:py-12 print:max-w-none print:px-0 print:py-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="section-label">品牌规范</p>
          <DownloadPdfButton />
        </div>
        <h1 className="mt-4 font-display text-4xl tracking-tight text-fg print:mt-2 print:text-3xl">
          {dnaName}
        </h1>
        {oneLiner ? (
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted">{oneLiner}</p>
        ) : null}
        <p className="mt-3 text-sm text-subtle">
          {projectName}
          {lineName} · rev{rev}
        </p>

        <section className="mt-10 print:mt-4">
          <p className="section-label">色板</p>
          <ul className="mt-4 grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-6 print:grid-cols-6">
            {guide.palette.map((swatch) => (
              <li key={swatch.role}>
                <span
                  className="guide-swatch block h-14 w-full border border-border print:h-10"
                  style={{ backgroundColor: swatch.hex }}
                />
                <p className="mt-2 text-xs text-muted">{ROLE_LABEL[swatch.role]}</p>
                <p className="text-xs tracking-wide text-fg">{swatch.hex}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 print:mt-4 print:grid-cols-2 print:gap-6">
          <section>
            <p className="section-label">字体气质</p>
            <p className="mt-4 font-display text-2xl tracking-tight text-fg">{guide.typeMood}</p>
            <p
              className="mt-3 text-lg leading-snug text-fg"
              style={{ fontFamily: guide.fontFamily }}
            >
              {dnaName}
            </p>
            <p className="mt-2 break-words text-sm text-muted">{guide.fontFamily}</p>
          </section>
          <section>
            <p className="section-label">几何与密度</p>
            <p className="mt-4 text-sm text-fg">
              {guide.geometry} / {guide.density}
            </p>
            <div
              className="mt-4 max-w-xs border border-border bg-surface text-sm text-fg"
              style={{ borderRadius: guide.radius, padding: guide.spacing }}
            >
              圆角 {guide.radius}
              <span className="text-muted"> · 间距 {guide.spacing}</span>
            </div>
          </section>
        </div>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 print:mt-4 print:grid-cols-2 print:gap-6">
          <section>
            <p className="section-label">情绪词</p>
            {guide.mood.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-2">
                {guide.mood.map((word, index) => (
                  <li
                    key={`${word}-${index}`}
                    className="border border-border bg-surface px-3 py-2 text-sm text-fg"
                  >
                    {word}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-subtle">无</p>
            )}
          </section>
          <section>
            <p className="section-label">禁用风格</p>
            {guide.forbidden.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-2">
                {guide.forbidden.map((item, index) => (
                  <li key={`${item}-${index}`} className="text-sm leading-relaxed text-fg">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-subtle">无</p>
            )}
          </section>
        </div>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 print:mt-4 print:grid-cols-2 print:gap-6">
          <section>
            <p className="section-label">该做</p>
            <ul className="mt-4 flex flex-col">
              {guide.dos.map((line, index) => (
                <li
                  key={`${line}-${index}`}
                  className="border-t border-border py-3 text-sm leading-relaxed text-fg print:py-1.5"
                >
                  {line}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <p className="section-label">不该做</p>
            <ul className="mt-4 flex flex-col">
              {guide.donts.map((line, index) => (
                <li
                  key={`${line}-${index}`}
                  className="border-t border-border py-3 text-sm leading-relaxed text-fg print:py-1.5"
                >
                  {line}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {guide.slots.length > 0 ? (
          <section className="mt-10 print:mt-4">
            <p className="section-label">物料</p>
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3 print:grid-cols-3 print:gap-3">
              {guide.slots.map((slot) => (
                <li key={slot.id}>
                  <figure className="guide-figure">
                    <img
                      src={slot.url}
                      alt={slot.name}
                      className="guide-swatch w-full bg-surface-2 object-contain"
                      style={{ aspectRatio: slot.aspect.replaceAll(":", " / ") }}
                    />
                    <figcaption className="mt-2 text-sm leading-relaxed">
                      <span className="text-fg">{slot.name}</span>
                      <span className="text-subtle"> · {slot.aspect}</span>
                      {slot.purpose ? (
                        <span className="mt-1 block text-subtle">{slot.purpose}</span>
                      ) : null}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </div>
  );
}
