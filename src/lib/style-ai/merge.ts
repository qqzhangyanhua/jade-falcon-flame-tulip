import { diffDna, styleDnaSchema, type DnaChange, type StyleDna } from "../project/dna.ts";
import { chatJson, type ChatOptions } from "./chat.ts";
import { isHexColor, type MergeError } from "./shared.ts";

const MERGE_INSTRUCTION_MAX_TOKENS = 1200;

export { messageForMergeError, type MergeError } from "./shared.ts";

export type MergeResult =
  | { ok: true; dna: StyleDna; changes: DnaChange[] }
  | { ok: false; error: MergeError };

// Only an explicit ask counts: "brand name in the logo" or "名字更醒目" mention a name without asking to change it.
const RENAME_REQUEST =
  /改名|重命名|更名|改叫|叫做|命名为|rename|change (the |its |this )?(style )?name|(名称|名字|风格名)\s*(改成|改为|换成|换为|设为|设成|叫)|\bname (it|the style|this style|the direction)\b.*\b(to|as)\b/i;

/**
 * Folds a free-text instruction into a style DNA. The model's reply is only
 * trusted after it parses, matches the DNA schema, and leaves `name` alone
 * unless the instruction asked for a rename.
 */
export async function mergeInstruction(
  dna: StyleDna,
  instruction: string,
  opts?: ChatOptions,
): Promise<MergeResult> {
  const res = await chatJson({
    ...opts,
    maxTokens: MERGE_INSTRUCTION_MAX_TOKENS,
    prompt: [
      "You maintain a brand style DNA. Apply the user's instruction to the current DNA and return the COMPLETE updated DNA as one JSON object with exactly the same keys and structure.",
      "Change only what the instruction implies; keep every other value identical. Keep colours as hex strings. Keep `name` unchanged unless the instruction explicitly asks to rename the style.",
      "Keep promptPositive / promptNegative consistent with any changed fields.",
      `Current DNA:\n${JSON.stringify(dna)}`,
      `Instruction:\n${instruction}`,
    ].join("\n\n"),
  });
  if (!res.ok) return { ok: false, error: res.error };

  const parsed = styleDnaSchema.safeParse(res.value);
  if (!parsed.success) return { ok: false, error: "invalid_schema" };

  const next = parsed.data;
  // The stored schema takes any string as a colour (legacy data stays loadable), so only a colour
  // the merge itself changed has to be a real hex value.
  const badColor = (Object.keys(next.colors) as (keyof StyleDna["colors"])[]).some(
    (key) => next.colors[key] !== dna.colors[key] && !isHexColor(next.colors[key]),
  );
  if (badColor) return { ok: false, error: "invalid_schema" };
  if (next.name !== dna.name && !RENAME_REQUEST.test(instruction)) {
    return { ok: false, error: "renamed" };
  }
  const changes = diffDna(dna, next);
  if (changes.length === 0) return { ok: false, error: "no_change" };
  return { ok: true, dna: next, changes };
}
