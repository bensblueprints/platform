import { createDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = createDb();

/**
 * Records an offer impression (spec §9: fired on first mount per attendee).
 * Idempotent per (offer, registrant).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: offerId } = await params;
  const body = (await req.json().catch(() => ({}))) as { token?: string; offsetSeconds?: number };
  if (!body.token) return Response.json({ error: "not_found" }, { status: 404 });

  const regs = await sql<{ id: string; session_id: string }[]>`
    select id, session_id from registrants where access_token = ${body.token} limit 1
  `;
  const reg = regs[0];
  if (!reg) return Response.json({ error: "not_found" }, { status: 404 });

  const inserted = await sql`
    insert into offer_events (offer_id, session_id, registrant_id, event_type, offset_seconds)
    select ${offerId}, ${reg.session_id}, ${reg.id}, 'impression', ${body.offsetSeconds ?? null}
    where not exists (
      select 1 from offer_events
      where offer_id = ${offerId} and registrant_id = ${reg.id} and event_type = 'impression'
    )
    returning id
  `;

  return Response.json({ recorded: inserted.length > 0 });
}
