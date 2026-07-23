import { describe, it, expect } from "vitest";
import { offsetSeconds, resolveSessionState } from "./offset";

describe("offsetSeconds", () => {
  it("is 0 exactly at start", () => expect(offsetSeconds(1000, 1000)).toBe(0));
  it("floors sub-second", () => expect(offsetSeconds(1000, 1999)).toBe(0));
  it("is negative before start", () => expect(offsetSeconds(10_000, 4_000)).toBe(-6));
  it("computes late join", () => expect(offsetSeconds(0, 600_000)).toBe(600));
});

describe("resolveSessionState", () => {
  it("pre when negative", () => expect(resolveSessionState(-1, 100)).toBe("pre"));
  it("live at 0", () => expect(resolveSessionState(0, 100)).toBe("live"));
  it("live at duration-1", () => expect(resolveSessionState(99, 100)).toBe("live"));
  it("over at duration", () => expect(resolveSessionState(100, 100)).toBe("over"));
  it("over past duration", () => expect(resolveSessionState(5753, 5752)).toBe("over"));
});
