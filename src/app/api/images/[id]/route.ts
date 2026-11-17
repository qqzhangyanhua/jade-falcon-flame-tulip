import { requireActionUser } from "@/lib/auth/session";
import { getSql } from "@/lib/db";
import { readImageForUser } from "@/lib/image-jobs/image-access";
import { createSqlBlobStore } from "@/lib/image-jobs/sql";

const NOT_FOUND = () => new Response("Not found", { status: 404 });

async function signedInUserId(): Promise<string | null> {
  try {
    return (await requireActionUser()).userId;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const imageId = decodeURIComponent(id ?? "").trim();
  if (!imageId) return NOT_FOUND();
  const userId = await signedInUserId();
  if (!userId) return NOT_FOUND();
  const sql = await getSql();
  const blob = await readImageForUser(createSqlBlobStore(sql), imageId, userId);
  if (!blob) return NOT_FOUND();
  return new Response(Buffer.from(blob.bytes), {
    status: 200,
    headers: {
      "Content-Type": blob.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
