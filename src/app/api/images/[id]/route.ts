import { getSql } from "@/lib/db";
import { createSqlBlobStore } from "@/lib/image-jobs/sql";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const imageId = decodeURIComponent(id ?? "").trim();
  if (!imageId) return new Response("Not found", { status: 404 });
  const sql = await getSql();
  const blob = await createSqlBlobStore(sql).get(imageId);
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(blob.bytes), {
    status: 200,
    headers: {
      "Content-Type": blob.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
