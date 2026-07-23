import { describe, it, expect } from "vitest";
import { validateScript, type GenLine } from "./validate";

function line(over: Partial<GenLine>): GenLine {
  return {
    offsetSeconds: 0,
    persona: "P1",
    role: "attendee",
    mode: "chat",
    text: "the diagnose framework makes sense",
    beat: "teaching",
    ...over,
  };
}

const beats = [
  { type: "teaching" as const, start: 0, end: 300, transcript: "diagnose framework retention 65 percent" },
];

describe("validateScript (spec §7.5 gates)", () => {
  it("passes a clean script", () => {
    const lines = [
      line({ offsetSeconds: 10, persona: "A" }),
      line({ offsetSeconds: 60, persona: "A", mode: "question", text: "did he say 65 percent?" }),
      line({ offsetSeconds: 100, persona: "Mod", role: "admin", mode: "answer", text: "yes, 65 percent" }),
    ];
    const v = validateScript(lines, beats, { skipDensity: true });
    expect(v.ok).toBe(true);
    expect(v.failures).toEqual([]);
  });

  it("fails persona spacing (<45s apart)", () => {
    const lines = [line({ offsetSeconds: 10, persona: "A" }), line({ offsetSeconds: 30, persona: "A" })];
    const v = validateScript(lines, beats, { skipDensity: true });
    expect(v.ok).toBe(false);
    expect(v.failures[0].rule).toBe("persona_spacing");
  });

  it("fails persona cap (>8%)", () => {
    const lines = [
      ...Array.from({ length: 9 }, (_, i) => line({ offsetSeconds: i * 60, persona: "A" })),
      ...Array.from({ length: 91 }, (_, i) => line({ offsetSeconds: 600 + i, persona: `P${i}` })),
    ];
    const v = validateScript(lines, beats, { skipDensity: true });
    expect(v.failures.some((f) => f.rule === "persona_cap")).toBe(true);
  });

  it("fails an unanswered question (>90s)", () => {
    const lines = [line({ offsetSeconds: 10, mode: "question", text: "did he say 65 percent?" })];
    const v = validateScript(lines, beats, { skipDensity: true });
    expect(v.failures.some((f) => f.rule === "question_pairing")).toBe(true);
  });

  it("passes a question answered within 90s", () => {
    const lines = [
      line({ offsetSeconds: 10, mode: "question", text: "did he say 65 percent?" }),
      line({ offsetSeconds: 70, role: "admin", persona: "Mod", mode: "answer", text: "65 percent, yes" }),
    ];
    const v = validateScript(lines, beats, { skipDensity: true });
    expect(v.ok).toBe(true);
  });

  it("hard-blocks attendee earnings claims (FTC §12)", () => {
    const lines = [line({ text: "I doubled my income with this framework" })];
    const v = validateScript(lines, beats, { skipDensity: true });
    expect(v.failures.some((f) => f.rule === "ftc")).toBe(true);
  });

  it("fails lines not grounded in their beat transcript", () => {
    const lines = [line({ text: "the kubernetes deployment chapter saved my career" })];
    const v = validateScript(lines, beats, { skipDensity: true });
    expect(v.failures.some((f) => f.rule === "grounding")).toBe(true);
  });

  it("fails total line count outside density band", () => {
    // teaching 0-300s = 5 min, 1-3/min → target 5-15; ±15% → 4-17ish
    const lines = Array.from({ length: 40 }, (_, i) => line({ offsetSeconds: i * 7, persona: `P${i}` }));
    const v = validateScript(lines, beats);
    expect(v.failures.some((f) => f.rule === "density")).toBe(true);
  });

  it("admin lines are exempt from FTC; grounding still applies", () => {
    const adminBeat = [{ type: "teaching" as const, start: 0, end: 300, transcript: "price 997 tonight offer" }];
    const groundedAdmin = validateScript(
      [line({ role: "admin", persona: "Mod", text: "the price is $997 tonight", mode: "highlighted" })],
      adminBeat,
      { skipDensity: true },
    );
    expect(groundedAdmin.failures.some((f) => f.rule === "ftc")).toBe(false);
    expect(groundedAdmin.ok).toBe(true); // grounded: price/997/tonight all in transcript

    const ungroundedAdmin = validateScript(
      [line({ role: "admin", persona: "Mod", text: "grab the kubernetes bonus pack", mode: "highlighted" })],
      adminBeat,
      { skipDensity: true },
    );
    expect(ungroundedAdmin.failures.some((f) => f.rule === "grounding")).toBe(true);
  });
});
