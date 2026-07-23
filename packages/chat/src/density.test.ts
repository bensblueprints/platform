import { describe, it, expect } from "vitest";
import { DENSITY, targetLineCount, densityBandOk, burstOffsets } from "./density";
import { mulberry32 } from "@platform/timeline";

describe("density targets (spec §7.4)", () => {
  it("covers every beat type in the spec table", () => {
    for (const t of ["arrival", "intro", "credibility", "teaching", "story", "transition", "pitch", "offer", "close"] as const) {
      expect(DENSITY[t].minPerMin).toBeGreaterThan(0);
      expect(DENSITY[t].maxPerMin).toBeGreaterThanOrEqual(DENSITY[t].minPerMin);
    }
  });

  it("arrival is the densest raw volume, story the sparsest", () => {
    expect(DENSITY.arrival.minPerMin).toBeGreaterThanOrEqual(DENSITY.intro.maxPerMin);
    expect(DENSITY.story.maxPerMin).toBeLessThan(DENSITY.offer.minPerMin);
  });

  it("targetLineCount scales with beat duration", () => {
    const n = targetLineCount({ type: "offer", start: 100, end: 220, transcript: "" });
    // 2 min at 4-6/min → 8-12
    expect(n).toBeGreaterThanOrEqual(8);
    expect(n).toBeLessThanOrEqual(12);
  });

  it("densityBandOk allows ±15%", () => {
    expect(densityBandOk(10, 10)).toBe(true);
    expect(densityBandOk(8, 10)).toBe(false);
    expect(densityBandOk(12, 10)).toBe(false);
  });
});

describe("burstOffsets (clustering rule: bursts of 2-4 with gaps, never even)", () => {
  it("clusters lines into bursts of 2-4 separated by gaps", () => {
    const offsets = burstOffsets(mulberry32(42), 12, 0, 600);
    expect(offsets).toHaveLength(12);
    expect(offsets[0]).toBeGreaterThanOrEqual(0);
    expect(offsets[11]).toBeLessThanOrEqual(600);
    // identify bursts: lines within 25s of previous
    const gaps: number[] = [];
    for (let i = 1; i < offsets.length; i++) gaps.push(offsets[i] - offsets[i - 1]);
    const burstRuns: number[] = [];
    let run = 1;
    for (const g of gaps) {
      if (g <= 25) run++;
      else {
        burstRuns.push(run);
        run = 1;
      }
    }
    burstRuns.push(run);
    // every burst is 2-4 lines (allow a single trailing/leading singleton only if count % burst size)
    for (const r of burstRuns) {
      expect(r).toBeGreaterThanOrEqual(2);
      expect(r).toBeLessThanOrEqual(4);
    }
    // gaps between bursts are meaningfully larger than gaps within
    const withinGaps = gaps.filter((g) => g <= 25);
    const betweenGaps = gaps.filter((g) => g > 25);
    expect(betweenGaps.length).toBeGreaterThan(0);
    for (const g of betweenGaps) expect(g).toBeGreaterThan(30);
  });

  it("is deterministic per seed", () => {
    expect(burstOffsets(mulberry32(7), 8, 0, 300)).toEqual(burstOffsets(mulberry32(7), 8, 0, 300));
  });
});
