import { getSharedDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Interim admin auth: ADMIN_KEY env (real auth lands with the tenant spec). */
export async function GET(req: Request) {
  const key = process.env.ADMIN_KEY;
  if (!key || req.headers.get("x-admin-key") !== key) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const rows = await sql`
    select id, slug, title, schedule_mode from webinars order by created_at asc
  `;
  return Response.json({ webinars: rows });
}
