"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomPayload } from "@platform/core";
import { offsetSeconds } from "@platform/timeline";
import { ChatRail, StatusBar } from "@platform/room-ui";
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
        </div>
        <ChatRail lines={payload.chat} offsetSeconds={offset} />
      </div>
    </main>
  );
}
