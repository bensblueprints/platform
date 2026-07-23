import {  getSharedDb  } from "@platform/core";
import { lintAttendeeLines, parseChatCsv } from "@platform/chat";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/**
 * Dev-only chat script import (admin UI lands in a later slice).
 * POST body = raw CSV text (EverWebinar 7-column schema, .txt compatible).
 * Query: ?webinar=<slug> (default "demo"), &reset=1 to replace the script.
 * Atomic: any row error rejects the whole file with all row errors.
 */
export async function POST(req: Request) {
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

  const text = await req.text();
  const { rows, errors } = parseChatCsv(text);
  if (errors.length > 0) {
    return Response.json({ imported: 0, errors }, { status: 422 });
  }
  if (rows.length === 0) {
    return Response.json(
      { imported: 0, errors: [{ row: 0, reason: "No chat lines found" }] },
      { status: 422 },
    );
  }

  const warnings = lintAttendeeLines(rows);

  await sql.begin(async (tx) => {
    if (reset) await tx`delete from chat_scripts where webinar_id = ${webinar.id}`;
    for (const r of rows) {
      await tx`
        insert into chat_scripts (webinar_id, offset_seconds, display_name, role, message, mode, sort_order)
        values (${webinar.id}, ${r.offset_seconds}, ${r.display_name}, ${r.role}, ${r.message}, ${r.mode}, ${r.sort_order})
      `;
    }
  });

  return Response.json({ imported: rows.length, warnings, errors: [] });
}
