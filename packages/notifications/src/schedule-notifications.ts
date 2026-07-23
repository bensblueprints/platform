/**
 * Reminder job planning (spec §11): which notification jobs a registration
 * spawns and when they fire. Pure — the BullMQ enqueue maps 1:1 onto it.
 */

export interface ReminderJob {
  kind: "confirm" | "reminder-24h" | "reminder-1h" | "reminder-10m" | "post-session" | "attended" | "no-show";
  runAtMs: number;
}

const WINDOWS = [
  { kind: "reminder-24h", beforeMs: 86_400_000 },
  { kind: "reminder-1h", beforeMs: 3_600_000 },
  { kind: "reminder-10m", beforeMs: 600_000 },
] as const;

export function planReminderJobs(opts: {
  startsAtMs: number | null;
  durationSeconds: number;
  nowMs: number;
}): ReminderJob[] {
  const { startsAtMs, durationSeconds, nowMs } = opts;
  const jobs: ReminderJob[] = [{ kind: "confirm", runAtMs: nowMs }];
  if (startsAtMs == null) return jobs; // on-demand: session starts on join

  for (const w of WINDOWS) {
    const runAtMs = startsAtMs - w.beforeMs;
    if (runAtMs >= nowMs) jobs.push({ kind: w.kind, runAtMs });
  }
  jobs.push({ kind: "post-session", runAtMs: startsAtMs + durationSeconds * 1000 });
  return jobs;
}

/** Post-session branch (spec §11): attended vs no-show. */
export function resolvePostSessionKind(attendanceCount: number): "attended" | "no-show" {
  return attendanceCount > 0 ? "attended" : "no-show";
}
