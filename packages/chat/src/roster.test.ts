import { describe, it, expect } from "vitest";
import { resolveNameTokens, seededShuffle } from "./roster";

const ROSTER = Array.from({ length: 30 }, (_, i) => `Person ${i}`);

function lines() {
  return [
    { displayName: "Marcus T.", message: "literal" },
    { displayName: "{{name}}", message: "token 0" },
    { displayName: "{{name}}", message: "token 1" },
    { displayName: "{{name}}", message: "token 2" },
  ];
}

describe("seededShuffle", () => {
  it("is deterministic per seed and a permutation of the input", () => {
    const idx = ROSTER.map((_, i) => i);
    const a = seededShuffle(idx, 42);
    const b = seededShuffle(idx, 42);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(idx);
  });
});

describe("resolveNameTokens", () => {
  it("leaves literal names untouched", () => {
    const out = resolveNameTokens(lines(), ROSTER, 1);
    expect(out[0].displayName).toBe("Marcus T.");
  });

  it("resolves tokens from the roster (never leaves {{name}})", () => {
    const out = resolveNameTokens(lines(), ROSTER, 1);
    for (const l of out.slice(1)) {
      expect(l.displayName).toMatch(/^Person \d+$/);
    }
  });

  it("is stable: same seed → same names in same positions", () => {
    const a = resolveNameTokens(lines(), ROSTER, 7);
    const b = resolveNameTokens(lines(), ROSTER, 7);
    expect(a.map((l) => l.displayName)).toEqual(b.map((l) => l.displayName));
  });

  it("maps the same occurrence index to the same person (stable index map)", () => {
    const out = resolveNameTokens(lines(), ROSTER, 7);
    const again = resolveNameTokens(lines(), ROSTER, 7);
    expect(out[1].displayName).toBe(again[1].displayName);
    // and distinct occurrences get distinct people (no wrap needed at 3 < 30)
    const names = new Set(out.slice(1).map((l) => l.displayName));
    expect(names.size).toBe(3);
  });

  it("differs across seeds", () => {
    const a = resolveNameTokens(lines(), ROSTER, 7).map((l) => l.displayName);
    const b = resolveNameTokens(lines(), ROSTER, 8).map((l) => l.displayName);
    expect(a).not.toEqual(b);
  });

  it("wraps when occurrences exceed roster size", () => {
    const many = Array.from({ length: 35 }, () => ({ displayName: "{{name}}", message: "x" }));
    const out = resolveNameTokens(many, ["A", "B", "C"], 3);
    expect(out.map((l) => l.displayName)).toHaveLength(35);
    expect(new Set(out.map((l) => l.displayName))).toEqual(new Set(["A", "B", "C"]));
  });

  it("empty roster leaves tokens as-is", () => {
    const out = resolveNameTokens(lines(), [], 1);
    expect(out[1].displayName).toBe("{{name}}");
  });
});
