"use client";

/**
 * Live offer price ticks (spec §9). Server-sent events from our own app —
 * see apps/web/app/api/offers/[id]/stream/route.ts for why this is SSE and
 * not Supabase Realtime on this infrastructure.
 */
export function subscribeOfferTicks(
  offerIds: string[],
  onUnitsSold: (offerId: string, unitsSold: number) => void,
): () => void {
  const sources = offerIds.map((id) => {
    const es = new EventSource(`/api/offers/${id}/stream`);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { unitsSold?: number };
        if (typeof data.unitsSold === "number") onUnitsSold(id, data.unitsSold);
      } catch {
        // malformed frame — ignore
      }
    };
    return es;
  });
  return () => sources.forEach((es) => es.close());
}
