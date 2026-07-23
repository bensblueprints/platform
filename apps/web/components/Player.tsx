"use client";

import type { RefObject } from "react";

/**
 * Hardened player shell (spec §14): no controls attribute, pointer-events
 * disabled on the video element, keyboard seeks swallowed. Volume and
 * fullscreen only. This is friction, not DRM — the schedule is
 * server-driven, so scrubbing gains nothing.
 */
export default function Player({
  videoUrl,
  videoRef,
  title,
}: {
  videoUrl: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  title: string;
}) {
  function toggleFullscreen() {
    const el = videoRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        src={videoUrl}
        className="pointer-events-none h-full w-full"
        playsInline
        tabIndex={-1}
        onKeyDown={(e) => e.preventDefault()}
        disablePictureInPicture
        aria-label={title}
      />
      <div className="absolute bottom-2 right-2 flex items-center gap-3 rounded bg-black/60 px-3 py-1.5">
        <input
          aria-label="Volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          defaultValue={1}
          className="w-24 accent-red-500"
          onChange={(e) => {
            if (videoRef.current) videoRef.current.volume = Number(e.target.value);
          }}
        />
        <button onClick={toggleFullscreen} className="text-sm text-zinc-200 hover:text-white">
          Fullscreen
        </button>
      </div>
    </div>
  );
}
