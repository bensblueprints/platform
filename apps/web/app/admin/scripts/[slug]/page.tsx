import { notFound } from "next/navigation";
import { Suspense } from "react";
import { headers } from "next/headers";
import { getSharedDb } from "@platform/core";
import { isAdminAuthorized } from "../../../../lib/auth";
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
  const authorized = await isAdminAuthorized(
    new Request(`https://x/admin/scripts/${slug}${key ? `?key=${key}` : ""}`, {
      headers: await headers(),
    }),
  );
  if (!authorized) notFound();

  const sql = getSharedDb();
  const rows = await sql<{ id: string; title: string; duration_seconds: number }[]>`
    select id, title, duration_seconds from webinars where slug = ${slug} limit 1
  `;
  const w = rows[0];
  if (!w) notFound();

  return (
    <Suspense fallback={null}>
      <ScriptEditor webinarId={w.id} title={w.title} durationSeconds={w.duration_seconds} adminKey={key ?? ""} />
    </Suspense>
  );
}
