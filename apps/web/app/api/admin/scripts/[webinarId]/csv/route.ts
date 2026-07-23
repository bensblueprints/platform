import { getSharedDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Draft script as the standard 7-column EverWebinar CSV (spec §7.2 stage 7). */
export async function GET(req: Request, { params }: { params: Promise<{ webinarId: string }> }) {
  const key = process.env.ADMIN_KEY;
  const url = new URL(req.url);
  if (!key || (req.headers.get("x-admin-key") !== key && url.searchParams.get("key") !== key)) {
    return new Response("not found", { status: 404 });
  }
  const { webinarId } = await params;

  const rows = await sql`
    select offset_seconds, display_name, role, message, mode
    from chat_scripts where webinar_id = ${webinarId}::uuid and status = 'draft'
    order by offset_seconds asc, sort_order asc
  `;

  const lines = ["Hour,Minute,Second,Name,Role,Message,Mode"];
  for (const r of rows as any[]) {
    const h = Math.floor(r.offset_seconds / 3600);
    const m = Math.floor((r.offset_seconds % 3600) / 60);
    const s = r.offset_seconds % 60;
    const role = r.role === "admin" ? "Admin" : "Attendee";
    lines.push([h, m, s, csvEscape(r.display_name), role, csvEscape(r.message), r.mode].join(","));
  }

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="chat-script.csv"',
    },
  });
}
