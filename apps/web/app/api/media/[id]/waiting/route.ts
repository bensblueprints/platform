import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { findWaitingImage } from "../../../../../lib/video-storage";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** Public waiting-room image for a webinar (small, no range support needed). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("not found", { status: 404 });
  const found = findWaitingImage(id);
  if (!found) return new Response("not found", { status: 404 });
  return new Response(Readable.toWeb(createReadStream(found.path)) as any, {
    headers: {
      "content-type": TYPES[found.ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=300",
    },
  });
}
