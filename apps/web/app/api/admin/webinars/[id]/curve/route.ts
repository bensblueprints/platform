import { getSharedDb } from "@platform/core";
import { isAdminAuthorized } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Upsert the attendance curve for the webinar. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthorized(req))) return Response.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as any;

  await sql`
    insert into attendance_curves (webinar_id, peak_count, ramp_minutes, plateau_pct, end_pct, jitter_pct)
    values (
      ${id}::uuid,
      ${Number(b.peakCount ?? 240)}, ${Number(b.rampMinutes ?? 8)},
      ${Number(b.plateauPct ?? 0.55)}, ${Number(b.endPct ?? 0.35)}, ${Number(b.jitterPct ?? 0.03)}
    )
    on conflict (webinar_id) do update set
      peak_count = excluded.peak_count,
      ramp_minutes = excluded.ramp_minutes,
      plateau_pct = excluded.plateau_pct,
      end_pct = excluded.end_pct,
      jitter_pct = excluded.jitter_pct
  `;
  return Response.json({ ok: true });
}
