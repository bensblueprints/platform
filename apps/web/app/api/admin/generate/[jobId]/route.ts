import { getSharedDb } from "@platform/core";
import { getScopedUser, canAccessWebinar } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Generation job status (spec §7.7 editor polling). */
export async function GET(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });
  const { jobId } = await params;
  const rows = await sql`
    select id, status, stage, error, usage, created_at, updated_at
    from generation_jobs where id = ${jobId}::uuid limit 1
  `;
  if (!rows[0]) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(rows[0]);
}
