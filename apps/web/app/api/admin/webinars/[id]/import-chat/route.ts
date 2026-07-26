import { getSharedDb } from "@platform/core";
import { isAdminAuthorized } from "../../../../../../lib/auth";
import { lintAttendeeLines, parseChatCsv } from "@platform/chat";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Admin CSV import (same parser as the dev endpoint; session/key auth). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthorized(req))) return Response.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  const url = new URL(req.url);
  const replace = url.searchParams.get("replace") === "1";

  const webinars = await sql<{ id: string }[]>`
    select id from webinars where id = ${id}::uuid limit 1
  `;
  if (!webinars[0]) return Response.json({ error: "unknown_webinar" }, { status: 404 });

  const text = await req.text();
  const { rows, errors } = parseChatCsv(text);
  if (errors.length > 0) {
    return Response.json({ imported: 0, errors }, { status: 422 });
  }
  if (rows.length === 0) {
    return Response.json({ imported: 0, errors: [{ row: 0, reason: "No chat lines found" }] }, { status: 422 });
  }

  const warnings = lintAttendeeLines(rows);

  await sql.begin(async (tx) => {
    if (replace) await tx`delete from chat_scripts where webinar_id = ${id}::uuid`;
    for (const r of rows) {
      await tx`
        insert into chat_scripts (webinar_id, offset_seconds, display_name, role, message, mode, sort_order, source, status)
        values (${id}::uuid, ${r.offset_seconds}, ${r.display_name}, ${r.role}, ${r.message}, ${r.mode}, ${r.sort_order}, 'imported', 'live')
      `;
    }
  });

  return Response.json({ imported: rows.length, warnings, errors: [] });
}
