import { designTokens, promptPack, promptsMarkdown } from "./dna-export.ts";
import { adoptedRev, currentDna, type Slot, type StyleBranch } from "./schema.ts";
import { DEFAULT_ENABLED_SLOT_IDS, slotPromptMetas } from "./slots.ts";

export type ExportImage = { slot: Slot; fileName: string; url: string };

export type ExportManifest = {
  images: ExportImage[];
  dna: { fileName: "dna.json"; content: string };
  tokens: {
    css: { fileName: "tokens.css"; content: string };
    tailwind: { fileName: "tailwind.css"; content: string };
    w3c: { fileName: "tokens.json"; content: string };
  };
  prompts: { fileName: "prompts.md"; content: string };
};

export type ExportManifestOptions = {
  /** Enabled slot ids, in display order. Hidden slots are left out even if they still have images. */
  enabledSlotIds?: readonly string[];
  /** Product name pasted into the prompt pack. Defaults to the style line's name. */
  product?: string;
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
 * What an export of a Style Line contains: each enabled Slot's adopted image
 * (the latest one when none is adopted; Slots with no image are skipped), the
 * viewed rev's DNA, and design tokens plus prompts.md from that same rev.
 */
export function exportManifest(
  styleLine: StyleBranch,
  options?: ExportManifestOptions,
): ExportManifest {
  const enabledSlotIds = options?.enabledSlotIds ?? DEFAULT_ENABLED_SLOT_IDS;
  const images: ExportImage[] = [];
  for (const slot of enabledSlotIds) {
    const asset = styleLine.assets[slot];
    if (!asset) continue;
    const rev = adoptedRev(asset);
    if (!rev) continue;
    images.push({ slot, fileName: `${slot}.${extensionOf(rev.url)}`, url: rev.url });
  }
  const dna = currentDna(styleLine);
  const product = options?.product ?? styleLine.name;
  const tokens = designTokens(dna);
  const prompts = promptsMarkdown(
    product,
    dna.name,
    promptPack(dna, slotPromptMetas(enabledSlotIds), product),
  );
  return {
    images,
    dna: { fileName: "dna.json", content: JSON.stringify(dna, null, 2) },
    tokens: {
      css: { fileName: "tokens.css", content: tokens.css },
      tailwind: { fileName: "tailwind.css", content: tokens.tailwind },
      w3c: { fileName: "tokens.json", content: tokens.w3c },
    },
    prompts: { fileName: "prompts.md", content: prompts },
  };
}
