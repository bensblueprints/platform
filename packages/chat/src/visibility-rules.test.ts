import { describe, it, expect } from "vitest";
import { canSeeMessage, type MessageVisibility } from "./visibility-rules";

describe("canSeeMessage (spec §6.1 isolation)", () => {
  const msg = (over: Partial<MessageVisibility>): MessageVisibility => ({
    registrantId: "r1",
    authorType: "attendee",
    broadcast: false,
    ...over,
  });

  it("attendee sees own messages", () => {
    expect(canSeeMessage(msg({}), { kind: "attendee", registrantId: "r1" })).toBe(true);
  });

  it("attendee never sees another attendee's private message", () => {
    expect(canSeeMessage(msg({ registrantId: "r2" }), { kind: "attendee", registrantId: "r1" })).toBe(false);
  });

  it("attendee sees moderator broadcasts", () => {
    expect(
      canSeeMessage(msg({ authorType: "moderator", broadcast: true, registrantId: null }), {
        kind: "attendee",
        registrantId: "r1",
      }),
    ).toBe(true);
  });

  it("attendee sees moderator private replies addressed to them", () => {
    expect(
      canSeeMessage(msg({ authorType: "moderator", registrantId: "r1" }), {
        kind: "attendee",
        registrantId: "r1",
      }),
    ).toBe(true);
  });

  it("attendee does not see moderator private replies to someone else", () => {
    expect(
      canSeeMessage(msg({ authorType: "moderator", registrantId: "r2" }), {
        kind: "attendee",
        registrantId: "r1",
      }),
    ).toBe(false);
  });

  it("moderator sees everything", () => {
    for (const m of [
      msg({}),
      msg({ registrantId: "r2" }),
      msg({ authorType: "moderator", broadcast: true, registrantId: null }),
    ]) {
      expect(canSeeMessage(m, { kind: "moderator" })).toBe(true);
    }
  });
});
