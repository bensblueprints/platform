import { getSharedDb } from "@platform/core";
import { isAdminAuthorized } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthorized(req))) return Response.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  const rows = await sql`
    select * from offers where webinar_id = ${id}::uuid order by created_at asc
  `;
  return Response.json({ offers: rows });
}

/** Create an offer for the webinar. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthorized(req))) return Response.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as any;

  if (!b.name || !b.headline || !b.buttonText || b.startOffsetSeconds == null) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const inserted = await sql<{ id: string }[]>`
    insert into offers (
      webinar_id, name, headline, body, button_text, button_url,
      start_offset_seconds, end_offset_seconds,
      urgency_enabled, urgency_seconds, scarcity_enabled, inventory_total,
      price_start_cents, price_increment_cents, price_cap_cents
    ) values (
      ${id}::uuid, ${b.name}, ${b.headline}, ${b.body ?? null}, ${b.buttonText}, ${b.buttonUrl ?? null},
      ${Number(b.startOffsetSeconds)}, ${b.endOffsetSeconds ?? null},
      ${b.urgencyEnabled === true}, ${b.urgencySeconds ?? null},
      ${b.scarcityEnabled === true}, ${b.inventoryTotal ?? null},
      ${b.priceStartCents ?? null}, ${b.priceIncrementCents ?? 0}, ${b.priceCapCents ?? null}
    )
    returning id
  `;
  return Response.json({ id: inserted[0].id });
}
