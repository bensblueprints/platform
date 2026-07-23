/**
 * Scheduling math (spec §10). Pure functions; no DB, no timers.
 */

/** JIT: next slot is ceil(now / interval) + lead, in ms. */
export function nextJitSlotMs(nowMs: number, intervalMinutes: number, leadMinutes: number): number {
  const intervalMs = intervalMinutes * 60_000;
  return Math.ceil(nowMs / intervalMs) * intervalMs + leadMinutes * 60_000;
}

/** Offset (ms) of a timezone ahead of UTC at a given UTC instant. */
function tzOffsetMs(zone: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(new Date(utcMs))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

function zonedDateParts(zone: string, utcMs: number): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(new Date(utcMs))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
  return { y: parts.year, m: parts.month, d: parts.day };
}

/** Local wall time in `zone` → UTC epoch ms, with one DST refinement pass. */
function wallTimeToUtc(zone: string, y: number, m: number, d: number, hh: number, mm: number): number | null {
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  const off1 = tzOffsetMs(zone, naiveUtc);
  const guess1 = naiveUtc - off1;
  const off2 = tzOffsetMs(zone, guess1);
  const guess2 = naiveUtc - off2;
  // verify the local wall time at guess2 is what was requested (skips nonexistent times)
  const check = tzOffsetMs(zone, guess2);
  if (naiveUtc - check !== guess2) return null;
  return guess2;
}

/**
 * Recurring sessions (spec §10): for the next `aheadDays` days in the
 * webinar's timezone, every matching recurring_days × recurring_times,
 * as sorted UTC epoch ms not before `fromMs`.
 */
export function recurringSlotsUtc(opts: {
  days: number[];
  times: string[];
  timezone: string;
  fromMs: number;
  aheadDays: number;
}): number[] {
  const { days, times, timezone, fromMs, aheadDays } = opts;
  const out: number[] = [];
  const start = zonedDateParts(timezone, fromMs);
  const horizonEnd = fromMs + aheadDays * 86_400_000;

  for (let i = 0; i <= aheadDays; i++) {
    // calendar date in the zone, i days after the zoned `fromMs` date
    const noonProbe = Date.UTC(start.y, start.m - 1, start.d + i, 12);
    const date = zonedDateParts(timezone, noonProbe);
    const weekday = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
    if (!days.includes(weekday)) continue;

    for (const t of times) {
      const [hh, mm] = t.split(":").map(Number);
      const utc = wallTimeToUtc(timezone, date.y, date.m, date.d, hh, mm);
      if (utc !== null && utc >= fromMs && utc <= horizonEnd) out.push(utc);
    }
  }
  return out.sort((a, b) => a - b);
}
