import { notFound } from "next/navigation";
import Link from "next/link";
import { createDb } from "@platform/core";

export const dynamic = "force-dynamic";

export default async function ConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ slug }, { token }] = await Promise.all([params, searchParams]);
  if (!token) notFound();

  const sql = createDb();
  const rows = await sql<any[]>`
    select r.first_name, r.timezone, r.access_token, w.title, s.starts_at, w.duration_seconds
    from registrants r
    join webinars w on w.id = r.webinar_id
    left join sessions s on s.id = r.session_id
    where r.access_token = ${token} and w.slug = ${slug}
    limit 1
  `;
  const r = rows[0];
  if (!r) notFound();

  const tz = r.timezone ?? "UTC";
  const when = r.starts_at
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(r.starts_at)
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">You're registered{ r.first_name ? `, ${r.first_name}` : "" }</h1>
      <p className="text-lg text-zinc-300">{r.title}</p>
      {when ? (
        <>
          <p className="text-xl" data-testid="confirmed-time">
            {when}
          </p>
          <a
            href={`/api/ics/${token}`}
            className="rounded-lg border border-zinc-600 px-5 py-2.5 text-sm hover:bg-zinc-800"
          >
            Add to calendar (.ics)
          </a>
        </>
      ) : (
        <p className="text-xl" data-testid="confirmed-time">
          The session starts as soon as you join.
        </p>
      )}
      <Link
        href={`/room/${token}`}
        className="rounded-lg bg-red-600 px-8 py-3 text-lg font-semibold transition-colors hover:bg-red-500"
      >
        {when ? "Go to the room" : "Join the session now"}
      </Link>
    </main>
  );
}
