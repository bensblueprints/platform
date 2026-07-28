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

/** Known logo domains for common press names; anything else guesses <name>.com. */
const BADGE_DOMAINS: Record<string, string> = {
  "product hunt": "producthunt.com",
  "yahoo finance": "finance.yahoo.com",
  hackernoon: "hackernoon.com",
  appsumo: "appsumo.com",
};

function badgeDomain(name: string): string {
  const key = name.trim().toLowerCase();
  return BADGE_DOMAINS[key] ?? `${key.replace(/[^a-z0-9]/g, "")}.com`;
}

/**
 * Press badge: a logo uploaded to the platform wins; then BrandFetch's Logo
 * Link when a client id is configured; otherwise a styled text pill.
 */
function PressBadge({
  webinarId,
  name,
  clientId,
}: {
  webinarId: string;
  name: string;
  clientId: string | null;
}) {
  const [stage, setStage] = useState<"local" | "brandfetch" | "pill">("local");
  if (stage === "pill") {
    return (
      <span className="rounded-full border border-zinc-600 px-3 py-1 text-xs font-medium uppercase tracking-wide text-zinc-300">
        {name}
      </span>
    );
  }
  const src =
    stage === "local"
      ? `/api/media/${webinarId}/badge/${encodeURIComponent(name)}`
      : `https://cdn.brandfetch.io/${badgeDomain(name)}?c=${clientId}`;
  return (
    <span className="flex h-7 items-center rounded-full border border-zinc-600 bg-zinc-950 px-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name}
        className="h-4 w-auto"
        onError={() =>
          setStage((s) => (s === "local" ? (clientId ? "brandfetch" : "pill") : "pill"))
        }
      />
    </span>
  );
}

export default function RoomClient({ payload, token }: { payload: RoomPayload; token: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);
  const [mutedStart, setMutedStart] = useState(false);
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

  // attendance heartbeat (spec §5 attendances)
  useEffect(() => {
    let attendanceId: string | null = null;
    void fetch(`/api/attendance/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offsetSeconds: offset }),
    })
      .then((r) => r.json())
      .then((j) => (attendanceId = j.attendanceId ?? null))
      .catch(() => {});
    const beat = setInterval(() => {
      if (!attendanceId) return;
      void fetch(`/api/attendance/${token}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attendanceId }),
      }).catch(() => {});
    }, 30_000);
    const onUnload = () => {
      if (!attendanceId) return;
      void fetch(`/api/attendance/${token}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attendanceId, exitOffsetSeconds: offsetSeconds(payload.session.startsAtMs, clock.nowMs()) }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(beat);
      window.removeEventListener("beforeunload", onUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-start the moment the session is live — no join gate. Browsers
  // block unmuted autoplay (spec §16.3), so on rejection we fall back to
  // muted playback plus a tap-to-unmute button.
  const live = offset >= 0;
  useEffect(() => {
    if (started || !live) return;
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;
    let done = false;
    let inFlight = false;

    const attempt = async () => {
      if (cancelled || done || inFlight) return;
      inFlight = true;
      try {
        v.currentTime = Math.max(0, offsetSeconds(payload.session.startsAtMs, clock.nowMs()));
        await v.play();
        done = true;
        if (!cancelled) setStarted(true);
      } catch {
        try {
          v.muted = true;
          await v.play();
          done = true;
          if (!cancelled) {
            setStarted(true);
            setMutedStart(true);
          }
        } catch {
          // Media not ready — retried on the next canplay.
        }
      } finally {
        inFlight = false;
      }
    };

    void attempt();
    v.addEventListener("canplay", attempt);
    return () => {
      cancelled = true;
      v.removeEventListener("canplay", attempt);
    };
  }, [started, live, payload.session.startsAtMs]);

  function unmute() {
    const v = videoRef.current;
    if (v) v.muted = false;
    setMutedStart(false);
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
    <main className="mx-auto flex h-dvh max-w-6xl flex-col gap-4 overflow-hidden p-4">
      <StatusBar
        title={payload.webinar.title}
        showCount={payload.webinar.showAttendeeCount}
        offsetSeconds={offset}
        durationSeconds={payload.webinar.durationSeconds}
        curve={payload.webinar.curve}
        seed={payload.session.seed}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:grid md:grid-cols-[1fr_320px] md:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <Player
            videoUrl={payload.webinar.videoUrl ?? ""}
            videoRef={videoRef}
            title={payload.webinar.title}
          />
          {offset < 0 ? (
            <div
              data-testid="pre-start-gate"
              className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 text-center"
            >
              {payload.webinar.waitingRoom?.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={payload.webinar.waitingRoom.imageUrl}
                  alt=""
                  className="max-h-56 w-full object-cover"
                />
              )}
              <div className="px-6 py-4">
                <p className="text-lg font-semibold">
                  {payload.webinar.waitingRoom?.headline ??
                    "Please wait, the webinar will be starting shortly"}
                </p>
                {payload.webinar.waitingRoom?.body && (
                  <p className="mt-1 text-sm text-zinc-300">{payload.webinar.waitingRoom.body}</p>
                )}
                {payload.webinar.waitingRoom && payload.webinar.waitingRoom.badges.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      As seen on
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
                      {payload.webinar.waitingRoom.badges.map((name) => (
                        <PressBadge
                          key={name}
                          webinarId={payload.webinar.id}
                          name={name}
                          clientId={payload.webinar.waitingRoom!.brandfetchId}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-1 font-mono text-sm text-zinc-400">
                  Starts in {fmt(-offset)}
                </p>
              </div>
            </div>
          ) : !started ? (
            <p className="font-mono text-sm text-zinc-400" data-testid="starting-readout">
              Starting…
            </p>
          ) : null}
          {mutedStart && (
            <button
              onClick={unmute}
              className="rounded-lg bg-red-600 px-6 py-3 text-lg font-semibold transition-colors hover:bg-red-500"
            >
              Tap to unmute
            </button>
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
        <ChatRail
          lines={payload.chat}
          offsetSeconds={offset}
          startsAtMs={payload.session.startsAtMs}
          realChat={{ token, allowRealChat: payload.webinar.allowRealChat }}
        />
      </div>
    </main>
  );
}
