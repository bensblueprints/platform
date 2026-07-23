import { describe, it, expect } from "vitest";
import { nextJitSlotMs, recurringSlotsUtc } from "./schedule";

describe("nextJitSlotMs (spec §10)", () => {
  const interval = 15, lead = 5;

  it("rounds up to the next interval and adds the lead", () => {
    const now = Date.UTC(2026, 0, 15, 10, 3, 0); // 10:03
    const slot = nextJitSlotMs(now, interval, lead);
    expect(new Date(slot).toISOString()).toBe("2026-01-15T10:20:00.000Z"); // 10:15 + 5
  });

  it("at an exact interval boundary, takes that interval + lead", () => {
    const now = Date.UTC(2026, 0, 15, 10, 15, 0);
    expect(new Date(nextJitSlotMs(now, interval, lead)).toISOString()).toBe("2026-01-15T10:20:00.000Z");
  });

  it("one second past the boundary jumps to the next interval", () => {
    const now = Date.UTC(2026, 0, 15, 10, 15, 1);
    // ceil(10:15:01 onto the 15-min grid) = 10:30, plus 5m lead = 10:35
    expect(new Date(nextJitSlotMs(now, interval, lead)).toISOString()).toBe("2026-01-15T10:35:00.000Z");
  });

  it("handles a 30-minute interval", () => {
    const now = Date.UTC(2026, 0, 15, 10, 31, 0);
    expect(new Date(nextJitSlotMs(now, 30, 5)).toISOString()).toBe("2026-01-15T11:05:00.000Z");
  });
});

describe("recurringSlotsUtc (spec §10)", () => {
  const from = Date.UTC(2026, 0, 15, 12, 0, 0); // Thu 2026-01-15 12:00 UTC

  it("produces daily slots for 14 days in UTC", () => {
    const slots = recurringSlotsUtc({
      days: [0, 1, 2, 3, 4, 5, 6],
      times: ["10:00"],
      timezone: "UTC",
      fromMs: from,
      aheadDays: 14,
    });
    expect(slots.length).toBe(14);
    expect(new Date(slots[0]).toISOString()).toBe("2026-01-16T10:00:00.000Z"); // today 12:00 already past 10:00
    expect(new Date(slots[13]).toISOString()).toBe("2026-01-29T10:00:00.000Z");
  });

  it("includes today when the time is still ahead", () => {
    const slots = recurringSlotsUtc({
      days: [4], // Thursday
      times: ["18:30"],
      timezone: "UTC",
      fromMs: from,
      aheadDays: 7,
    });
    expect(slots.length).toBe(1);
    expect(new Date(slots[0]).toISOString()).toBe("2026-01-15T18:30:00.000Z");
  });

  it("filters by days and multiple times", () => {
    const slots = recurringSlotsUtc({
      days: [1, 3], // Mon, Wed
      times: ["09:00", "17:00"],
      timezone: "UTC",
      fromMs: from, // Thursday
      aheadDays: 7,
    });
    expect(slots.map((s) => new Date(s).toISOString())).toEqual([
      "2026-01-19T09:00:00.000Z", // Mon
      "2026-01-19T17:00:00.000Z",
      "2026-01-21T09:00:00.000Z", // Wed
      "2026-01-21T17:00:00.000Z",
    ]);
  });

  it("shifts correctly across a DST boundary (America/Denver spring forward)", () => {
    // 2026-03-08: 2am → 3am in Denver (MST -7 → MDT -6)
    const dstFrom = Date.UTC(2026, 2, 6, 12, 0, 0); // Fri Mar 6
    const slots = recurringSlotsUtc({
      days: [0, 1, 2, 3, 4, 5, 6],
      times: ["10:00"],
      timezone: "America/Denver",
      fromMs: dstFrom,
      aheadDays: 4,
    });
    expect(slots.map((s) => new Date(s).toISOString())).toEqual([
      "2026-03-06T17:00:00.000Z", // Fri 10:00 MST = 17:00 UTC
      "2026-03-07T17:00:00.000Z", // Sat 10:00 MST
      "2026-03-08T16:00:00.000Z", // Sun 10:00 MDT = 16:00 UTC
      "2026-03-09T16:00:00.000Z", // Mon 10:00 MDT
    ]);
  });
});
