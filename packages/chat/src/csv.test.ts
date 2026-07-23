import { describe, it, expect } from "vitest";
import { parseChatCsv } from "./csv";

describe("parseChatCsv", () => {
  it("parses the spec's EverWebinar sample verbatim", () => {
    const text = [
      "Hour,Minute,Second,Name,Role,Message,Mode",
      "0,2,14,Marcus T.,Attendee,Joining from Denver,chat",
      "0,3,02,{{name}},Attendee,Is there a replay if I have to drop?,question",
      '0,3,20,Sarah (Support),Admin,"Yes, everyone gets the replay link by email",answer',
    ].join("\n");
    const { rows, errors } = parseChatCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      offset_seconds: 134,
      display_name: "Marcus T.",
      role: "attendee",
      message: "Joining from Denver",
      mode: "chat",
    });
    expect(rows[1]).toMatchObject({ offset_seconds: 182, mode: "question" });
    expect(rows[2]).toMatchObject({
      offset_seconds: 200,
      role: "admin",
      message: "Yes, everyone gets the replay link by email",
      mode: "answer",
    });
  });

  it("works without a header row", () => {
    const { rows, errors } = parseChatCsv("0,0,30,Ben,Attendee,hello,chat");
    expect(errors).toEqual([]);
    expect(rows[0].offset_seconds).toBe(30);
  });

  it("detects a header case-insensitively and skips it", () => {
    const { rows } = parseChatCsv("hour,minute,second,name,role,message,mode\n0,0,05,Ben,Attendee,hi,chat");
    expect(rows).toHaveLength(1);
    expect(rows[0].offset_seconds).toBe(5);
  });

  it("handles quoted messages containing commas and escaped quotes", () => {
    const { rows, errors } = parseChatCsv('0,1,00,Ben,Attendee,"wait, did he say ""scale""?",question');
    expect(errors).toEqual([]);
    expect(rows[0].message).toBe('wait, did he say "scale"?');
  });

  it("handles CRLF line endings", () => {
    const { rows, errors } = parseChatCsv("0,0,01,A,Attendee,one,chat\r\n0,0,02,B,Admin,two,chat\r\n");
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it("keeps file order for equal offsets via sort_order", () => {
    const { rows } = parseChatCsv("0,1,00,A,Attendee,first,chat\n0,1,00,B,Attendee,second,chat");
    expect(rows[0].sort_order).toBe(0);
    expect(rows[1].sort_order).toBe(1);
  });

  it("reports row number and reason for wrong column count", () => {
    const { errors } = parseChatCsv("0,1,00,Ben,Attendee,chat");
    expect(errors).toEqual([{ row: 1, reason: "Row column count is not 7" }]);
  });

  it("reports the physical row number including a skipped header", () => {
    const { errors } = parseChatCsv("Hour,Minute,Second,Name,Role,Message,Mode\n0,1,00,Ben,Attendee,chat");
    expect(errors[0]).toEqual({ row: 2, reason: "Row column count is not 7" });
  });

  it("rejects hour > 7 with EverWebinar vocabulary", () => {
    const { errors } = parseChatCsv("8,0,00,Ben,Attendee,hi,chat");
    expect(errors).toEqual([{ row: 1, reason: "Hour is invalid" }]);
  });

  it("rejects non-numeric hour", () => {
    const { errors } = parseChatCsv("x,0,00,Ben,Attendee,hi,chat");
    expect(errors[0].reason).toBe("Hour is invalid");
  });

  it("rejects minute > 59", () => {
    const { errors } = parseChatCsv("0,60,00,Ben,Attendee,hi,chat");
    expect(errors[0].reason).toBe("Minute is invalid");
  });

  it("rejects second > 59", () => {
    const { errors } = parseChatCsv("0,0,60,Ben,Attendee,hi,chat");
    expect(errors[0].reason).toBe("Second is invalid");
  });

  it("rejects empty name with EverWebinar vocabulary", () => {
    const { errors } = parseChatCsv("0,0,01,,Attendee,hi,chat");
    expect(errors).toEqual([{ row: 1, reason: "Name issue" }]);
  });

  it("rejects bad role case-insensitively vocabulary, accepts mixed case roles", () => {
    expect(parseChatCsv("0,0,01,Ben,Host,hi,chat").errors[0].reason).toBe("Role is invalid");
    const { rows, errors } = parseChatCsv("0,0,01,Ben,aDmIn,hi,chat");
    expect(errors).toEqual([]);
    expect(rows[0].role).toBe("admin");
  });

  it("restricts attendee modes to chat/question/answer", () => {
    const { errors } = parseChatCsv("0,0,01,Ben,Attendee,pinned,highlighted");
    expect(errors).toEqual([{ row: 1, reason: "Type is invalid" }]);
  });

  it("allows admin modes highlighted and tip", () => {
    const { rows, errors } = parseChatCsv("0,0,01,Mod,Admin,pinned,highlighted\n0,0,02,Mod,Admin,pro tip,tip");
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.mode)).toEqual(["highlighted", "tip"]);
  });

  it("rejects empty message", () => {
    const { errors } = parseChatCsv("0,0,01,Ben,Attendee,,chat");
    expect(errors[0].reason).toBe("Message is empty");
  });

  it("flags unterminated quotes as a column count error on that row", () => {
    const { errors } = parseChatCsv('0,0,01,Ben,Attendee,"unterminated,chat');
    expect(errors).toEqual([{ row: 1, reason: "Row column count is not 7" }]);
  });

  it("collects multiple errors across rows", () => {
    const { errors } = parseChatCsv("9,0,00,Ben,Attendee,hi,chat\n0,0,01,,Attendee,hi,chat");
    expect(errors).toHaveLength(2);
    expect(errors[0].row).toBe(1);
    expect(errors[1].row).toBe(2);
  });

  it("caps at 5000 rows", () => {
    const line = "0,0,01,Ben,Attendee,hi,chat";
    const text = Array.from({ length: 5001 }, () => line).join("\n");
    const { errors } = parseChatCsv(text);
    expect(errors[0].reason).toMatch(/5,000 rows/);
  });

  it("accepts exactly 5000 rows", () => {
    const line = "0,0,01,Ben,Attendee,hi,chat";
    const text = Array.from({ length: 5000 }, () => line).join("\n");
    const { errors, rows } = parseChatCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(5000);
  });

  it("skips blank lines without losing row numbering", () => {
    const { rows, errors } = parseChatCsv("0,0,01,A,Attendee,one,chat\n\n0,0,02,B,Attendee,two,chat");
    expect(errors).toEqual([]);
    expect(rows[1].rowNumber).toBe(3);
  });
});
