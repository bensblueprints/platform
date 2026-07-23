import { createDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = createDb();

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** .ics download for a registrant's session (spec §11). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rows = await sql<any[]>`
    select r.id as registrant_id, w.title, w.duration_seconds, s.starts_at
    from registrants r
    join webinars w on w.id = r.webinar_id
    join sessions s on s.id = r.session_id
    where r.access_token = ${token}
    limit 1
  `;
  const r = rows[0];
  if (!r) return new Response("not found", { status: 404 });

  const minutes = Math.round(r.duration_seconds / 60);
  const host = _req.headers.get("x-forwarded-host") ?? new URL(_req.url).host;
  const proto = _req.headers.get("x-forwarded-proto") ?? "https";
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Platform//Webinar//EN",
    "BEGIN:VEVENT",
    `UID:${r.registrant_id}@platform`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(new Date(r.starts_at))}`,
    `DURATION:PT${Math.floor(minutes / 60)}H${minutes % 60}M`,
    `SUMMARY:${r.title.replace(/[,;\\]/g, " ")}`,
    `URL:${proto}://${host}/room/${token}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="session.ics"',
    },
  });
}
