import { describe, it, expect } from "vitest";
import { visibleLines } from "./visibility";

const lines = [
  { offset_seconds: 5, message: "a" },
  { offset_seconds: 10, message: "b" },
  { offset_seconds: 20, message: "c" },
  { offset_seconds: 30, message: "d" },
];

describe("visibleLines", () => {
  it("returns only lines at or before the offset", () => {
    expect(visibleLines(lines, 12).map((l) => l.message)).toEqual(["a", "b"]);
  });

  it("is empty before the first line", () => {
    expect(visibleLines(lines, 4)).toEqual([]);
  });

  it("includes the line exactly at the offset", () => {
    expect(visibleLines(lines, 10).map((l) => l.message)).toEqual(["a", "b"]);
  });

  it("caps the backlog to the most recent N lines", () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ offset_seconds: i, message: `m${i}` }));
    const vis = visibleLines(many, 9999, 200);
    expect(vis).toHaveLength(200);
    expect(vis[0].message).toBe("m50");
    expect(vis[199].message).toBe("m249");
  });
});
