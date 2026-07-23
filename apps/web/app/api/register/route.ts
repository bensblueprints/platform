import {  getSharedDb, materializeRecurringSessions  } from "@platform/core";
import { nextJitSlotMs } from "@platform/timeline";
import { scheduleRegistrationNotifications } from "../../../lib/notifications";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/**
 * Public registration (spec §11): creates the registrant with a random
 * access token, assigns a session per schedule mode (§10).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    slug?: string;
    email?: string;
    firstName?: string;
    phone?: string;
    timezone?: string;
    utm?: Record<string, string>;
  };
  const slug = body.slug ?? "";
  const email = (body.email ?? "").trim().toLowerCase();
  if (!slug || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const webinars = await sql<any[]>`
    select * from webinars where slug = ${slug} limit 1
  `;
  const w = webinars[0];
  if (!w) return Response.json({ error: "not_found" }, { status: 404 });

  let timezone = body.timezone ?? "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    timezone = "UTC";
  }

  let sessionId: string | null = null;

  if (w.schedule_mode === "jit") {
    const slotMs = nextJitSlotMs(Date.now(), w.jit_interval_minutes ?? 15, w.jit_lead_minutes ?? 5);
    await sql`
      insert into sessions (webinar_id, starts_at, seed)
      values (${w.id}, ${new Date(slotMs).toISOString()}, floor(random() * 2147483647))
      on conflict (webinar_id, starts_at) do nothing
    `;
    const rows = await sql<{ id: string }[]>`
      select id from sessions where webinar_id = ${w.id} and starts_at = ${new Date(slotMs).toISOString()} limit 1
    `;
    sessionId = rows[0]?.id ?? null;
  } else if (w.schedule_mode === "recurring") {
    let rows = await sql<{ id: string }[]>`
      select id from sessions where webinar_id = ${w.id} and starts_at >= now()
      order by starts_at asc limit 1
    `;
    if (rows.length === 0) {
      await materializeRecurringSessions(sql);
      rows = await sql<{ id: string }[]>`
        select id from sessions where webinar_id = ${w.id} and starts_at >= now()
        order by starts_at asc limit 1
      `;
    }
    sessionId = rows[0]?.id ?? null;
  }
  // ondemand: session is created lazily on first room hit (existing behavior)

  const token = crypto.randomUUID();
  const inserted = await sql<{ id: string }[]>`
    insert into registrants (webinar_id, session_id, email, first_name, phone, timezone, utm, access_token)
    values (
      ${w.id}, ${sessionId}, ${email}, ${body.firstName ?? null}, ${body.phone ?? null},
      ${timezone}, ${body.utm ? sql.json(body.utm) : null}, ${token}
    )
    returning id
  `;

  let startsAtMs: number | null = null;
  if (sessionId) {
    const s = await sql<{ starts_at: Date }[]>`
      select starts_at from sessions where id = ${sessionId} limit 1
    `;
    startsAtMs = s[0] ? s[0].starts_at.getTime() : null;
  }

  await scheduleRegistrationNotifications({
    registrantId: inserted[0].id,
    email,
    firstName: body.firstName ?? null,
    webinarTitle: w.title,
    startsAtMs,
    durationSeconds: w.duration_seconds,
    joinUrl: `/room/${token}`,
  }).catch((err) => console.error("[notify] scheduling failed:", err));

  return Response.json({
    token,
    joinUrl: `/room/${token}`,
    confirmedUrl: `/w/${slug}/confirmed?token=${token}`,
  });
}
