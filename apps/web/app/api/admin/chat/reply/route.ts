import { getSharedDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/**
 * Moderator reply (spec §11): private (registrantId required, broadcast=false
 * → only that attendee sees it) or broadcast (every active session of the
 * webinar sees it).
 */
export async function POST(req: Request) {
  const key = process.env.ADMIN_KEY;
  if (!key || req.headers.get("x-admin-key") !== key) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    registrantId?: string;
    sessionId?: string;
    webinarId?: string;
    body?: string;
    broadcast?: boolean;
  };
  const text = (body.body ?? "").trim();
  if (!text || text.length > 500) return Response.json({ error: "bad_request" }, { status: 400 });

  let sessionId = body.sessionId ?? null;
  let registrantId: string | null = null;

  if (body.broadcast) {
    // pick any active session of the webinar to carry the broadcast row
    const rows = await sql<{ id: string }[]>`
      select id from sessions
      where webinar_id = ${body.webinarId ?? ""}::uuid and status = 'scheduled'
      order by starts_at desc limit 1
    `;
    sessionId = rows[0]?.id ?? null;
    if (!sessionId) return Response.json({ error: "no_active_session" }, { status: 409 });
  } else {
    if (!body.registrantId) return Response.json({ error: "bad_request" }, { status: 400 });
    const regs = await sql<{ id: string; session_id: string }[]>`
      select id, session_id from registrants where id = ${body.registrantId}::uuid limit 1
    `;
    const reg = regs[0];
    if (!reg) return Response.json({ error: "not_found" }, { status: 404 });
    registrantId = reg.id;
    sessionId = sessionId ?? reg.session_id;
    if (!sessionId) return Response.json({ error: "no_active_session" }, { status: 409 });
  }

  const inserted = await sql<{ id: string }[]>`
    insert into chat_messages (session_id, registrant_id, author_type, body, broadcast)
    values (${sessionId}, ${registrantId}, 'moderator', ${text}, ${body.broadcast === true})
    returning id
  `;
  return Response.json({ id: inserted[0].id });
}
