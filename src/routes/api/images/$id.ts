import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { createSqlBlobStore } from "@/lib/image-jobs/sql.ts";

export const Route = createFileRoute("/api/images/$id")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const segments = new URL(request.url).pathname.split("/");
        const id = decodeURIComponent(segments.at(-1) ?? "").trim();
        if (!id) return new Response("Not found", { status: 404 });
        const sql = await getSql();
        const blob = await createSqlBlobStore(sql).get(id);
        if (!blob) return new Response("Not found", { status: 404 });
        return new Response(Buffer.from(blob.bytes), {
          status: 200,
          headers: {
            "Content-Type": blob.contentType,
            "Cache-Control": "private, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
