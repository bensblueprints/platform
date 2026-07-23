import { describe, it, expect } from "vitest";
import { planReminderJobs, resolvePostSessionKind } from "./schedule-notifications";

const TEN_MIN = 600_000, ONE_H = 3_600_000, DAY = 86_400_000;
const startsAt = 10_000_000_000;

describe("planReminderJobs (spec §11)", () => {
  it("schedules all four jobs when every window is in the future", () => {
    const jobs = planReminderJobs({ startsAtMs: startsAt, durationSeconds: 3600, nowMs: startsAt - 2 * DAY });
    const kinds = jobs.map((j) => j.kind);
    expect(kinds).toEqual(["confirm", "reminder-24h", "reminder-1h", "reminder-10m", "post-session"]);
    const byKind = Object.fromEntries(jobs.map((j) => [j.kind, j.runAtMs]));
    expect(byKind["reminder-24h"]).toBe(startsAt - DAY);
    expect(byKind["reminder-1h"]).toBe(startsAt - ONE_H);
    expect(byKind["reminder-10m"]).toBe(startsAt - TEN_MIN);
    expect(byKind["post-session"]).toBe(startsAt + 3600_000);
    expect(byKind["confirm"]).toBe(startsAt - 2 * DAY); // now
  });

  it("skips reminders whose window has passed (registration 30m before start)", () => {
    const jobs = planReminderJobs({ startsAtMs: startsAt, durationSeconds: 3600, nowMs: startsAt - 30 * 60_000 });
    const kinds = jobs.map((j) => j.kind);
    expect(kinds).not.toContain("reminder-24h");
    expect(kinds).not.toContain("reminder-1h");
    expect(kinds).toContain("reminder-10m");
    expect(kinds).toContain("post-session");
  });

  it("on-demand (no starts_at) schedules only confirm", () => {
    const jobs = planReminderJobs({ startsAtMs: null, durationSeconds: 3600, nowMs: 123 });
    expect(jobs.map((j) => j.kind)).toEqual(["confirm"]);
  });

  it("delays are non-negative", () => {
    const jobs = planReminderJobs({ startsAtMs: startsAt, durationSeconds: 3600, nowMs: startsAt - 1000 });
    for (const j of jobs) expect(j.runAtMs).toBeGreaterThanOrEqual(startsAt - 1000);
  });
});

describe("resolvePostSessionKind", () => {
  it("attended when the registrant has an attendance row", () => {
    expect(resolvePostSessionKind(1)).toBe("attended");
  });
  it("no-show otherwise", () => {
    expect(resolvePostSessionKind(0)).toBe("no-show");
  });
});
