import { describe, it, expect } from "vitest";
import { lintAttendeeLines } from "./lint";
import { parseChatCsv } from "./csv";

function lint(csv: string) {
  const { rows } = parseChatCsv(csv);
  return lintAttendeeLines(rows);
}

describe("lintAttendeeLines (FTC §12, warnings only)", () => {
  it("flags currency amounts in attendee lines", () => {
    const w = lint('0,0,01,Ben,Attendee,"I make $5,000 a month with this",chat');
    expect(w).toHaveLength(1);
    expect(w[0].row).toBe(1);
    expect(w[0].reason).toMatch(/currency/i);
  });

  it("flags percentage gains in attendee lines", () => {
    const w = lint("0,0,01,Ben,Attendee,my revenue went up 40% in a month,chat");
    expect(w[0].reason).toMatch(/percentage/i);
  });

  it("flags first-person outcome claims", () => {
    const w = lint("0,0,01,Ben,Attendee,I doubled my income in 6 weeks,chat");
    expect(w[0].reason).toMatch(/outcome/i);
  });

  it("does not flag admin lines", () => {
    expect(lint("0,0,01,Mod,Admin,the price is $997 tonight,answer")).toEqual([]);
  });

  it("does not flag clean attendee lines", () => {
    expect(lint("0,0,01,Ben,Attendee,joining from Denver,chat")).toEqual([]);
    expect(lint("0,0,02,Ben,Attendee,is there a replay?,question")).toEqual([]);
  });

  it("flags a question referencing a percentage (warning, not block)", () => {
    const w = lint("0,0,01,Ben,Attendee,did he say 40% or 14%?,question");
    expect(w).toHaveLength(1);
  });
});
