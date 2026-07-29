import { getSharedDb } from "@platform/core";
import { getScopedUser, canAccessWebinar } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Editor data (spec §7.7): draft + live lines, roster, latest beats. */
export async function GET(req: Request, { params }: { params: Promise<{ webinarId: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });
  const { webinarId } = await params;
  if (!(await canAccessWebinar(sql, scopedUser, webinarId))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const lines = await sql`
    select id, offset_seconds, display_name, role, message, mode, sort_order, source, status
    from chat_scripts where webinar_id = ${webinarId}::uuid
    order by offset_seconds asc, sort_order asc
  `;
  const roster = await sql`
    select id, display_name, persona from name_roster where webinar_id = ${webinarId}::uuid
  `;
  const jobs = await sql`
    select id, status, error, usage from generation_jobs
    where webinar_id = ${webinarId}::uuid order by created_at desc limit 1
  `;

  return Response.json({
    draft: lines.filter((l: any) => l.status === "draft"),
    live: lines.filter((l: any) => l.status === "live"),
    roster,
    lastJob: jobs[0] ?? null,
  });
}
