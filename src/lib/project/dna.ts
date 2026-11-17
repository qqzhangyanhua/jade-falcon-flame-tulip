import { z } from "zod";

export const styleDnaSchema = z.object({
  name: z.string(),
  oneLiner: z.string(),
  colors: z.object({
    bg: z.string(),
    surface: z.string(),
    text: z.string(),
    muted: z.string(),
    primary: z.string(),
    accent: z.string(),
  }),
  light: z.string(),
  material: z.string(),
  geometry: z.string(),
  density: z.string(),
  typeMood: z.string(),
  mood: z.array(z.string()),
  forbidden: z.array(z.string()),
  promptPositive: z.string(),
  promptNegative: z.string(),
});

export type StyleDna = z.infer<typeof styleDnaSchema>;

export const dnaChangeSchema = z.object({
  field: z.string(),
  from: z.string(),
  to: z.string(),
});

export type DnaChange = z.infer<typeof dnaChangeSchema>;

const LIST_SEPARATOR = "、";

function flattenDna(dna: StyleDna): [string, string][] {
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(dna)) {
    if (key === "colors") {
      for (const [colorKey, color] of Object.entries(dna.colors)) {
        entries.push([`colors.${colorKey}`, color]);
      }
    } else if (Array.isArray(value)) {
      entries.push([key, value.join(LIST_SEPARATOR)]);
    } else {
      entries.push([key, String(value)]);
    }
  }
  return entries;
}

/**
 * Lists the fields whose value differs. Lists are compared element by element
 * (order matters) and rendered joined with "、"; colours use `colors.<key>` paths.
 */
export function diffDna(previous: StyleDna, next: StyleDna): DnaChange[] {
  const before = new Map(flattenDna(previous));
  const changes: DnaChange[] = [];
  for (const [field, to] of flattenDna(next)) {
    const from = before.get(field) ?? "";
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}
