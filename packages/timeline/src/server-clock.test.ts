import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServerClock } from "./server-clock";

describe("createServerClock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("uses delta 0 before first sync", () => {
    const clock = createServerClock({ ping: async () => Date.now() });
    expect(Math.abs(clock.nowMs() - Date.now())).toBeLessThan(50);
  });

  it("applies server delta after resyncNow", async () => {
    const clock = createServerClock({ ping: async () => Date.now() + 5000 });
    await clock.resyncNow();
    const drift = clock.nowMs() - Date.now();
    expect(drift).toBeGreaterThan(4900);
    expect(drift).toBeLessThan(5100);
  });

  it("re-pings on the resync interval after start", async () => {
    let calls = 0;
    const clock = createServerClock({
      ping: async () => {
        calls++;
        return Date.now();
      },
      resyncIntervalMs: 1000,
    });
    clock.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(calls).toBe(4);
    clock.stop();
  });

  it("backs off on failure and resets on success", async () => {
    let shouldFail = true;
    const clock = createServerClock({
      ping: async () => {
        if (shouldFail) throw new Error("down");
        return Date.now();
      },
      resyncIntervalMs: 60_000,
    });
    clock.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(clock.consecutiveFailures()).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(clock.consecutiveFailures()).toBe(2);
    shouldFail = false;
    await vi.advanceTimersByTimeAsync(4000);
    expect(clock.consecutiveFailures()).toBe(0);
    clock.stop();
  });

  it("stop() ends the ping loop", async () => {
    let calls = 0;
    const clock = createServerClock({
      ping: async () => {
        calls++;
        return Date.now();
      },
      resyncIntervalMs: 1000,
    });
    clock.start();
    await vi.advanceTimersByTimeAsync(0);
    clock.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(1);
  });
});
