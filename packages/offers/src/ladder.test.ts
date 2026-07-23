import { describe, it, expect } from "vitest";
import { currentPriceCents, nextPriceCents, urgencyRemainingSeconds, offerWindowState } from "./ladder";

describe("currentPriceCents (spec §9)", () => {
  const o = { priceStartCents: 10000, priceIncrementCents: 500, priceCapCents: 99700 };

  it("is the start price with no sales", () => {
    expect(currentPriceCents(o, 0)).toBe(10000);
  });

  it("rises by the increment per sale", () => {
    expect(currentPriceCents(o, 3)).toBe(11500);
  });

  it("never exceeds the cap", () => {
    expect(currentPriceCents(o, 1000)).toBe(99700);
  });

  it("handles a zero increment", () => {
    expect(currentPriceCents({ ...o, priceIncrementCents: 0 }, 5)).toBe(10000);
  });

  it("handles null increment and null cap", () => {
    expect(currentPriceCents({ priceStartCents: 5000, priceIncrementCents: null, priceCapCents: null }, 9)).toBe(5000);
  });
});

describe("nextPriceCents", () => {
  const o = { priceStartCents: 10000, priceIncrementCents: 500, priceCapCents: 99700 };

  it("is current + increment when increment is non-zero", () => {
    expect(nextPriceCents(o, 0)).toBe(10500);
  });

  it("is null when increment is zero", () => {
    expect(nextPriceCents({ ...o, priceIncrementCents: 0 }, 0)).toBeNull();
  });

  it("is null once the cap is reached", () => {
    expect(nextPriceCents(o, 1000)).toBeNull();
  });

  it("caps the next price at the cap", () => {
    expect(nextPriceCents({ priceStartCents: 99500, priceIncrementCents: 500, priceCapCents: 99700 }, 0)).toBe(99700);
  });
});

describe("urgencyRemainingSeconds (per-attendee, §9)", () => {
  it("starts at the full duration", () => {
    expect(urgencyRemainingSeconds(600, 1_000_000, 1_000_000)).toBe(600);
  });

  it("counts down from the attendee's first view, not the session start", () => {
    expect(urgencyRemainingSeconds(600, 1_000_000, 1_090_000)).toBe(510);
  });

  it("never goes below zero", () => {
    expect(urgencyRemainingSeconds(600, 1_000_000, 9_000_000)).toBe(0);
  });
});

describe("offerWindowState", () => {
  const w = { startOffsetSeconds: 100, endOffsetSeconds: 200 };

  it("before window", () => expect(offerWindowState(w, 50)).toBe("upcoming"));
  it("at start", () => expect(offerWindowState(w, 100)).toBe("active"));
  it("inside", () => expect(offerWindowState(w, 150)).toBe("active"));
  it("at end", () => expect(offerWindowState(w, 200)).toBe("ended"));
  it("null end means active forever", () =>
    expect(offerWindowState({ startOffsetSeconds: 100, endOffsetSeconds: null }, 99999)).toBe("active"));
});
