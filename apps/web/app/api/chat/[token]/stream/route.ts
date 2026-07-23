import { getSharedDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/**
 * Attendee's real-chat stream (SSE): their own messages plus moderator
 * broadcasts (any active session of the webinar, §6.1) and moderator
 * private replies addressed to them. Timestamp cursor with a small overlap;
 * the client dedupes by message id. Transport: SSE, not Supabase Realtime —
 * see slice 5 design doc.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const regs = await sql<{ id: string; session_id: string; webinar_id: string }[]>`
    select id, session_id, webinar_id from registrants where access_token = ${token} limit 1
  `;
  const reg = regs[0];
  if (!reg) return new Response("not found", { status: 404 });

  const encoder = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => (closed = true));

  let lastTs = new Date(0).toISOString();
  const stream = new ReadableStream({
    async start(controller) {
      while (!closed) {
        try {
          const rows = await sql<any[]>`
            select m.id, m.author_type, m.body, m.broadcast, m.created_at, r.first_name
            from chat_messages m
            left join registrants r on r.id = m.registrant_id
            join sessions s on s.id = m.session_id
            where m.created_at >= ${lastTs}::timestamptz
              and (
                m.registrant_id = ${reg.id}
                or (m.broadcast = true and m.author_type = 'moderator' and s.webinar_id = ${reg.webinar_id})
              )
            order by m.created_at asc
            limit 100
          `;
          for (const row of rows) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(row)}\n\n`));
            lastTs = row.created_at;
          }
        } catch {
          // keep the stream alive through transient errors
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
