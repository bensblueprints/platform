import Link from "next/link";
import { notFound } from "next/navigation";
import { getSharedDb } from "@platform/core";
import { AudienceSizeForm, CurveForm, DeleteWebinarButton, ImportChatForm, OfferForm, RosterForm, VideoUpload } from "../../../../components/HubForms";

export const dynamic = "force-dynamic";

export default async function WebinarHub({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = getSharedDb();

  const rows = await sql<any[]>`select * from webinars where id = ${id}::uuid limit 1`;
  const w = rows[0];
  if (!w) notFound();

  const offers = await sql`
    select id, name, headline, start_offset_seconds, units_sold, price_start_cents
    from offers where webinar_id = ${id}::uuid order by created_at asc
  `;
  const curve = await sql`
    select peak_count, ramp_minutes, plateau_pct, end_pct, jitter_pct
    from attendance_curves where webinar_id = ${id}::uuid limit 1
  `;
  const roster = await sql`
    select display_name from name_roster where webinar_id = ${id}::uuid order by display_name asc
  `;

  const curveInitial = curve[0]
    ? {
        peakCount: curve[0].peak_count,
        rampMinutes: curve[0].ramp_minutes,
        plateauPct: Number(curve[0].plateau_pct),
        endPct: Number(curve[0].end_pct),
        jitterPct: Number(curve[0].jitter_pct),
      }
    : { peakCount: 240, rampMinutes: 8, plateauPct: 0.55, endPct: 0.35, jitterPct: 0.03 };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{w.title}</h1>
          <p className="text-sm text-zinc-500">
            /w/{w.slug} · {w.schedule_mode} · {Math.round(w.duration_seconds / 60)} min
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href={`/w/${w.slug}`} target="_blank" className="text-sky-300 hover:underline">
            registration page ↗
          </Link>
          <Link href={`/admin/scripts/${w.slug}`} className="text-sky-300 hover:underline">
            script editor
          </Link>
          <Link href={`/admin/analytics/${w.slug}`} className="text-sky-300 hover:underline">
            analytics
          </Link>
          <Link href={`/admin/live?webinar=${w.id}`} className="text-sky-300 hover:underline">
            moderator console
          </Link>
        </div>
      </header>

      <VideoUpload webinarId={w.id} hasVideo={!!w.video_url} duration={w.duration_seconds} />

      {offers.length > 0 && (
        <section className="rounded-lg bg-zinc-900 p-4">
          <h2 className="mb-2 font-medium">Offers</h2>
          {offers.map((o: any) => (
            <p key={o.id} className="text-sm text-zinc-300">
              <strong>{o.name}</strong> — starts {Math.floor(o.start_offset_seconds / 60)}m{o.price_start_cents ? ` · $${o.price_start_cents / 100}` : ""} · {o.units_sold} sold
            </p>
          ))}
        </section>
      )}
      <OfferForm webinarId={w.id} />

      <ImportChatForm webinarId={w.id} />
      <AudienceSizeForm webinarId={w.id} initial={w.chat_audience_size ?? 240} />
      <RosterForm webinarId={w.id} initial={roster.map((r: any) => r.display_name)} />
      <CurveForm webinarId={w.id} initial={curveInitial} />
      <DeleteWebinarButton webinarId={w.id} title={w.title} />
    </main>
  );
}
