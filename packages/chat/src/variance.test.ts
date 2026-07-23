import { describe, it, expect } from "vitest";
import { applySessionVariance } from "./variance";

type Line = { offsetSeconds: number; role: "admin" | "attendee"; mode: any; message: string };

function makeLines(): Line[] {
  const lines: Line[] = [];
  for (let i = 0; i < 100; i++) {
    lines.push({ offsetSeconds: i * 10, role: "attendee", mode: "chat", message: `chat ${i}` });
  }
  lines.push({ offsetSeconds: 205, role: "attendee", mode: "question", message: "q" });
  lines.push({ offsetSeconds: 235, role: "admin", mode: "answer", message: "a" });
  lines.push({ offsetSeconds: 400, role: "admin", mode: "highlighted", message: "pinned" });
  return lines.sort((a, b) => a.offsetSeconds - b.offsetSeconds);
}

describe("applySessionVariance", () => {
  it("is deterministic for the same seed", () => {
    const a = applySessionVariance(makeLines(), { seed: 7, variancePct: 0.2, jitterSeconds: 3 });
    const b = applySessionVariance(makeLines(), { seed: 7, variancePct: 0.2, jitterSeconds: 3 });
    expect(a).toEqual(b);
  });

  it("differs across seeds", () => {
    const a = applySessionVariance(makeLines(), { seed: 7, variancePct: 0.2, jitterSeconds: 3 });
    const b = applySessionVariance(makeLines(), { seed: 8, variancePct: 0.2, jitterSeconds: 3 });
    expect(a).not.toEqual(b);
  });

  it("never drops admin, question, or answer lines", () => {
    const out = applySessionVariance(makeLines(), { seed: 1, variancePct: 0.9, jitterSeconds: 3 });
    expect(out.some((l) => l.mode === "question")).toBe(true);
    expect(out.some((l) => l.mode === "answer")).toBe(true);
    expect(out.some((l) => l.mode === "highlighted")).toBe(true);
  });

  it("drops only attendee chat lines, near the configured rate", () => {
    const lines = Array.from({ length: 1000 }, (_, i) => ({
      offsetSeconds: i * 5,
      role: "attendee" as const,
      mode: "chat" as const,
      message: `m${i}`,
    }));
    const out = applySessionVariance(lines, { seed: 42, variancePct: 0.1, jitterSeconds: 0 });
    const dropped = 1000 - out.length;
    expect(dropped).toBeGreaterThan(60);
    expect(dropped).toBeLessThan(140);
  });

  it("drops nothing at variancePct 0", () => {
    const lines = makeLines();
    const out = applySessionVariance(lines, { seed: 42, variancePct: 0, jitterSeconds: 3 });
    expect(out).toHaveLength(lines.length);
  });

  it("jitter stays within bounds and preserves ordering", () => {
    const lines = makeLines();
    const out = applySessionVariance(lines, { seed: 9, variancePct: 0, jitterSeconds: 3 });
    for (let i = 0; i < out.length; i++) {
      const original = lines[i].offsetSeconds;
      expect(Math.abs(out[i].offsetSeconds - original)).toBeLessThanOrEqual(3);
      if (i > 0) expect(out[i].offsetSeconds).toBeGreaterThanOrEqual(out[i - 1].offsetSeconds);
    }
  });

  it("uses spec defaults when options are null", () => {
    const a = applySessionVariance(makeLines(), { seed: 5, variancePct: null, jitterSeconds: null });
    const b = applySessionVariance(makeLines(), { seed: 5, variancePct: 0.1, jitterSeconds: 3 });
    expect(a).toEqual(b);
  });
});
