export function offsetSeconds(startsAtMs: number, nowMs: number): number {
  return Math.floor((nowMs - startsAtMs) / 1000);
}

export type SessionState = "pre" | "live" | "over";

export function resolveSessionState(offsetSec: number, durationSec: number): SessionState {
  if (offsetSec < 0) return "pre";
  if (offsetSec >= durationSec) return "over";
  return "live";
}
