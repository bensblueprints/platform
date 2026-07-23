import { getSharedDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

function authorized(req: Request): boolean {
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  const url = new URL(req.url);
  return req.headers.get("x-admin-key") === key || url.searchParams.get("key") === key;
}

/**
 * Moderator unified inbox stream (SSE, spec §11): every real message for
 * the webinar with attendee name, join offset, and current offset.
 * Interim auth: ADMIN_KEY env (real auth lands with the tenant spec).
 */
export async function GET(req: Request) {
  if (!authorized(req)) return new Response("not found", { status: 404 });

  const webinarId = new URL(req.url).searchParams.get("webinar_id");
  if (!webinarId) return new Response("bad request", { status: 400 });

  const encoder = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => (closed = true));

  let lastTs = new Date(0).toISOString();
  const stream = new ReadableStream({
    async start(controller) {
      while (!closed) {
        try {
          const rows = await sql<any[]>`
            select m.id, m.session_id, m.registrant_id, m.author_type, m.body, m.broadcast,
                   m.created_at, r.first_name, r.email, s.starts_at
            from chat_messages m
            join sessions s on s.id = m.session_id
            left join registrants r on r.id = m.registrant_id
            where s.webinar_id = ${webinarId} and m.created_at >= ${lastTs}::timestamptz
            order by m.created_at asc
            limit 200
          `;
          for (const row of rows) {
            const payload = {
              ...row,
              attendeeOffsetSeconds: row.starts_at
                ? Math.max(0, Math.floor((Date.now() - new Date(row.starts_at).getTime()) / 1000))
                : null,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            lastTs = row.created_at;
          }
        } catch {
          // keep alive
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      controller.close();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
  });
}
