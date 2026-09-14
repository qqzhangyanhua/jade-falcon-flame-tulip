import type {
  ImageUpstream,
  ImageUpstreamRequest,
  ImageUpstreamResult,
} from "./types.ts";

type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

function parseUrls(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as { url?: unknown; b64_json?: unknown };
      if (typeof row.url === "string" && row.url) return row.url;
      if (typeof row.b64_json === "string" && row.b64_json) {
        return `data:image/png;base64,${row.b64_json}`;
      }
      return "";
    })
    .filter(Boolean);
}

function usesEdit(request: ImageUpstreamRequest): boolean {
  return (
    request.action === "tune" ||
    request.action === "compose" ||
    (request.action === "generate" && Boolean(request.imageUrl))
  );
}

export function createXaiImageUpstream(opts?: {
  fetchImpl?: FetchLike;
  apiKey?: string;
}): ImageUpstream {
  return {
    async run(request): Promise<ImageUpstreamResult> {
      const apiKey = opts?.apiKey ?? process.env.XAI_API_KEY?.trim();
      if (!apiKey) return { ok: false };
      const fetchImpl = opts?.fetchImpl ?? (fetch as FetchLike);
      const edit = usesEdit(request);
      if (edit && !request.imageUrl) return { ok: false };

      const url = edit
        ? "https://api.x.ai/v1/images/edits"
        : "https://api.x.ai/v1/images/generations";
      const body = edit
        ? {
            model: request.upstreamModelId,
            prompt: request.prompt,
            image: { url: request.imageUrl, type: "image_url" },
            resolution: "1K",
            aspect_ratio: request.aspect,
            response_format: "url",
          }
        : {
            model: request.upstreamModelId,
            prompt: request.prompt,
            n: request.n,
            resolution: "1K",
            aspect_ratio: request.aspect,
            response_format: "url",
          };

      try {
        const res = await fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) return { ok: false };
        const urls = parseUrls(await res.json());
        if (urls.length === 0) return { ok: false };
        return { ok: true, urls };
      } catch {
        return { ok: false };
      }
    },
  };
}
