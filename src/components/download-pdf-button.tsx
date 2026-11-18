"use client";

export function DownloadPdfButton() {
  return (
    <button
      type="button"
      className="guide-chrome btn btn-ink h-11 shrink-0 px-4"
      onClick={() => window.print()}
    >
      下载 PDF
    </button>
  );
}
