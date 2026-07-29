import { notFound } from "next/navigation";
import { Suspense } from "react";
import { headers } from "next/headers";
import { getSharedDb } from "@platform/core";
import { getSessionUser, canAccessWebinar } from "../../../../lib/auth";
import ScriptEditor from "./ScriptEditor";

export const dynamic = "force-dynamic";

export default async function ScriptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const [{ slug }, { key }] = await Promise.all([params, searchParams]);
  const sql = getSharedDb();
  const user = await getSessionUser(new Request("https://x/", { headers: await headers() }));

  const rows = await sql<{ id: string; title: string; duration_seconds: number }[]>`
    select id, title, duration_seconds from webinars where slug = ${slug} limit 1
  `;
  const w = rows[0];
  if (!w || !user || !(await canAccessWebinar(sql, user, w.id))) notFound();

  return (
    <Suspense fallback={null}>
      <ScriptEditor webinarId={w.id} title={w.title} durationSeconds={w.duration_seconds} adminKey={key ?? ""} />
    </Suspense>
  );
}
