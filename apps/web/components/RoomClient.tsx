"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomPayload } from "@platform/core";
import { offsetSeconds } from "@platform/timeline";
import { clock } from "../lib/clock";
import Player from "./Player";

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function RoomClient({ payload }: { payload: RoomPayload }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [joined, setJoined] = useState(false);
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

  async function join() {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, offsetSeconds(payload.session.startsAtMs, clock.nowMs()));
    await v.play();
    setJoined(true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-label="Live" />
        <h1 className="text-lg font-medium">{payload.webinar.title}</h1>
      </header>
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
    </main>
  );
}
