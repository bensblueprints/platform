import { getSharedDb } from "@platform/core";
import { videoExists, videoSize, videoStream } from "../../../../lib/video-storage";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/**
 * Range-serving media route (spec §3 range requests are load-bearing).
 * Public: rooms load the video from here until the R2 adapter replaces it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("not found", { status: 404 });

  const rows = await sql<{ id: string }[]>`
    select id from webinars where id = ${id}::uuid limit 1
  `;
  if (!rows[0] || !videoExists(id)) return new Response("not found", { status: 404 });

  const size = videoSize(id)!;
  const range = req.headers.get("range");
  const headers: Record<string, string> = {
    "accept-ranges": "bytes",
    "content-type": "video/mp4",
    "cache-control": "private, max-age=300",
  };

  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start < size && start <= end) {
        headers["content-range"] = `bytes ${start}-${end}/${size}`;
        headers["content-length"] = String(end - start + 1);
        return new Response(Readable.toWeb(videoStream(id, start, end)) as any, {
          status: 206,
          headers,
        });
      }
    }
  }

  headers["content-length"] = String(size);
  return new Response(Readable.toWeb(videoStream(id)) as any, { status: 200, headers });
}
