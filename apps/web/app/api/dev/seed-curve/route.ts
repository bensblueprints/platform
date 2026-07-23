import { createDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = createDb();

/**
 * Dev-only attendance curve config. Query params:
 *   webinar (slug, default "demo"), peak (int), ramp (minutes),
 *   plateau (0-1), end (0-1), jitter (0-1), show_count (true|false)
 * Omitted curve params keep existing values (or table defaults).
 */
export async function GET(req: Request) {
  const expected = process.env.DEV_SEED_TOKEN;
  if (!expected || req.headers.get("x-seed-token") !== expected) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const q = new URL(req.url).searchParams;
  const slug = q.get("webinar") ?? "demo";

  const webinars = await sql<{ id: string }[]>`
    select id from webinars where slug = ${slug} limit 1
  `;
  const webinar = webinars[0];
  if (!webinar) return Response.json({ error: "unknown_webinar" }, { status: 404 });

  const num = (key: string) => (q.get(key) === null ? null : Number(q.get(key)));

  await sql`
    insert into attendance_curves (webinar_id, peak_count, ramp_minutes, plateau_pct, end_pct, jitter_pct)
    values (
      ${webinar.id},
      coalesce(${num("peak")}, 240),
      coalesce(${num("ramp")}, 8),
      coalesce(${num("plateau")}, 0.55),
      coalesce(${num("end")}, 0.35),
      coalesce(${num("jitter")}, 0.03)
    )
    on conflict (webinar_id) do update set
      peak_count = coalesce(${num("peak")}, attendance_curves.peak_count),
      ramp_minutes = coalesce(${num("ramp")}, attendance_curves.ramp_minutes),
      plateau_pct = coalesce(${num("plateau")}, attendance_curves.plateau_pct),
      end_pct = coalesce(${num("end")}, attendance_curves.end_pct),
      jitter_pct = coalesce(${num("jitter")}, attendance_curves.jitter_pct)
  `;

  const showCount = q.get("show_count");
  if (showCount !== null) {
    await sql`update webinars set show_attendee_count = ${showCount === "true"} where id = ${webinar.id}`;
  }

  const row = await sql`select * from attendance_curves where webinar_id = ${webinar.id} limit 1`;
  return Response.json({ curve: row[0] ?? null, showAttendeeCount: showCount });
}
