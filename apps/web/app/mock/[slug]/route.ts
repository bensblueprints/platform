import { redirect } from "next/navigation";
import { getSharedDb } from "@platform/core";
import { getScopedUser, canAccessWebinar } from "../../../lib/auth";

export const dynamic = "force-dynamic";

/**
 * Mock webinar (owner only): spins up a throwaway viewer with a fresh
 * session starting now, so the script can be reviewed from second 0
 * without registering. /mock/<slug> → redirect into the room.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return new Response("not found", { status: 404 });
  const { slug } = await params;

  const sql = getSharedDb();
  const webinars = await sql<{ id: string }[]>`
    select id from webinars where slug = ${slug} limit 1
  `;
  const w = webinars[0];
  if (!w || !(await canAccessWebinar(sql, scopedUser, w.id))) {
    return new Response("not found", { status: 404 });
  }

  const token = crypto.randomUUID();
  const session = await sql<{ id: string }[]>`
    insert into sessions (webinar_id, starts_at, seed)
    values (${w.id}, now(), floor(random() * 2147483647))
    returning id
  `;
  await sql`
    insert into registrants (webinar_id, session_id, email, first_name, access_token)
    values (${w.id}, ${session[0].id}, ${`mock+${Date.now()}@mock.webinar`}, 'Mock Viewer', ${token})
  `;

  redirect(`/room/${token}`);
}
