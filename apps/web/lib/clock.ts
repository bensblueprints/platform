"use client";

import { createServerClock } from "@platform/timeline";

export const clock = createServerClock({
  ping: async () => {
    const res = await fetch("/api/time", { cache: "no-store" });
    const j = (await res.json()) as { nowMs: number };
    return j.nowMs;
  },
});
