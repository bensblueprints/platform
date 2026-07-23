import { createDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = createDb();

const DEMO_VIDEO_URL =
  "https://archive.org/download/1968-night-of-the-living-dead/Night%20of%20the%20Living%20Dead%20(1968)%20English.mp4";

/**
 * Dev-only webinar factory for schedule tests. Query params:
 *   slug (required), mode (jit|recurring|ondemand), interval, lead,
 *   days (comma 0-6), times (comma HH:MM), tz (IANA)
 */
export async function GET(req: Request) {
  const expected = process.env.DEV_SEED_TOKEN;
  if (!expected || req.headers.get("x-seed-token") !== expected) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const q = new URL(req.url).searchParams;
  const slug = q.get("slug");
  const mode = q.get("mode") ?? "ondemand";
  if (!slug || !/^[a-z0-9-]{1,64}$/.test(slug) || !["jit", "recurring", "ondemand"].includes(mode)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const days = q.get("days") ? q.get("days")!.split(",").map(Number) : null;
  const times = q.get("times") ? q.get("times")!.split(",") : null;

  const existing = await sql<{ id: string }[]>`
    select id from webinars where slug = ${slug} limit 1
  `;
  if (q.get("reset") === "1" && existing[0]) {
    await sql`delete from sessions where webinar_id = ${existing[0].id}`;
  }

  await sql`
    insert into webinars (
      slug, title, broadcast_mode, schedule_mode, duration_seconds, video_url,
      jit_interval_minutes, jit_lead_minutes, recurring_days, recurring_times, timezone
    ) values (
      ${slug}, ${"E2E " + slug}, 'evergreen', ${mode}, 5752, ${DEMO_VIDEO_URL},
      ${Number(q.get("interval") ?? 15)}, ${Number(q.get("lead") ?? 5)},
      ${days}, ${times}, ${q.get("tz") ?? "UTC"}
    )
    on conflict (slug) do update set
      schedule_mode = excluded.schedule_mode,
      jit_interval_minutes = excluded.jit_interval_minutes,
      jit_lead_minutes = excluded.jit_lead_minutes,
      recurring_days = excluded.recurring_days,
      recurring_times = excluded.recurring_times,
      timezone = excluded.timezone
  `;

  const rows = await sql<{ id: string }[]>`
    select id from webinars where slug = ${slug} limit 1
  `;
  return Response.json({ slug, mode, webinarId: rows[0]?.id ?? null });
}
