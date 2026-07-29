import { unlinkSync, existsSync } from "node:fs";
import { getScopedUser, canAccessWebinar } from "../../../../../lib/auth";
import { getSharedDb } from "@platform/core";
import { videoPath } from "../../../../../lib/video-storage";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Update webinar basics + room toggles (hub settings). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  if (!(await canAccessWebinar(sql, scopedUser, id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
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
      chat_jitter_seconds = coalesce(${body.chatJitterSeconds ?? null}, chat_jitter_seconds),
      chat_audience_size = coalesce(${body.chatAudienceSize ?? null}, chat_audience_size),
      waiting_headline = coalesce(${body.waitingHeadline ?? null}, waiting_headline),
      waiting_body = coalesce(${body.waitingBody ?? null}, waiting_body),
      waiting_badges = coalesce(${body.waitingBadges ?? null}, waiting_badges)
    where id = ${id}::uuid
    returning id
  `;
  if (updated.length === 0) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ updated: true });
}

/** Delete a webinar and everything attached (FK cascades) plus the video file. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  if (!(await canAccessWebinar(sql, scopedUser, id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const deleted = await sql`
    delete from webinars where id = ${id}::uuid returning id, slug
  `;
  if (deleted.length === 0) return Response.json({ error: "not_found" }, { status: 404 });

  try {
    if (existsSync(videoPath(id))) unlinkSync(videoPath(id));
  } catch {
    // file cleanup is best-effort; the row is already gone
  }
  return Response.json({ deleted: true, slug: deleted[0].slug });
}
