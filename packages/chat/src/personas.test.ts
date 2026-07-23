import { describe, it, expect } from "vitest";
import { generateRoster, ARCHETYPE_MIX, personaCapViolations } from "./personas";
import { mulberry32 } from "@platform/timeline";

describe("generateRoster (spec §7.3)", () => {
  it("produces the requested count with all required fields", () => {
    const r = generateRoster(mulberry32(1), 25, "US");
    expect(r).toHaveLength(25);
    for (const p of r) {
      expect(p.name.length).toBeGreaterThan(1);
      expect(p.location.length).toBeGreaterThan(1);
      expect(p.archetype).toBeTruthy();
      expect(p.style.caps).toBeTruthy();
      expect(typeof p.style.emoji).toBe("number");
      expect(p.arc).toBeTruthy();
    }
  });

  it("names are unique within a roster", () => {
    const r = generateRoster(mulberry32(2), 30, "US");
    expect(new Set(r.map((p) => p.name)).size).toBe(r.length);
  });

  it("archetype mix roughly follows spec proportions", () => {
    const r = generateRoster(mulberry32(3), 40, "US");
    const count = (a: string) => r.filter((p) => p.archetype === a).length / r.length;
    expect(count("enthusiast")).toBeGreaterThan(0.15);
    expect(count("confused")).toBeGreaterThan(0.1);
    expect(count("late")).toBeLessThan(0.2);
    expect(Object.keys(ARCHETYPE_MIX)).toContain("skeptic");
  });

  it("typing styles vary across the roster (the instant-read tell if uniform)", () => {
    const r = generateRoster(mulberry32(4), 30, "US");
    expect(new Set(r.map((p) => p.style.caps)).size).toBeGreaterThan(1);
    expect(new Set(r.map((p) => p.style.emoji)).size).toBeGreaterThan(1);
  });

  it("some personas appear exactly once (oneShot arc)", () => {
    const r = generateRoster(mulberry32(5), 30, "US");
    expect(r.some((p) => p.arc.oneShot)).toBe(true);
  });

  it("late arrivers have late arrival offsets", () => {
    const r = generateRoster(mulberry32(6), 40, "US");
    for (const p of r) {
      if (p.archetype === "late") expect(p.arc.arriveOffset).toBeGreaterThanOrEqual(600);
    }
  });
});

describe("personaCapViolations (8% rule)", () => {
  it("flags a persona exceeding 8% of total lines", () => {
    const lines = [
      ...Array.from({ length: 9 }, () => ({ persona: "A" })),
      ...Array.from({ length: 91 }, (_, i) => ({ persona: `P${i}` })),
    ];
    // 9/100 = 9% > 8%
    expect(personaCapViolations(lines, 0.08)).toEqual(["A"]);
  });

  it("passes a balanced script", () => {
    const lines = Array.from({ length: 100 }, (_, i) => ({ persona: `P${i % 20}` })); // 5% each
    expect(personaCapViolations(lines, 0.08)).toEqual([]);
  });
});
