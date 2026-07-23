"use client";

import { useEffect, useRef, useState } from "react";
import { attendeeCount, type AttendanceCurve } from "@platform/timeline";

/**
 * Animated simulated-attendee display (spec §8, §13) — EVERGREEN ONLY.
 * Tweens toward the curve value over ~600ms; never hard-swaps; instant
 * under prefers-reduced-motion (§13).
 */
export function AttendeeCount({
  offsetSeconds,
  durationSeconds,
  curve,
  seed,
}: {
  offsetSeconds: number;
  durationSeconds: number;
  curve: AttendanceCurve;
  seed: number;
}) {
  const target = attendeeCount(offsetSeconds, durationSeconds, curve, seed);
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(display);

  useEffect(() => {
    if (displayRef.current === target) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }
    const from = displayRef.current;
    const start = performance.now();
    const durationMs = 600;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const v = Math.round(from + (target - from) * t);
      displayRef.current = v;
      setDisplay(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <span
      data-testid="attendee-count"
      data-value={display}
      className="tabular-nums text-sm text-zinc-300"
      aria-label={`${display} people watching`}
    >
      {display} watching
    </span>
  );
}
