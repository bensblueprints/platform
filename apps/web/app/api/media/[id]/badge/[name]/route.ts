import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { findBadgeImage } from "../../../../../../lib/video-storage";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/** Public press-badge logo for a webinar badge name. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  const { id, name } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("not found", { status: 404 });
  const found = findBadgeImage(id, decodeURIComponent(name));
  if (!found) return new Response("not found", { status: 404 });
  return new Response(Readable.toWeb(createReadStream(found.path)) as any, {
    headers: {
      "content-type": TYPES[found.ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=86400",
    },
  });
}
