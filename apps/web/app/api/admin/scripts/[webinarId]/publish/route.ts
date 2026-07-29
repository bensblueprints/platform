import { getSharedDb } from "@platform/core";
import { getScopedUser, canAccessWebinar } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/**
 * Publish a draft script (spec §7.7: generation output is a draft, never
 * auto-published). Replaces the webinar's entire live script with the draft
 * in one transaction.
 */
export async function POST(req: Request, { params }: { params: Promise<{ webinarId: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });
  const { webinarId } = await params;
  if (!(await canAccessWebinar(sql, scopedUser, webinarId))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const result = await sql.begin(async (tx) => {
    const drafts = await tx`
      select count(*)::int as c from chat_scripts where webinar_id = ${webinarId}::uuid and status = 'draft'
    `;
    if (drafts[0].c === 0) return { published: 0 };
    await tx`delete from chat_scripts where webinar_id = ${webinarId}::uuid and status = 'live'`;
    await tx`update chat_scripts set status = 'live' where webinar_id = ${webinarId}::uuid and status = 'draft'`;
    return { published: drafts[0].c };
  });

  return Response.json(result);
}
