import { getSharedDb } from "@platform/core";
import { isAdminAuthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

export async function GET(req: Request) {
  if (!(await isAdminAuthorized(req))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const rows = await sql`
    select id, slug, title, schedule_mode from webinars order by created_at asc
  `;
  return Response.json({ webinars: rows });
}

/** Create a webinar (owner dashboard). */
export async function POST(req: Request) {
  if (!(await isAdminAuthorized(req))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as any;
  const title = (body.title ?? "").trim();
  const mode = body.scheduleMode ?? "ondemand";
  if (!title || !["jit", "recurring", "ondemand"].includes(mode)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const slug =
    (body.slug ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") ||
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

  const days = Array.isArray(body.recurringDays) ? body.recurringDays.map(Number) : null;
  const times = Array.isArray(body.recurringTimes) ? body.recurringTimes : null;

  const inserted = await sql<{ id: string; slug: string }[]>`
    insert into webinars (
      slug, title, subtitle, broadcast_mode, schedule_mode, duration_seconds,
      jit_interval_minutes, jit_lead_minutes, recurring_days, recurring_times, timezone
    ) values (
      ${slug}, ${title}, ${body.subtitle ?? null}, 'evergreen', ${mode}, ${Number(body.durationSeconds ?? 3600)},
      ${Number(body.jitIntervalMinutes ?? 15)}, ${Number(body.jitLeadMinutes ?? 5)},
      ${days}, ${times}, ${body.timezone ?? "UTC"}
    )
    on conflict (slug) do nothing
    returning id, slug
  `;
  if (inserted.length === 0) {
    return Response.json({ error: "slug_taken" }, { status: 409 });
  }
  return Response.json({ id: inserted[0].id, slug: inserted[0].slug });
}
