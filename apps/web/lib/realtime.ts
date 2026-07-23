"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key);
  return client;
}

/**
 * Subscribe to units_sold changes on the offers table (spec §9: price
 * visibly ticks up mid-session). Returns an unsubscribe function.
 */
export function subscribeOfferTicks(
  onUnitsSold: (offerId: string, unitsSold: number) => void,
): () => void {
  const supabase = getSupabaseBrowser();
  if (!supabase) return () => {};

  const channel = supabase
    .channel("offer-ticks")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "offers" },
      (payload) => {
        const row = payload.new as { id?: string; units_sold?: number };
        if (row.id && typeof row.units_sold === "number") onUnitsSold(row.id, row.units_sold);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
