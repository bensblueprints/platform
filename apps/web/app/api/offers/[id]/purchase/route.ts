import { getSetting, getSharedDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/**
 * Generic purchase bridge for external checkouts (Viral Invoice, GHL flows,
 * Zapier/Make): POST with the shared PURCHASE_WEBHOOK_SECRET and it counts
 * exactly like a Stripe checkout.session.completed — §16.4/16.5 semantics:
 * idempotent by external reference, transactional increment.
 *
 * Body: { secret, amountCents?, externalRef?, email? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: offerId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    secret?: string;
    amountCents?: number;
    externalRef?: string;
    email?: string;
  };

  const expected = await getSetting(sql, "PURCHASE_WEBHOOK_SECRET");
  if (!expected || body.secret !== expected) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const offers = await sql<{ id: string }[]>`
    select id from offers where id = ${offerId}::uuid limit 1
  `;
  if (!offers[0]) return Response.json({ error: "not_found" }, { status: 404 });

  const externalRef = body.externalRef ?? `vi-${crypto.randomUUID()}`;
  const result = await sql.begin(async (tx) => {
    const inserted = await tx`
      insert into offer_events (offer_id, session_id, event_type, amount_cents, stripe_session_id)
      values (${offerId}, null, 'purchase', ${body.amountCents ?? null}, ${externalRef})
      on conflict (stripe_session_id) do nothing
      returning id
    `;
    if (inserted.length === 0) return { counted: false as const, duplicate: true };

    const updated = await tx<{ units_sold: number }[]>`
      update offers set units_sold = units_sold + 1
      where id = ${offerId}
      returning units_sold
    `;
    return { counted: true as const, unitsSold: updated[0]?.units_sold };
  });

  return Response.json(result);
}
