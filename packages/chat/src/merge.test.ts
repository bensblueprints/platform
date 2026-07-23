import { describe, it, expect } from "vitest";
import { mergeLines } from "./merge";
import { mulberry32 } from "@platform/timeline";

describe("mergeLines (spec §7.2 stage 5)", () => {
  it("sorts by offset and preserves non-decreasing order after jitter", () => {
    const beats = [
      [
        { offsetSeconds: 100, persona: "A", text: "one" },
        { offsetSeconds: 102, persona: "B", text: "two" },
        { offsetSeconds: 50, persona: "C", text: "three" },
      ],
    ];
    const out = mergeLines(mulberry32(1), beats as any);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].offsetSeconds).toBeGreaterThanOrEqual(out[i - 1].offsetSeconds);
    }
  });

  it("dedupes near-identical lines, keeping the first", () => {
    const beats = [
      [
        { offsetSeconds: 10, persona: "A", text: "this is gold" },
        { offsetSeconds: 25, persona: "B", text: "This is gold!" },
        { offsetSeconds: 40, persona: "C", text: "something different" },
      ],
    ];
    const out = mergeLines(mulberry32(1), beats as any);
    expect(out.map((l) => l.text)).toEqual(["this is gold", "something different"]);
  });

  it("keeps identical text when far apart in time", () => {
    const beats = [
      [
        { offsetSeconds: 10, persona: "A", text: "wow" },
        { offsetSeconds: 300, persona: "B", text: "wow" },
      ],
    ];
    const out = mergeLines(mulberry32(1), beats as any);
    expect(out).toHaveLength(2);
  });
});
