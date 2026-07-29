import Link from "next/link";
import { headers } from "next/headers";
import { getSharedDb } from "@platform/core";
import { getSessionUser } from "../../lib/auth";
import { DeleteWebinarButton } from "../../components/HubForms";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await getSessionUser(
    new Request("http://internal", { headers: await headers() }),
  );
  // middleware already gates this route (session cookie or ?key=)

  const sql = getSharedDb();
  const webinars =
    user?.role === "platform"
      ? await sql`
          select w.id, w.slug, w.title, w.schedule_mode, w.video_url,
                 (select count(*) from registrants r where r.webinar_id = w.id)::int as registrants
          from webinars w order by w.created_at desc
        `
      : await sql`
          select w.id, w.slug, w.title, w.schedule_mode, w.video_url,
                 (select count(*) from registrants r where r.webinar_id = w.id)::int as registrants
          from webinars w where w.tenant_id = ${user?.tenantId ?? null}::uuid
          order by w.created_at desc
        `;

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Webinars</h1>
        <div className="flex items-center gap-3">
          {user && <span className="text-sm text-zinc-400">{user.email}</span>}
          {user && user.role !== "platform" && (
            <Link
              href="/admin/upgrade"
              className="rounded-lg border border-amber-400/50 px-3 py-2 text-sm text-amber-300 hover:bg-zinc-800"
            >
              {user.plan === "free" ? "Upgrade" : `Plan: ${user.plan}`}
            </Link>
          )}
          <Link href="/admin/settings" className="rounded-lg border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-800">
            Settings
          </Link>
          <Link href="/admin/webinars/new" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500">
            New webinar
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="text-sm text-zinc-400 hover:text-white">Sign out</button>
          </form>
        </div>
      </header>

      {webinars.length === 0 && (
        <p className="rounded-lg bg-zinc-900 p-8 text-center text-zinc-400">
          No webinars yet. Create your first one.
        </p>
      )}

      <div className="space-y-2">
        {webinars.map((w: any) => (
          <div key={w.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-zinc-900 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{w.title}</p>
              <p className="text-xs text-zinc-500">
                /w/{w.slug} · {w.schedule_mode} · {w.registrants} registrants · video: {w.video_url ? "yes" : "no"}
              </p>
            </div>
            <Link href={`/w/${w.slug}`} className="text-xs text-sky-300 hover:underline" target="_blank">
              registration
            </Link>
            <Link href={`/mock/${w.slug}`} className="text-xs font-medium text-red-300 hover:underline" target="_blank">
              mock webinar
            </Link>
            <Link href={`/admin/webinars/${w.id}`} className="text-xs text-sky-300 hover:underline">
              manage
            </Link>
            <Link href={`/admin/scripts/${w.slug}`} className="text-xs text-sky-300 hover:underline">
              script
            </Link>
            <Link href={`/admin/analytics/${w.slug}`} className="text-xs text-sky-300 hover:underline">
              analytics
            </Link>
            <Link href={`/admin/live?webinar=${w.id}`} className="text-xs text-sky-300 hover:underline">
              console
            </Link>
            <DeleteWebinarButton webinarId={w.id} title={w.title} />
          </div>
        ))}
      </div>
    </main>
  );
}
