import { Queue } from "bullmq";
import IORedis from "ioredis";
import { getSharedDb } from "@platform/core";
import { isAdminAuthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

/** Enqueue a script generation run (spec §7.2/§7.8). Single-owner platform
 * with the owner's own inference key — no generation cap. */
export async function POST(req: Request) {
  if (!(await isAdminAuthorized(req))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    webinarId?: string;
    mode?: "full" | "regen-beat";
    beatType?: string;
  };
  if (!body.webinarId) return Response.json({ error: "bad_request" }, { status: 400 });

  const sql = getSharedDb();
  const inserted = await sql<{ id: string }[]>`
    insert into generation_jobs (webinar_id, status, stage)
    values (${body.webinarId}::uuid, 'queued', ${body.mode === "regen-beat" ? "regen-beat" : "queued"})
    returning id
  `;
  const jobId = inserted[0].id;

  const queue = new Queue("generation", {
    connection: new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null }),
  });
  await queue.add("run", {
    jobId,
    webinarId: body.webinarId,
    mode: body.mode ?? "full",
    beatType: body.beatType ?? null,
  });
  await queue.close();

  return Response.json({ jobId });
}
