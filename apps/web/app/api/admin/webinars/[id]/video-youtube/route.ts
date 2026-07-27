import { Queue } from "bullmq";
import IORedis from "ioredis";
import { getSharedDb } from "@platform/core";
import { isAdminAuthorized } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/**
 * YouTube import: queue a yt-dlp job on the workers. Works for public and
 * unlisted videos; private videos need YOUTUBE_COOKIES in Settings.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthorized(req))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const url = body.url ?? "";
  if (!/(youtube\.com|youtu\.be)/.test(url)) {
    return Response.json({ error: "not_a_youtube_url" }, { status: 400 });
  }

  const webinars = await sql<{ id: string }[]>`
    select id from webinars where id = ${id}::uuid limit 1
  `;
  if (!webinars[0]) return Response.json({ error: "not_found" }, { status: 404 });

  const queue = new Queue("scheduling", {
    connection: new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null }),
  });
  await queue.add("youtube-import", { webinarId: id, url });
  await queue.close();

  return Response.json({ queued: true });
}
