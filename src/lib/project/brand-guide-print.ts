/**
 * Print rules for one A4 page: palette, type, mood, forbidden, do/don't,
 * and up to six slot images. Text stays visible; nothing is clipped away.
 */
export const BRAND_GUIDE_PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  .guide-chrome { display: none !important; }
  [data-sonner-toaster] { display: none !important; }
  .guide-root { min-height: 0 !important; background: #fff !important; }
  .guide-sheet {
    font-size: 9pt;
    line-height: 1.25;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .guide-sheet h1 {
    font-size: 16pt !important;
    line-height: 1.15;
    margin-top: 0 !important;
  }
  .guide-sheet p,
  .guide-sheet li {
    font-size: 9pt;
    line-height: 1.25;
  }
  .guide-block {
    margin-top: 3mm !important;
  }
  .guide-swatch {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    height: 8mm !important;
  }
  .guide-rule {
    padding-top: 0.5mm !important;
    padding-bottom: 0.5mm !important;
  }
  .guide-figures {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2mm !important;
    margin-top: 2mm !important;
  }
  .guide-figure { break-inside: avoid; }
  .guide-figure img {
    width: 100% !important;
    height: 22mm !important;
    max-height: 22mm !important;
    aspect-ratio: auto !important;
    object-fit: contain;
  }
  .guide-figure figcaption {
    font-size: 8pt;
    line-height: 1.2;
    margin-top: 1mm !important;
  }
}
`;
