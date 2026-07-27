import { isAdminAuthorized } from "../../../../../../lib/auth";
import { getSharedDb } from "@platform/core";
import { mp4DurationSeconds, saveVideo, videoPath } from "../../../../../../lib/video-storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const sql = getSharedDb();

const MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

/**
 * Server-side video import (the answer to Cloudflare's 100MB proxied-upload
 * cap): the VPS downloads the file directly from any reachable URL.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthorized(req))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const url = body.url ?? "";

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad protocol");
  } catch {
    return Response.json({ error: "bad_url" }, { status: 400 });
  }

  const webinars = await sql<{ id: string }[]>`
    select id from webinars where id = ${id}::uuid limit 1
  `;
  if (!webinars[0]) return Response.json({ error: "not_found" }, { status: 404 });

  const upstream = await fetch(url, { redirect: "follow" }).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) {
    return Response.json({ error: "fetch_failed", status: upstream?.status }, { status: 502 });
  }
  const length = Number(upstream.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    return Response.json({ error: "too_large", maxBytes: MAX_BYTES }, { status: 413 });
  }

  try {
    await saveVideo(id, upstream.body as ReadableStream);
  } catch (err) {
    return Response.json({ error: "write_failed", detail: (err as Error).message }, { status: 500 });
  }

  const duration = mp4DurationSeconds(videoPath(id));
  await sql`
    update webinars set video_url = ${"/api/media/" + id}
    ${duration ? sql`, duration_seconds = ${duration}` : sql``}
    where id = ${id}
  `;

  return Response.json({ ok: true, durationSeconds: duration, bytes: length || null });
}
