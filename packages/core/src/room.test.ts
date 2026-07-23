import { describe, it, expect } from "vitest";
import { toRoomPayload } from "./room";

const w = {
  id: "w1",
  title: "Demo",
  duration_seconds: 5752,
  video_url: "https://v",
  show_attendee_count: true,
  allow_real_chat: true,
} as any;
const s = { id: "s1", starts_at: new Date(1_000_000), seed: 42 } as any;
const r = { first_name: "Ben" } as any;

describe("toRoomPayload", () => {
  it("maps rows to the payload contract", () => {
    const p = toRoomPayload(w, s, r, 1_000_500);
    expect(p.webinar.title).toBe("Demo");
    expect(p.webinar.durationSeconds).toBe(5752);
    expect(p.webinar.videoUrl).toBe("https://v");
    expect(p.webinar.showAttendeeCount).toBe(true);
    expect(p.webinar.allowRealChat).toBe(true);
    expect(p.session.id).toBe("s1");
    expect(p.session.startsAtMs).toBe(1_000_000);
    expect(p.session.seed).toBe(42);
    expect(p.serverNowMs).toBe(1_000_500);
    expect(p.over).toBe(false);
    expect(p.registrant.firstName).toBe("Ben");
  });

  it("flags over exactly at duration", () => {
    expect(toRoomPayload(w, s, r, 1_000_000 + 5752 * 1000).over).toBe(true);
  });

  it("flags over when past duration", () => {
    expect(toRoomPayload(w, s, r, 1_000_000 + 5753 * 1000).over).toBe(true);
  });

  it("tolerates null video and first name", () => {
    const p = toRoomPayload({ ...w, video_url: null }, s, { first_name: null }, 1_000_500);
    expect(p.webinar.videoUrl).toBeNull();
    expect(p.registrant.firstName).toBeNull();
  });
});
