"use client";

import { useEffect, useRef, useState } from "react";
import type { OfferPayload, RoomPayload } from "@platform/core";
import { offsetSeconds } from "@platform/timeline";
import { currentPriceCents, nextPriceCents } from "@platform/offers";
import { ChatRail, StatusBar, OfferPanel } from "@platform/room-ui";
import { clock } from "../lib/clock";
import { subscribeOfferTicks } from "../lib/realtime";
import Player from "./Player";

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function RoomClient({ payload, token }: { payload: RoomPayload; token: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [joined, setJoined] = useState(false);
  const [offers, setOffers] = useState<OfferPayload[]>(payload.offers);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [offset, setOffset] = useState(() =>
    offsetSeconds(payload.session.startsAtMs, payload.serverNowMs),
  );

  useEffect(() => {
    clock.start();
    return () => clock.stop();
  }, []);

  useEffect(() => {
    const t = setInterval(
      () => setOffset(offsetSeconds(payload.session.startsAtMs, clock.nowMs())),
      1000,
    );
    return () => clearInterval(t);
  }, [payload.session.startsAtMs]);

  // Live price ticks (spec §9): a purchase lands → every open room recomputes.
  useEffect(() => {
    return subscribeOfferTicks(offers.map((o) => o.id), (offerId, unitsSold) => {
      setOffers((prev) =>
        prev.map((o) => {
          if (o.id !== offerId) return o;
          const ladder = {
            priceStartCents: o.priceStartCents,
            priceIncrementCents: o.priceIncrementCents,
            priceCapCents: o.priceCapCents,
          };
          return {
            ...o,
            unitsSold,
            currentPriceCents:
              o.priceStartCents == null ? null : currentPriceCents(ladder, unitsSold),
            nextPriceCents: o.priceStartCents == null ? null : nextPriceCents(ladder, unitsSold),
          };
        }),
      );
    });
  }, []);

  async function join() {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, offsetSeconds(payload.session.startsAtMs, clock.nowMs()));
    await v.play();
    setJoined(true);
  }

  async function checkout(offerId: string) {
    setCheckoutError(null);
    const res = await fetch(`/api/offers/${offerId}/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setCheckoutError(
      body.error === "payments_not_configured"
        ? "Checkout is not configured yet."
        : "This offer is not available right now.",
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
      <StatusBar
        title={payload.webinar.title}
        showCount={payload.webinar.showAttendeeCount}
        offsetSeconds={offset}
        durationSeconds={payload.webinar.durationSeconds}
        curve={payload.webinar.curve}
        seed={payload.session.seed}
      />
      <div className="grid flex-1 gap-4 md:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          <Player
            videoUrl={payload.webinar.videoUrl ?? ""}
            videoRef={videoRef}
            title={payload.webinar.title}
          />
          {!joined ? (
            <button
              onClick={join}
              className="rounded-lg bg-red-600 px-6 py-3 text-lg font-semibold transition-colors hover:bg-red-500"
            >
              Join the session
            </button>
          ) : (
            <p className="font-mono text-sm text-zinc-400" data-testid="offset-readout">
              {fmt(offset)} / {fmt(payload.webinar.durationSeconds)}
            </p>
          )}
          {offers.map((o) => (
            <OfferPanel
              key={o.id}
              offer={o}
              offsetSeconds={offset}
              sessionId={payload.session.id}
              registrantToken={token}
              onCheckout={checkout}
            />
          ))}
          {checkoutError && (
            <p role="alert" className="rounded bg-red-950/60 px-3 py-2 text-sm text-red-200">
              {checkoutError}
            </p>
          )}
        </div>
        <ChatRail lines={payload.chat} offsetSeconds={offset} />
      </div>
    </main>
  );
}
