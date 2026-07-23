import { notFound } from "next/navigation";
import { getSharedDb, getWebinarAnalytics } from "@platform/core";

export const dynamic = "force-dynamic";

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** Retention hero chart (§11): present-per-30s-bucket with offer start marked. */
function RetentionChart({
  retention,
  offerStartSeconds,
}: {
  retention: { offsetSeconds: number; present: number }[];
  offerStartSeconds: number | null;
}) {
  const W = 800, H = 240, PAD = 32;
  if (retention.length === 0) {
    return <p className="text-sm text-zinc-500">No attendance data yet — the curve appears after a session.</p>;
  }
  const maxX = Math.max(...retention.map((r) => r.offsetSeconds), 1);
  const maxY = Math.max(...retention.map((r) => r.present), 1);
  const x = (s: number) => PAD + (s / maxX) * (W - 2 * PAD);
  const y = (p: number) => H - PAD - (p / maxY) * (H - 2 * PAD);
  const points = retention.map((r) => `${x(r.offsetSeconds)},${y(r.present)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-zinc-900" data-testid="retention-chart" role="img" aria-label="Retention curve">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#3f3f46" />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#3f3f46" />
      <polyline points={points} fill="none" stroke="#f87171" strokeWidth="2" />
      <text x={W - PAD} y={H - PAD + 16} fill="#71717a" fontSize="11" textAnchor="end">
        {Math.round(maxX / 60)} min · peak {maxY}
      </text>
      {offerStartSeconds != null && offerStartSeconds <= maxX && (
        <g>
          <line x1={x(offerStartSeconds)} y1={PAD} x2={x(offerStartSeconds)} y2={H - PAD} stroke="#fbbf24" strokeDasharray="4 3" />
          <text x={x(offerStartSeconds) + 4} y={PAD + 12} fill="#fbbf24" fontSize="11">
            offer
          </text>
        </g>
      )}
    </svg>
  );
}

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const [{ slug }, { key }] = await Promise.all([params, searchParams]);
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) notFound();

  const sql = getSharedDb();
  const webinars = await sql<{ id: string; title: string }[]>`
    select id, title from webinars where slug = ${slug} limit 1
  `;
  const w = webinars[0];
  if (!w) notFound();

  const a = await getWebinarAnalytics(sql, w.id);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{w.title} — analytics</h1>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="funnel">
        {[
          ["Visitors", a.visitors],
          ["Registrants", a.registrants],
          ["Attendees", a.attendees],
          ["Show rate", `${a.showRatePct}%`],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg bg-zinc-900 p-4">
            <p className="text-xs text-zinc-400">{label}</p>
            <p className="text-2xl font-bold" data-testid={`metric-${String(label).toLowerCase().replace(" ", "-")}`}>
              {value}
            </p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-300">Retention vs offer</h2>
        <RetentionChart retention={a.retention} offerStartSeconds={a.offers[0]?.startOffsetSeconds ?? null} />
      </section>

      <section data-testid="offer-funnel">
        <h2 className="mb-2 text-sm font-medium text-zinc-300">Offers</h2>
        {a.offers.length === 0 && <p className="text-sm text-zinc-500">No offers.</p>}
        {a.offers.map((o) => (
          <div key={o.offerId} className="mb-2 rounded-lg bg-zinc-900 p-4 text-sm">
            <p className="font-medium">{o.name}</p>
            <p className="text-zinc-400">
              {o.impressions} impressions → {o.clicks} clicks → {o.purchases} purchases · {money(o.revenueCents)}
            </p>
          </div>
        ))}
        <p className="mt-3 text-sm text-zinc-300" data-testid="revenue-per">
          {money(a.revenueCents)} total · {money(a.revenuePerRegistrantCents)} per registrant ·{" "}
          {money(a.revenuePerAttendeeCents)} per attendee
        </p>
      </section>
    </main>
  );
}
