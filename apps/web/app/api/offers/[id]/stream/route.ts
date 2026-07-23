import {  getSharedDb  } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/**
 * Server-sent events stream of an offer's units_sold (spec §9 price ticks).
 *
 * NOTE: the spec names Supabase Realtime for this push. The Coolify Supabase
 * template's Kong gateway on this box redirects every API route (including
 * /realtime/v1/websocket) to /login — verified 2026-07-23 — so browser →
 * Realtime is not viable on this infrastructure. This endpoint delivers the
 * identical visible behavior over our own HTTPS: the server watches the row
 * and pushes changes; the client recomputes the ladder (same as it would on
 * a Realtime event). If Kong is ever fixed, swap the transport back.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let last = -1;
      while (!closed) {
        try {
          const rows = await sql<{ units_sold: number }[]>`
            select units_sold from offers where id = ${id} limit 1
          `;
          const unitsSold = rows[0]?.units_sold ?? 0;
          if (unitsSold !== last) {
            last = unitsSold;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ unitsSold })}\n\n`));
          }
        } catch {
          // transient db error — keep the stream alive
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
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}
