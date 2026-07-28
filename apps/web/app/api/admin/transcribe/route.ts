import { Queue } from "bullmq";
import IORedis from "ioredis";
import { getSharedDb } from "@platform/core";
import { isAdminAuthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

/**
 * Step 1 of the two-step generation flow: transcribe the video. Fills
 * transcript_cache; step 2 (generate) reads from the cache (§7.8).
 */
export async function POST(req: Request) {
  if (!(await isAdminAuthorized(req))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as { webinarId?: string };
  if (!body.webinarId) return Response.json({ error: "bad_request" }, { status: 400 });

  const sql = getSharedDb();
  const inserted = await sql<{ id: string }[]>`
    insert into generation_jobs (webinar_id, status, stage)
    values (${body.webinarId}::uuid, 'queued', 'transcribe')
    returning id
  `;
  const jobId = inserted[0].id;

  const queue = new Queue("generation", {
    connection: new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null }),
  });
  await queue.add("transcribe", { jobId, webinarId: body.webinarId });
  await queue.close();

  return Response.json({ jobId });
}
