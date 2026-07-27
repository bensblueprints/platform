import { describe, it, expect } from "vitest";
import { contentWords, overlapRatio, isAtmospheric, grounded } from "./ground";

describe("contentWords", () => {
  it("strips stopwords and punctuation", () => {
    const w = contentWords("Wait, did he say 65 percent or not?");
    expect(w.has("wait")).toBe(true);
    expect(w.has("did")).toBe(false);
    expect(w.has("65")).toBe(true);
    expect(w.has("percent")).toBe(true);
    expect(w.has("or")).toBe(false);
  });
});

describe("overlapRatio", () => {
  it("measures containment of a in b", () => {
    expect(overlapRatio(new Set(["a", "b", "c"]), new Set(["a", "b", "z"]))).toBeCloseTo(2 / 3);
    expect(overlapRatio(new Set([]), new Set(["a"]))).toBe(1);
  });
});

describe("isAtmospheric", () => {
  it("matches logistics and greeting lines", () => {
    expect(isAtmospheric("is there a replay?")).toBe(true);
    expect(isAtmospheric("audio is clear")).toBe(true);
    expect(isAtmospheric("hello from Denver")).toBe(true);
  });
  it("matches pure sentiment", () => {
    expect(isAtmospheric("this is such an amazing opportunity!")).toBe(true);
    expect(isAtmospheric("OH YES PLEASE CONTINUE 💯")).toBe(true);
  });
  it("does not match content references", () => {
    expect(isAtmospheric("did he say 65 percent or 56?")).toBe(false);
  });
});

describe("grounded (spec §7.5 anti-hallucination gate)", () => {
  const transcript = "we grew retention from 40 percent to 65 percent using the diagnose framework";

  it("passes a line referencing the transcript", () => {
    expect(grounded("wait did he say 40 percent or 14 percent?", transcript)).toBe(true);
    expect(grounded("the diagnose framework breakdown is what I needed", transcript)).toBe(true);
  });

  it("fails a statement inventing a number", () => {
    expect(grounded("the $20 price point makes sense", transcript)).toBe(false);
  });

  it("fails an invented capitalized name", () => {
    expect(grounded("the Kubernetes deployment saved me", transcript)).toBe(false);
  });

  it("fails a whole-concept reference never said", () => {
    expect(grounded("the kubernetes deployment chapter saved my career", transcript)).toBe(false);
  });

  it("skips the gate for atmospheric lines", () => {
    expect(grounded("is there a replay?", transcript)).toBe(true);
    expect(grounded("audio is clear", transcript)).toBe(true);
  });

  it("exempts number questions (mishearing is natural)", () => {
    expect(grounded("did he say 40 or 14?", transcript)).toBe(true);
  });
});
