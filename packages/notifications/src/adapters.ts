import type { Sql } from "@platform/core";

export interface NotificationPayload {
  registrantId: string;
  kind: string;
  email: string;
  firstName: string | null;
  webinarTitle: string;
  startsAtMs: number | null;
  joinUrl: string;
}

export interface NotificationAdapter {
  name: string;
  send(sql: Sql, payload: NotificationPayload): Promise<void>;
}

/** Always-on adapter: records every send in notifications_log. */
export const logAdapter: NotificationAdapter = {
  name: "log",
  async send(sql, payload) {
    await sql`
      insert into notifications_log (registrant_id, kind, channel, payload)
      values (${payload.registrantId}, ${payload.kind}, 'log', ${sql.json(payload as any)})
    `;
  },
};

/** GoHighLevel: contact upsert + tag (spec §11 recommended default). Active only with env keys. */
export const ghlAdapter: NotificationAdapter = {
  name: "ghl",
  async send(_sql, payload) {
    const apiKey = process.env.GHL_API_KEY;
    const locationId = process.env.GHL_LOCATION_ID;
    if (!apiKey || !locationId) return; // inactive without keys
    const res = await fetch("https://services.leadconnectorhq.com/contacts/upsert", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        version: "2021-07-28",
      },
      body: JSON.stringify({
        locationId,
        email: payload.email,
        firstName: payload.firstName ?? undefined,
        tags: [`webinar-${payload.kind}`],
      }),
    });
    if (!res.ok) throw new Error(`ghl upsert failed: ${res.status}`);
  },
};

export function activeAdapters(): NotificationAdapter[] {
  const adapters: NotificationAdapter[] = [logAdapter];
  if (process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID) adapters.push(ghlAdapter);
  return adapters;
}
