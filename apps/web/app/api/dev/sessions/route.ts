import { createDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = createDb();

/** Dev-only session listing for e2e assertions. ?webinar=<slug> */
export async function GET(req: Request) {
  const expected = process.env.DEV_SEED_TOKEN;
  if (!expected || req.headers.get("x-seed-token") !== expected) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const slug = new URL(req.url).searchParams.get("webinar") ?? "demo";
  const rows = await sql<{ id: string; starts_at: string; status: string }[]>`
    select s.id, s.starts_at, s.status
    from sessions s join webinars w on w.id = s.webinar_id
    where w.slug = ${slug}
    order by s.starts_at asc
    limit 100
  `;
  return Response.json({ count: rows.length, sessions: rows });
}
