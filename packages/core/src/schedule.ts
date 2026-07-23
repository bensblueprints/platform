import { recurringSlotsUtc } from "@platform/timeline";
import type { Sql } from "./db";

/**
 * Materialize recurring webinars' sessions `aheadDays` out (spec §10).
 * Idempotent on (webinar_id, starts_at) via the unique index. Called by the
 * BullMQ scheduler and by the dev endpoint for tests.
 */
export async function materializeRecurringSessions(
  sql: Sql,
  opts?: { aheadDays?: number },
): Promise<{ created: number }> {
  const aheadDays = opts?.aheadDays ?? 14;
  const webinars = await sql<
    { id: string; recurring_days: number[] | null; recurring_times: string[] | null; timezone: string | null }[]
  >`
    select id, recurring_days, recurring_times, timezone
    from webinars where schedule_mode = 'recurring'
  `;

  let created = 0;
  for (const w of webinars) {
    const slots = recurringSlotsUtc({
      days: w.recurring_days ?? [],
      times: (w.recurring_times ?? []).map((t) => t.slice(0, 5)),
      timezone: w.timezone ?? "UTC",
      fromMs: Date.now(),
      aheadDays,
    });
    for (const slot of slots) {
      const res = await sql`
        insert into sessions (webinar_id, starts_at, seed)
        values (${w.id}, ${new Date(slot).toISOString()}, floor(random() * 2147483647))
        on conflict (webinar_id, starts_at) do nothing
        returning id
      `;
      created += res.length;
    }
  }
  return { created };
}

/**
 * Delete scheduled sessions that ended with zero attendances (spec §16.7).
 */
export async function cleanupDeadSessions(sql: Sql): Promise<{ deleted: number }> {
  const res = await sql<{ id: string }[]>`
    delete from sessions s
    using webinars w
    where s.webinar_id = w.id
      and s.status = 'scheduled'
      and s.starts_at + (w.duration_seconds::text || ' seconds')::interval < now()
      and not exists (select 1 from attendances a where a.session_id = s.id)
    returning s.id
  `;
  return { deleted: res.length };
}
