import { createDb } from "@platform/core";
import { parseCheckoutCompleted, verifyWebhookSignature } from "@platform/offers";

export const dynamic = "force-dynamic";

const sql = createDb();

/**
 * Stripe webhook (spec §9, §16.4/16.5): checkout.session.completed is the
 * ONLY path that increments units_sold. Idempotent via the unique
 * stripe_session_id constraint on offer_events.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "payments_not_configured" }, { status: 503 });

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  const valid = await verifyWebhookSignature(rawBody, signature, secret);
  if (!valid) return Response.json({ error: "invalid_signature" }, { status: 400 });

  const parsed = parseCheckoutCompleted(JSON.parse(rawBody));
  if (!parsed) return Response.json({ ignored: true });

  const result = await sql.begin(async (tx) => {
    const inserted = await tx`
      insert into offer_events (offer_id, session_id, event_type, amount_cents, stripe_session_id)
      values (
        ${parsed.offerId},
        nullif(${parsed.sessionId}, '')::uuid,
        'purchase',
        ${parsed.amountCents},
        ${parsed.stripeSessionId}
      )
      on conflict (stripe_session_id) do nothing
      returning id
    `;
    if (inserted.length === 0) return { counted: false as const };

    const updated = await tx<{ units_sold: number }[]>`
      update offers set units_sold = units_sold + 1
      where id = ${parsed.offerId}
      returning units_sold
    `;
    return { counted: true as const, unitsSold: updated[0]?.units_sold };
  });

  return Response.json(result);
}
