import { createDb } from "@platform/core";

export const dynamic = "force-dynamic";

const DEMO_VIDEO_URL =
  "https://archive.org/download/1968-night-of-the-living-dead/Night%20of%20the%20Living%20Dead%20(1968)%20English.mp4";
const DEMO_DURATION_SECONDS = 5752;

const sql = createDb();

/**
 * Dev-only seed: upserts a webinar (idempotent) plus a fresh registrant,
 * and returns its join URL. Query: ?webinar=<slug> (default "demo") so e2e
 * specs can run against isolated webinars in parallel.
 * Disabled unless DEV_SEED_TOKEN is set and presented as x-seed-token header.
 */
export async function GET(req: Request) {
  const expected = process.env.DEV_SEED_TOKEN;
  if (!expected || req.headers.get("x-seed-token") !== expected) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const slug = new URL(req.url).searchParams.get("webinar") ?? "demo";
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) {
    return Response.json({ error: "bad_slug" }, { status: 400 });
  }

  await sql`
    insert into webinars (slug, title, broadcast_mode, schedule_mode, duration_seconds, video_url)
    values (${slug}, ${slug === "demo" ? "Demo Webinar" : `E2E ${slug}`}, 'evergreen', 'ondemand', ${DEMO_DURATION_SECONDS}, ${DEMO_VIDEO_URL})
    on conflict (slug) do update
      set video_url = excluded.video_url, duration_seconds = excluded.duration_seconds
  `;
  const rows = await sql<{ id: string }[]>`
    select id from webinars where slug = ${slug} limit 1
  `;

  const token = crypto.randomUUID();
  await sql`
    insert into registrants (webinar_id, email, first_name, access_token)
    values (${rows[0].id}, ${"smoke-" + Date.now() + "@example.com"}, 'Smoke', ${token})
  `;

  return Response.json({ joinUrl: "/room/" + token, token, webinarSlug: slug });
}
