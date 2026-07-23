import { createDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = createDb();

/**
 * Dev-only demo offer seed. Query: ?webinar=<slug> (default demo),
 * &start=<seconds> (default 10). Upserts by name 'Demo Offer'.
 */
export async function GET(req: Request) {
  const expected = process.env.DEV_SEED_TOKEN;
  if (!expected || req.headers.get("x-seed-token") !== expected) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const q = new URL(req.url).searchParams;
  const slug = q.get("webinar") ?? "demo";
  const start = Number(q.get("start") ?? 10);

  const webinars = await sql<{ id: string }[]>`
    select id from webinars where slug = ${slug} limit 1
  `;
  const webinar = webinars[0];
  if (!webinar) return Response.json({ error: "unknown_webinar" }, { status: 404 });

  // update-first, insert-if-missing: idempotent across repeated seeds.
  // Dev semantics: re-seeding resets the ladder and its event log.
  await sql`delete from offer_events where offer_id in (select id from offers where webinar_id = ${webinar.id} and name = 'Demo Offer')`;
  const updated = await sql`
    update offers set
      start_offset_seconds = ${start},
      urgency_enabled = true, urgency_seconds = 600,
      scarcity_enabled = true, inventory_total = 25,
      price_start_cents = 10000, price_increment_cents = 500, price_cap_cents = 99700,
      units_sold = 0
    where webinar_id = ${webinar.id} and name = 'Demo Offer'
    returning id
  `;
  if (updated.length === 0) {
    await sql`
      insert into offers (
        webinar_id, name, headline, body, button_text,
        start_offset_seconds, end_offset_seconds,
        urgency_enabled, urgency_seconds, scarcity_enabled, inventory_total,
        price_start_cents, price_increment_cents, price_cap_cents
      ) values (
        ${webinar.id}, 'Demo Offer', 'The One Time Suite', 'Everything from today''s session, packaged.', 'Get the Suite',
        ${start}, null,
        true, 600, true, 25,
        10000, 500, 99700
      )
    `;
  }

  const rows = await sql<{ id: string; units_sold: number }[]>`
    select id, units_sold from offers where webinar_id = ${webinar.id} and name = 'Demo Offer' limit 1
  `;
  return Response.json({ offerId: rows[0]?.id ?? null, unitsSold: rows[0]?.units_sold ?? 0 });
}
