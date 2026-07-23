import {  cleanupDeadSessions, getSharedDb, materializeRecurringSessions  } from "@platform/core";

export const dynamic = "force-dynamic";

/** Dev-only: run the recurring materializer + cleanup on demand (e2e). */
export async function GET(req: Request) {
  const expected = process.env.DEV_SEED_TOKEN;
  if (!expected || req.headers.get("x-seed-token") !== expected) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const sql = getSharedDb();
  const m = await materializeRecurringSessions(sql);
  const c = await cleanupDeadSessions(sql);
  return Response.json({ created: m.created, deleted: c.deleted });
}
