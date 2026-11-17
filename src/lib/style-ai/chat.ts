export type ChatFetch = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

export type ChatError = "no_key" | "network" | "upstream" | "unparseable";

export type ChatJsonResult = { ok: true; value: unknown } | { ok: false; error: ChatError };

export type ChatOptions = {
  fetchImpl?: ChatFetch;
  apiKey?: string;
};

const CHAT_MODEL = "grok-4.5";
const CHAT_URL = "https://api.x.ai/v1/chat/completions";

export async function chatJson(
  input: ChatOptions & { prompt: string; maxTokens: number },
): Promise<ChatJsonResult> {
  const apiKey = (input.apiKey ?? process.env.XAI_API_KEY ?? "").trim();
  if (!apiKey) return { ok: false, error: "no_key" };
  const fetchImpl = input.fetchImpl ?? (fetch as ChatFetch);

  let text: string;
  try {
    const res = await fetchImpl(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0.3,
        max_tokens: input.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return only valid JSON. No markdown." },
          { role: "user", content: input.prompt },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: "upstream" };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    text = body.choices?.[0]?.message?.content ?? "";
  } catch {
    return { ok: false, error: "network" };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: "unparseable" };
  }
}
