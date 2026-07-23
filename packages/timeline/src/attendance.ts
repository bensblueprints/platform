import { mulberry32 } from "./prng";

export interface AttendanceCurve {
  peakCount: number;
  rampMinutes: number;
  plateauPct: number;
  endPct: number;
  jitterPct: number;
}

export const DEFAULT_CURVE: AttendanceCurve = {
  peakCount: 240,
  rampMinutes: 8,
  plateauPct: 0.55,
  endPct: 0.35,
  jitterPct: 0.03,
};

function logistic01(t: number): number {
  // L(t) = 1/(1+e^{-12(t-0.5)}), normalized to exactly [0,1] over [0,1].
  const l = (x: number) => 1 / (1 + Math.exp(-12 * (x - 0.5)));
  const l0 = l(0);
  return (l(t) - l0) / (l(1) - l0);
}

/** Base (jitter-free) curve value at a given offset. */
function base(offsetSeconds: number, durationSeconds: number, curve: AttendanceCurve): number {
  const rampSec = curve.rampMinutes * 60;
  const plateauEndSec = curve.plateauPct * durationSeconds;
  if (offsetSeconds <= 0) return 0;
  if (offsetSeconds < rampSec) {
    return curve.peakCount * logistic01(offsetSeconds / rampSec);
  }
  if (offsetSeconds < plateauEndSec) return curve.peakCount;
  const span = Math.max(1, durationSeconds - plateauEndSec);
  const t = Math.min(1, (offsetSeconds - plateauEndSec) / span);
  return curve.peakCount + (curve.endPct * curve.peakCount - curve.peakCount) * t;
}

/** Per-10s-bucket jitter anchors: the wobble changes every 10 seconds. */
function bucketMultiplier(bucket: number, sessionSeed: number, jitterPct: number): number {
  const rng = mulberry32((sessionSeed * 2654435761 + bucket * 40503) | 0);
  return 1 + (rng() - 0.5) * 2 * jitterPct;
}

/** Continuous jitter: linear interpolation between adjacent bucket anchors. */
function multiplierAt(t: number, sessionSeed: number, jitterPct: number): number {
  const b = Math.floor(t / 10);
  const frac = (t - b * 10) / 10;
  const m0 = bucketMultiplier(b, sessionSeed, jitterPct);
  const m1 = bucketMultiplier(b + 1, sessionSeed, jitterPct);
  return m0 + (m1 - m0) * frac;
}

/**
 * Simulated room attendance (spec §8) — EVERGREEN MODE ONLY. Live mode uses
 * real counts and must never import this function.
 *
 * Deterministic in (offsetSeconds, durationSeconds, curve, sessionSeed):
 * logistic ramp, plateau, linear decay, continuous seeded jitter. Never
 * decreases during the ramp (running max) and never hits zero. The 1-second
 * sweep is O(offset) ≈ a few thousand iterations — trivial, and keeps the
 * function stateless so a refresh at the same offset returns the same number.
 */
export function attendeeCount(
  offsetSeconds: number,
  durationSeconds: number,
  curve: AttendanceCurve = DEFAULT_CURVE,
  sessionSeed: number,
): number {
  const offset = Math.max(0, Math.min(Math.floor(offsetSeconds), durationSeconds));
  const rampSec = curve.rampMinutes * 60;

  let runningMax = 0;
  let value = 1;
  for (let t = 0; t <= offset; t++) {
    let v = base(t, durationSeconds, curve) * multiplierAt(t, sessionSeed, curve.jitterPct);
    if (t <= rampSec) {
      // ramp window (inclusive of the peak second): never decrease
      runningMax = Math.max(runningMax, v);
      v = runningMax;
    }
    value = v;
  }
  return Math.max(1, Math.round(value));
}
