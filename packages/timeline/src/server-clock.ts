export interface ServerClock {
  nowMs(): number;
  consecutiveFailures(): number;
  start(): void;
  stop(): void;
  resyncNow(): Promise<void>;
}

export function createServerClock(opts: {
  ping: () => Promise<number>;
  resyncIntervalMs?: number;
}): ServerClock {
  const resyncIntervalMs = opts.resyncIntervalMs ?? 60_000;
  let deltaMs = 0;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;

  async function resyncNow(): Promise<void> {
    try {
      const serverMs = await opts.ping();
      deltaMs = serverMs - Date.now();
      failures = 0;
    } catch {
      failures += 1;
      throw new Error("time sync failed");
    }
  }

  function scheduleNext(ms: number) {
    if (stopped) return;
    timer = setTimeout(tick, ms);
  }

  async function tick() {
    try {
      await resyncNow();
      scheduleNext(resyncIntervalMs);
    } catch {
      scheduleNext(Math.min(1000 * 2 ** failures, 30_000));
    }
  }

  return {
    nowMs: () => Date.now() + deltaMs,
    consecutiveFailures: () => failures,
    start() {
      if (!stopped) return;
      stopped = false;
      void tick();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    resyncNow,
  };
}
