"use client";

import { useEffect, useRef, useState } from "react";
import type { OfferPayload } from "@platform/core";
import { currentPriceCents, nextPriceCents, offerWindowState, urgencyRemainingSeconds } from "@platform/offers";

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
}

/**
 * Timed offer panel (spec §9, §13): mounts at the offer's start offset,
 * per-attendee urgency countdown persisted in localStorage, scarcity,
 * price ladder with live ticks, collapsible without pushing the video
 * out of the viewport. The panel entrance is the room's one big animation.
 */
export function OfferPanel({
  offer,
  offsetSeconds,
  sessionId,
  registrantToken,
  onCheckout,
}: {
  offer: OfferPayload;
  offsetSeconds: number;
  sessionId: string;
  registrantToken: string;
  onCheckout: (offerId: string) => void;
}) {
  const window = offerWindowState(
    { startOffsetSeconds: offer.startOffsetSeconds, endOffsetSeconds: offer.endOffsetSeconds },
    offsetSeconds,
  );
  const [collapsed, setCollapsed] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const impressionSent = useRef(false);
  const [unitsSold, setUnitsSold] = useState(offer.unitsSold);

  // keep local unitsSold in sync when the payload value changes (e.g. Realtime tick handled by parent)
  useEffect(() => setUnitsSold(offer.unitsSold), [offer.unitsSold]);

  // per-attendee urgency start, persisted (spec §9)
  useEffect(() => {
    if (window !== "active" || !offer.urgencyEnabled || !offer.urgencySeconds) return;
    const key = `urgency:${sessionId}:${offer.id}`;
    let startedAt = Number(localStorage.getItem(key) ?? 0);
    if (!startedAt) {
      startedAt = Date.now();
      localStorage.setItem(key, String(startedAt));
    }
    const tick = () => setRemaining(urgencyRemainingSeconds(offer.urgencySeconds!, startedAt, Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [window, offer.id, offer.urgencyEnabled, offer.urgencySeconds, sessionId]);

  // impression on first mount per attendee (spec §9)
  useEffect(() => {
    if (window !== "active" || impressionSent.current) return;
    impressionSent.current = true;
    void fetch(`/api/offers/${offer.id}/impression`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: registrantToken, offsetSeconds }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window, offer.id, registrantToken]);

  if (window !== "active") return null;

  const price = offer.currentPriceCents;
  const next = offer.nextPriceCents;
  const inventoryLeft =
    offer.scarcityEnabled && offer.inventoryTotal != null
      ? Math.max(0, offer.inventoryTotal - unitsSold)
      : null;

  return (
    <section
      data-testid="offer-panel"
      data-offer-id={offer.id}
      className="overflow-hidden rounded-lg border border-amber-400/40 bg-gradient-to-br from-zinc-900 to-zinc-800 shadow-2xl shadow-amber-400/10 animate-[offer-enter_500ms_ease-out]"
      aria-label="Special offer"
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-4 py-2 text-left"
        aria-expanded={!collapsed}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-300">
          {offer.name}
        </span>
        <span className="text-xs text-zinc-400">{collapsed ? "Show offer" : "Hide"}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          <h3 className="text-xl font-semibold text-white">{offer.headline}</h3>
          {offer.body && <p className="text-sm text-zinc-300">{offer.body}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {price != null && (
              <span data-testid="offer-price" className="text-2xl font-bold text-amber-300">
                {fmtMoney(price)}
              </span>
            )}
            {next != null && (
              <span className="text-xs text-zinc-400">goes to {fmtMoney(next)} after this sale</span>
            )}
            {inventoryLeft != null && (
              <span data-testid="offer-scarcity" className="text-xs font-medium text-red-300">
                {inventoryLeft} left
              </span>
            )}
            {remaining != null && (
              <span data-testid="offer-countdown" className="font-mono text-sm text-amber-200">
                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
              </span>
            )}
          </div>
          <button
            data-testid="offer-cta"
            onClick={() => onCheckout(offer.id)}
            className="rounded-lg bg-amber-400 px-5 py-3 text-center text-base font-bold text-zinc-950 transition-colors hover:bg-amber-300"
          >
            {offer.buttonText}
            {price != null ? ` — ${fmtMoney(price)}` : ""}
          </button>
        </div>
      )}
    </section>
  );
}
