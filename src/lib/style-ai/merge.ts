import { diffDna, styleDnaSchema, type DnaChange, type StyleDna } from "../project/dna.ts";
import { chatJson, type ChatError, type ChatOptions } from "./chat.ts";

const MERGE_INSTRUCTION_MAX_TOKENS = 1200;

export type MergeError = ChatError | "invalid_schema" | "renamed" | "no_change";

export type MergeResult =
  | { ok: true; dna: StyleDna; changes: DnaChange[] }
  | { ok: false; error: MergeError };

const RENAME_REQUEST = /改名|重命名|命名|名称|名字|叫做|改叫|rename|\bname\b/i;

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
  if (next.name !== dna.name && !RENAME_REQUEST.test(instruction)) {
    return { ok: false, error: "renamed" };
  }
  const changes = diffDna(dna, next);
  if (changes.length === 0) return { ok: false, error: "no_change" };
  return { ok: true, dna: next, changes };
}

export function messageForMergeError(error: MergeError): string {
  switch (error) {
    case "no_key":
    case "upstream":
    case "network":
      return "暂时无法合并风格修改，请稍后重试";
    case "unparseable":
    case "invalid_schema":
      return "模型返回的风格不合格，没有写回。换个说法再试一次";
    case "renamed":
      return "模型擅自改了风格名称，没有写回。换个说法再试一次";
    case "no_change":
      return "这条指令没有改动任何风格字段，没有写回。说得具体一些再试";
  }
}
