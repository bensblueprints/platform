import {  getSharedDb  } from "@platform/core";
import { createCheckoutSession } from "@platform/offers";
import { offerWindowState, currentPriceCents } from "@platform/offers";
import { offsetSeconds } from "@platform/timeline";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/**
 * Creates a Stripe Checkout Session at click time with the current
 * server-computed ladder price (spec §9: price shown = price paid).
 * Also records the click event. Returns 503 until Stripe is configured.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: offerId } = await params;
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) return Response.json({ error: "not_found" }, { status: 404 });

  const regs = await sql<{ id: string; session_id: string }[]>`
    select id, session_id from registrants where access_token = ${token} limit 1
  `;
  const reg = regs[0];
  if (!reg) return Response.json({ error: "not_found" }, { status: 404 });

  const offers = await sql<any[]>`
    select o.*, s.starts_at from offers o
    join registrants r on r.webinar_id = o.webinar_id
    left join sessions s on s.id = r.session_id
    where o.id = ${offerId} and r.id = ${reg.id} limit 1
  `;
  const offer = offers[0];
  if (!offer) return Response.json({ error: "not_found" }, { status: 404 });

  const offset = offer.starts_at
    ? offsetSeconds(new Date(offer.starts_at).getTime(), Date.now())
    : 0;
  const window = offerWindowState(
    { startOffsetSeconds: offer.start_offset_seconds, endOffsetSeconds: offer.end_offset_seconds },
    offset,
  );
  if (window !== "active") {
    return Response.json({ error: "offer_not_active", window, offset, hasStartsAt: offer.starts_at != null }, { status: 409 });
  }

  const amountCents = currentPriceCents(
    {
      priceStartCents: offer.price_start_cents,
      priceIncrementCents: offer.price_increment_cents,
      priceCapCents: offer.price_cap_cents,
    },
    offer.units_sold ?? 0,
  );

  await sql`
    insert into offer_events (offer_id, session_id, registrant_id, event_type, offset_seconds)
    values (${offer.id}, ${reg.session_id}, ${reg.id}, 'click', ${offset})
  `;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return Response.json({ error: "payments_not_configured" }, { status: 503 });
  }

  const origin = new URL(req.url).origin;
  const result = await createCheckoutSession({
    secretKey,
    offerId: offer.id,
    offerName: offer.name,
    amountCents,
    registrantToken: token,
    sessionId: reg.session_id ?? "",
    successUrl: `${origin}/room/${token}?purchased=1`,
    cancelUrl: `${origin}/room/${token}`,
  });

  return Response.json({ url: result.url, amountCents });
}
