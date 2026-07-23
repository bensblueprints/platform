export interface LadderConfig {
  priceStartCents: number | null;
  priceIncrementCents: number | null;
  priceCapCents: number | null;
}

/** Price ladder (spec §9): min(cap, start + increment * units_sold). */
export function currentPriceCents(o: LadderConfig, unitsSold: number): number {
  const start = o.priceStartCents ?? 0;
  const inc = o.priceIncrementCents ?? 0;
  const raw = start + inc * unitsSold;
  return o.priceCapCents == null ? raw : Math.min(o.priceCapCents, raw);
}

/**
 * The price after the next sale, for the honest "goes to $X after this
 * sale" display (§9). Null when increment is zero or the cap is reached.
 */
export function nextPriceCents(o: LadderConfig, unitsSold: number): number | null {
  const inc = o.priceIncrementCents ?? 0;
  if (inc === 0) return null;
  const current = currentPriceCents(o, unitsSold);
  if (o.priceCapCents != null && current >= o.priceCapCents) return null;
  return currentPriceCents(o, unitsSold + 1);
}

/** Remaining urgency seconds for one attendee (§9). Never negative. */
export function urgencyRemainingSeconds(
  urgencySeconds: number,
  attendeeStartedAtMs: number,
  nowMs: number,
): number {
  const elapsed = Math.floor((nowMs - attendeeStartedAtMs) / 1000);
  return Math.max(0, urgencySeconds - elapsed);
}

export type OfferWindowState = "upcoming" | "active" | "ended";

export function offerWindowState(
  w: { startOffsetSeconds: number; endOffsetSeconds: number | null },
  offsetSeconds: number,
): OfferWindowState {
  if (offsetSeconds < w.startOffsetSeconds) return "upcoming";
  if (w.endOffsetSeconds != null && offsetSeconds >= w.endOffsetSeconds) return "ended";
  return "active";
}
