import { getSharedDb } from "@platform/core";
import { getScopedUser, canAccessWebinar } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Registrant list with attendance (names + emails for follow-up sequences).
 * JSON by default; ?download=1 for CSV. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  if (!(await canAccessWebinar(sql, scopedUser, id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const rows = await sql<any[]>`
    select r.email, r.first_name, r.phone, r.timezone, r.registered_at, r.utm,
           s.starts_at as session_starts_at,
           count(a.id)::int as joins,
           max(case when a.exit_offset_seconds is not null
                then a.exit_offset_seconds - a.join_offset_seconds end)::int as seconds_watched
    from registrants r
    left join sessions s on s.id = r.session_id
    left join attendances a on a.registrant_id = r.id
    where r.webinar_id = ${id}::uuid
    group by r.id, s.starts_at
    order by r.registered_at desc
  `;

  if (new URL(req.url).searchParams.get("download")) {
    const lines = [
      "Email,First Name,Phone,Timezone,Registered At,Session Start,Attended,Seconds Watched,UTM Source,UTM Medium,UTM Campaign",
    ];
    for (const r of rows) {
      const utm = (r.utm ?? {}) as Record<string, string>;
      lines.push(
        [
          csvEscape(r.email),
          csvEscape(r.first_name ?? ""),
          csvEscape(r.phone ?? ""),
          csvEscape(r.timezone ?? ""),
          r.registered_at ? new Date(r.registered_at).toISOString() : "",
          r.session_starts_at ? new Date(r.session_starts_at).toISOString() : "",
          r.joins > 0 ? "yes" : "no",
          r.seconds_watched ?? "",
          csvEscape(utm.utm_source ?? ""),
          csvEscape(utm.utm_medium ?? ""),
          csvEscape(utm.utm_campaign ?? ""),
        ].join(","),
      );
    }
    return new Response(lines.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="registrants.csv"',
      },
    });
  }

  return Response.json({ registrants: rows });
}
