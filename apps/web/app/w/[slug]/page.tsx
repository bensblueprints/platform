import { notFound } from "next/navigation";
import { Suspense } from "react";
import {  getSharedDb  } from "@platform/core";
import { nextJitSlotMs } from "@platform/timeline";
import RegisterForm from "../../../components/RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const sql = getSharedDb();
  const webinars = await sql<any[]>`
    select * from webinars where slug = ${slug} limit 1
  `;
  const w = webinars[0];
  if (!w) notFound();

  // funnel top: record the visit (§11 analytics)
  const utm: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    if (query[k]) utm[k] = query[k];
  }
  await sql`
    insert into page_views (webinar_id, utm)
    values (${w.id}, ${Object.keys(utm).length ? JSON.stringify(utm) : null})
  `;

  let nextSessionAtMs: number | null = null;
  if (w.schedule_mode === "jit") {
    nextSessionAtMs = nextJitSlotMs(Date.now(), w.jit_interval_minutes ?? 15, w.jit_lead_minutes ?? 5);
  } else if (w.schedule_mode === "recurring") {
    const rows = await sql<{ starts_at: Date }[]>`
      select starts_at from sessions where webinar_id = ${w.id} and starts_at >= now()
      order by starts_at asc limit 1
    `;
    nextSessionAtMs = rows[0] ? rows[0].starts_at.getTime() : null;
  }
  // ondemand: null → the form shows "starts right after you register"

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">{w.title}</h1>
      {w.subtitle && <p className="text-lg text-zinc-400">{w.subtitle}</p>}
      <Suspense fallback={null}>
        <RegisterForm slug={w.slug} nextSessionAtMs={nextSessionAtMs} />
      </Suspense>
    </main>
  );
}
