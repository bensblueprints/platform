import { getSharedDb } from "@platform/core";
import { isAdminAuthorized } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Update webinar basics + room toggles (hub settings). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthorized(req))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as any;

  const days = Array.isArray(body.recurringDays) ? body.recurringDays.map(Number) : undefined;
  const times = Array.isArray(body.recurringTimes) ? body.recurringTimes : undefined;

  const updated = await sql`
    update webinars set
      title = coalesce(${body.title ?? null}, title),
      subtitle = coalesce(${body.subtitle ?? null}, subtitle),
      schedule_mode = coalesce(${body.scheduleMode ?? null}, schedule_mode),
      jit_interval_minutes = coalesce(${body.jitIntervalMinutes ?? null}, jit_interval_minutes),
      jit_lead_minutes = coalesce(${body.jitLeadMinutes ?? null}, jit_lead_minutes),
      recurring_days = coalesce(${days ?? null}, recurring_days),
      recurring_times = coalesce(${times ?? null}, recurring_times),
      timezone = coalesce(${body.timezone ?? null}, timezone),
      show_attendee_count = coalesce(${body.showAttendeeCount ?? null}, show_attendee_count),
      allow_real_chat = coalesce(${body.allowRealChat ?? null}, allow_real_chat),
      chat_variance_pct = coalesce(${body.chatVariancePct ?? null}, chat_variance_pct),
      chat_jitter_seconds = coalesce(${body.chatJitterSeconds ?? null}, chat_jitter_seconds)
    where id = ${id}::uuid
    returning id
  `;
  if (updated.length === 0) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ updated: true });
}
