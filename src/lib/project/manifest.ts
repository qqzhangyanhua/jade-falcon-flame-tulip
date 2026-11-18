import { adoptedRev, currentDna, SLOT_IDS, type Slot, type StyleBranch } from "./schema.ts";

export type ExportImage = { slot: Slot; fileName: string; url: string };

export type ExportManifest = {
  images: ExportImage[];
  dna: { fileName: "dna.json"; content: string };
};

const KNOWN_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

// /api/images/<id> carries no extension, so the real type is only known from the
// response; png is the default and the client may rename once it has the bytes.
function extensionOf(url: string): string {
  const path = url.split(/[?#]/)[0];
  const match = /\.([a-z0-9]+)$/i.exec(path);
  const ext = match?.[1].toLowerCase();
  return ext && KNOWN_EXTENSIONS.has(ext) ? ext : "png";
}

/**
 * What an export of a Style Line contains: per Slot the adopted image (the
 * latest one when none is adopted; Slots with no image are skipped) and the
 * viewed rev's DNA as dna.json.
 */
export function exportManifest(styleLine: StyleBranch): ExportManifest {
  const images: ExportImage[] = [];
  for (const slot of SLOT_IDS) {
    const asset = styleLine.assets[slot];
    if (!asset) continue;
    const rev = adoptedRev(asset);
    if (!rev) continue;
    images.push({ slot, fileName: `${slot}.${extensionOf(rev.url)}`, url: rev.url });
  }
  return {
    images,
    dna: { fileName: "dna.json", content: JSON.stringify(currentDna(styleLine), null, 2) },
  };
}
