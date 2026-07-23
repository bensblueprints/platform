import { Queue } from "bullmq";
import IORedis from "ioredis";
import { getSharedDb } from "@platform/core";

export const dynamic = "force-dynamic";

const DAILY_GENERATION_CAP = Number(process.env.GENERATION_DAILY_CAP ?? 10);

/** Enqueue a script generation run (spec §7.2/§7.8). ADMIN_KEY interim auth. */
export async function POST(req: Request) {
  const key = process.env.ADMIN_KEY;
  if (!key || req.headers.get("x-admin-key") !== key) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    webinarId?: string;
    mode?: "full" | "regen-beat";
    beatType?: string;
  };
  if (!body.webinarId) return Response.json({ error: "bad_request" }, { status: 400 });

  const sql = getSharedDb();
  const today = await sql<{ c: number }[]>`
    select count(*)::int as c from generation_jobs
    where webinar_id = ${body.webinarId}::uuid and created_at > now() - interval '24 hours'
  `;
  if (today[0].c >= DAILY_GENERATION_CAP) {
    return Response.json({ error: "generation_cap_reached", cap: DAILY_GENERATION_CAP }, { status: 429 });
  }

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
