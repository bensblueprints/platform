import {  getSharedDb  } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

const DEMO_NAMES = [
  "Marcus T.", "Jess R.", "Tom W.", "Priya K.", "Dan M.", "Alisha B.", "Rob S.", "Nina P.",
  "Chris D.", "Fatima A.", "Greg L.", "Monica V.", "Sam O.", "Kelly N.", "Andre C.", "Becca F.",
  "Omar Z.", "Tina G.", "Will J.", "Sofia E.", "Hank B.", "Dana Q.", "Leo M.", "Rita S.",
  "Vince P.", "Carmen D.", "Joel T.", "Ayesha R.", "Brad K.", "Elena V.",
];

/**
 * Dev-only roster seed. Query: ?webinar=<slug> (default demo), &reset=1
 * to replace existing roster rows. Idempotent without reset: no-op when
 * the webinar already has a roster.
 */
export async function GET(req: Request) {
  const expected = process.env.DEV_SEED_TOKEN;
  if (!expected || req.headers.get("x-seed-token") !== expected) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("webinar") ?? "demo";
  const reset = url.searchParams.get("reset") === "1";

  const webinars = await sql<{ id: string }[]>`
    select id from webinars where slug = ${slug} limit 1
  `;
  const webinar = webinars[0];
  if (!webinar) return Response.json({ error: "unknown_webinar" }, { status: 404 });

  const existing = await sql<{ count: string }[]>`
    select count(*)::text as count from name_roster where webinar_id = ${webinar.id}
  `;
  if (!reset && Number(existing[0].count) > 0) {
    return Response.json({ seeded: 0, rosterSize: Number(existing[0].count), note: "roster exists" });
  }

  await sql.begin(async (tx) => {
    if (reset) await tx`delete from name_roster where webinar_id = ${webinar.id}`;
    for (const name of DEMO_NAMES) {
      await tx`insert into name_roster (webinar_id, display_name) values (${webinar.id}, ${name})`;
    }
  });

  return Response.json({ seeded: DEMO_NAMES.length, rosterSize: DEMO_NAMES.length });
}
