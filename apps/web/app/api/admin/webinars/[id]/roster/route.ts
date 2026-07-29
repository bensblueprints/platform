import { getSharedDb } from "@platform/core";
import { getScopedUser, canAccessWebinar } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  if (!(await canAccessWebinar(sql, scopedUser, id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const rows = await sql`
    select display_name from name_roster where webinar_id = ${id}::uuid order by display_name asc
  `;
  return Response.json({ names: rows.map((r: any) => r.display_name) });
}

/** Replace the roster from a plain list of names (one per line). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  if (!(await canAccessWebinar(sql, scopedUser, id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const b = (await req.json().catch(() => ({}))) as { names?: string[] };
  const names = (b.names ?? []).map((n) => n.trim()).filter(Boolean).slice(0, 200);

  await sql.begin(async (tx) => {
    await tx`delete from name_roster where webinar_id = ${id}::uuid`;
    for (const name of names) {
      await tx`insert into name_roster (webinar_id, display_name) values (${id}::uuid, ${name})`;
    }
  });
  return Response.json({ saved: names.length });
}
