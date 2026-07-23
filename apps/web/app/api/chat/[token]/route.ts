import { getSharedDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Attendee sends a real chat message (spec §6.1). Never broadcast. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const text = (body.body ?? "").trim();
  if (text.length === 0 || text.length > 500) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const regs = await sql<{ id: string; session_id: string }[]>`
    select id, session_id from registrants where access_token = ${token} limit 1
  `;
  const reg = regs[0];
  if (!reg || !reg.session_id) return Response.json({ error: "not_found" }, { status: 404 });

  const inserted = await sql<{ id: string }[]>`
    insert into chat_messages (session_id, registrant_id, author_type, body, broadcast)
    values (${reg.session_id}, ${reg.id}, 'attendee', ${text}, false)
    returning id
  `;
  return Response.json({ id: inserted[0].id });
}
