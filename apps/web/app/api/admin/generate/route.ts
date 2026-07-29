import { Queue } from "bullmq";
import IORedis from "ioredis";
import { getSharedDb } from "@platform/core";
import { getScopedUser, canAccessWebinar } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Enqueue a script generation run (spec §7.2/§7.8). Single-owner platform
 * with the owner's own inference key — no generation cap. Customer tenants
 * generate with their own keys (BYOK). */
export async function POST(req: Request) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    webinarId?: string;
    mode?: "full" | "regen-beat";
    beatType?: string;
  };
  if (!body.webinarId) return Response.json({ error: "bad_request" }, { status: 400 });
  if (!(await canAccessWebinar(sql, scopedUser, body.webinarId))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // BYOK: a customer tenant generates with its own inference keys only.
  if (scopedUser.role !== "platform") {
    const keys = await sql<{ key: string }[]>`
      select key from tenant_settings
      where tenant_id = ${scopedUser.tenantId}::uuid and key in ('INFERENCE_BASE_URL', 'INFERENCE_API_KEY')
    `;
    const have = new Set(keys.map((k) => k.key));
    if (!have.has("INFERENCE_BASE_URL") || !have.has("INFERENCE_API_KEY")) {
      return Response.json(
        { error: "add_keys", detail: "Add your OpenRouter base URL and API key in Settings first." },
        { status: 400 },
      );
    }
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
