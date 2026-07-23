import { createDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = createDb();

/** Dev-only offer event counts, for e2e assertions. ?offer=<id> */
export async function GET(req: Request) {
  const expected = process.env.DEV_SEED_TOKEN;
  if (!expected || req.headers.get("x-seed-token") !== expected) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const offerId = new URL(req.url).searchParams.get("offer");
  if (!offerId) return Response.json({ error: "bad_request" }, { status: 400 });

  const rows = await sql<{ event_type: string; count: string }[]>`
    select event_type, count(*)::text as count
    from offer_events where offer_id = ${offerId}
    group by event_type
  `;
  const counts: Record<string, number> = { impression: 0, click: 0, purchase: 0 };
  for (const r of rows) counts[r.event_type] = Number(r.count);

  const offers = await sql<{ units_sold: number }[]>`
    select units_sold from offers where id = ${offerId} limit 1
  `;
  return Response.json({ counts, unitsSold: offers[0]?.units_sold ?? 0 });
}
