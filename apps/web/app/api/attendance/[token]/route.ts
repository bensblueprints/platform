import { getSharedDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/**
 * Attendance tracking (spec §5 attendances): POST creates the row with the
 * join offset; PATCH heartbeats; DELETE records the exit offset.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => ({}))) as { offsetSeconds?: number };

  const regs = await sql<{ id: string; session_id: string }[]>`
    select id, session_id from registrants where access_token = ${token} limit 1
  `;
  const reg = regs[0];
  if (!reg || !reg.session_id) return Response.json({ error: "not_found" }, { status: 404 });

  const inserted = await sql<{ id: string }[]>`
    insert into attendances (registrant_id, session_id, join_offset_seconds, last_heartbeat_at)
    values (${reg.id}, ${reg.session_id}, ${body.offsetSeconds ?? 0}, now())
    returning id
  `;
  return Response.json({ attendanceId: inserted[0].id });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => ({}))) as { attendanceId?: string };
  if (!body.attendanceId) return Response.json({ error: "bad_request" }, { status: 400 });

  await sql`
    update attendances a set last_heartbeat_at = now()
    from registrants r
    where a.id = ${body.attendanceId}::uuid and a.registrant_id = r.id and r.access_token = ${token}
  `;
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => ({}))) as { attendanceId?: string; exitOffsetSeconds?: number };
  if (!body.attendanceId) return Response.json({ error: "bad_request" }, { status: 400 });

  await sql`
    update attendances a set exit_offset_seconds = ${body.exitOffsetSeconds ?? null}
    from registrants r
    where a.id = ${body.attendanceId}::uuid and a.registrant_id = r.id and r.access_token = ${token}
  `;
  return Response.json({ ok: true });
}
