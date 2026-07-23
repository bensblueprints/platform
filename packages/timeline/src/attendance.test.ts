import { describe, it, expect } from "vitest";
import { attendeeCount, type AttendanceCurve } from "./attendance";

const CURVE: AttendanceCurve = {
  peakCount: 240,
  rampMinutes: 8,
  plateauPct: 0.55,
  endPct: 0.35,
  jitterPct: 0.03,
};
const DURATION = 3600; // 60 min: ramp ends at 480s, plateau ends at 1980s

describe("attendeeCount", () => {
  it("is never zero across a full sweep", () => {
    for (let t = -50; t <= DURATION + 100; t += 7) {
      expect(attendeeCount(t, DURATION, CURVE, 42)).toBeGreaterThanOrEqual(1);
    }
  });

  it("starts small and ramps up", () => {
    const early = attendeeCount(10, DURATION, CURVE, 42);
    const late = attendeeCount(470, DURATION, CURVE, 42);
    expect(early).toBeLessThan(30);
    expect(late).toBeGreaterThan(150);
  });

  it("never decreases during the ramp (bucket by bucket)", () => {
    let prev = 0;
    for (let t = 0; t <= 480; t += 10) {
      const v = attendeeCount(t, DURATION, CURVE, 42);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("holds near peak through the plateau", () => {
    for (const t of [600, 1000, 1500, 1970]) {
      const v = attendeeCount(t, DURATION, CURVE, 42);
      expect(v).toBeGreaterThan(240 * 0.9);
      expect(v).toBeLessThan(240 * 1.1);
    }
  });

  it("decays to endPct * peak at duration end", () => {
    const v = attendeeCount(DURATION, DURATION, CURVE, 42);
    expect(v).toBeGreaterThan(240 * 0.35 * 0.9);
    expect(v).toBeLessThan(240 * 0.35 * 1.15);
  });

  it("is deterministic: identical inputs give identical outputs", () => {
    for (const t of [0, 137, 999, 2000, 3599]) {
      expect(attendeeCount(t, DURATION, CURVE, 7)).toBe(attendeeCount(t, DURATION, CURVE, 7));
    }
  });

  it("different seeds wobble differently but keep the same trend", () => {
    const a = attendeeCount(1000, DURATION, CURVE, 1);
    const b = attendeeCount(1000, DURATION, CURVE, 2);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(240 * 0.06 + 2);
    expect(a).toBeGreaterThan(200);
    expect(b).toBeGreaterThan(200);
  });

  it("clamps offsets past duration", () => {
    const atEnd = attendeeCount(DURATION, DURATION, CURVE, 42);
    const past = attendeeCount(DURATION + 500, DURATION, CURVE, 42);
    expect(past).toBe(atEnd);
  });

  it("respects a tiny custom curve (e2e shape)", () => {
    const small: AttendanceCurve = { peakCount: 100, rampMinutes: 1, plateauPct: 0.55, endPct: 0.35, jitterPct: 0.03 };
    const v15 = attendeeCount(15, 5752, small, 5);
    const v40 = attendeeCount(40, 5752, small, 5);
    expect(v15).toBeGreaterThanOrEqual(1);
    expect(v40).toBeGreaterThan(v15);
    expect(v40).toBeGreaterThan(50);
  });
});
