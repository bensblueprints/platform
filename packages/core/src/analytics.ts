import type { Sql } from "./db";

export interface RetentionPoint {
  offsetSeconds: number;
  present: number;
}

export interface OfferFunnel {
  offerId: string;
  name: string;
  startOffsetSeconds: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenueCents: number;
}

export interface WebinarAnalytics {
  visitors: number;
  registrants: number;
  attendees: number;
  showRatePct: number;
  retention: RetentionPoint[];
  offers: OfferFunnel[];
  revenueCents: number;
  revenuePerRegistrantCents: number;
  revenuePerAttendeeCents: number;
}

/** Funnel + retention (spec §11). Retention buckets: 30s. */
export async function getWebinarAnalytics(sql: Sql, webinarId: string): Promise<WebinarAnalytics> {
  const [visitors] = await sql<{ c: number }[]>`
    select count(*)::int as c from page_views where webinar_id = ${webinarId}
  `;
  const [registrants] = await sql<{ c: number }[]>`
    select count(*)::int as c from registrants where webinar_id = ${webinarId}
  `;
  const [attendees] = await sql<{ c: number }[]>`
    select count(distinct a.registrant_id)::int as c
    from attendances a join sessions s on s.id = a.session_id
    where s.webinar_id = ${webinarId}
  `;

  const attRows = await sql<
    {
      join_offset_seconds: number;
      exit_offset_seconds: number | null;
      joined_at: Date;
      last_heartbeat_at: Date | null;
    }[]
  >`
    select a.join_offset_seconds, a.exit_offset_seconds, a.joined_at, a.last_heartbeat_at
    from attendances a join sessions s on s.id = a.session_id
    where s.webinar_id = ${webinarId}
  `;

  const buckets = new Map<number, number>();
  for (const row of attRows) {
    const start = row.join_offset_seconds;
    let end = row.exit_offset_seconds;
    if (end == null) {
      end = row.last_heartbeat_at
        ? start +
          Math.max(0, Math.floor((row.last_heartbeat_at.getTime() - row.joined_at.getTime()) / 1000))
        : start;
    }
    for (let b = Math.floor(start / 30) * 30; b <= end; b += 30) {
      buckets.set(b, (buckets.get(b) ?? 0) + 1);
    }
  }
  const retention = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([offsetSeconds, present]) => ({ offsetSeconds, present }));

  const offerRows = await sql<{ id: string; name: string; start_offset_seconds: number }[]>`
    select id, name, start_offset_seconds from offers where webinar_id = ${webinarId} order by created_at asc
  `;
  const offers: OfferFunnel[] = [];
  for (const o of offerRows) {
    const ev = await sql<{ event_type: string; c: number; revenue: number }[]>`
      select event_type, count(*)::int as c, coalesce(sum(amount_cents), 0)::int as revenue
      from offer_events where offer_id = ${o.id}
      group by event_type
    `;
    const byType = Object.fromEntries(ev.map((e) => [e.event_type, e]));
    offers.push({
      offerId: o.id,
      name: o.name,
      startOffsetSeconds: o.start_offset_seconds,
      impressions: byType.impression?.c ?? 0,
      clicks: byType.click?.c ?? 0,
      purchases: byType.purchase?.c ?? 0,
      revenueCents: byType.purchase?.revenue ?? 0,
    });
  }

  const revenueCents = offers.reduce((sum, o) => sum + o.revenueCents, 0);
  return {
    visitors: visitors.c,
    registrants: registrants.c,
    attendees: attendees.c,
    showRatePct: registrants.c === 0 ? 0 : Math.round((attendees.c / registrants.c) * 100),
    retention,
    offers,
    revenueCents,
    revenuePerRegistrantCents: registrants.c === 0 ? 0 : Math.round(revenueCents / registrants.c),
    revenuePerAttendeeCents: attendees.c === 0 ? 0 : Math.round(revenueCents / attendees.c),
  };
}
