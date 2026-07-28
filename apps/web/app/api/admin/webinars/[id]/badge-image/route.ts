import { isAdminAuthorized } from "../../../../../../lib/auth";
import { getSharedDb } from "@platform/core";
import { saveBadgeImage } from "../../../../../../lib/video-storage";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

const EXT_BY_TYPE: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Press-badge logo upload (raw body = the image file, `?name=` must match a
 * badge name in the webinar's waiting_badges list). Served publicly from
 * /api/media/<id>/badge/<name>; the room falls back to a text pill when no
 * logo exists for a badge.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthorized(req))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const { id } = await params;
  const name = new URL(req.url).searchParams.get("name")?.trim();
  if (!name || name.length > 60) return Response.json({ error: "bad_name" }, { status: 400 });
  const ext = EXT_BY_TYPE[(req.headers.get("content-type") ?? "").split(";")[0]];
  if (!ext) return Response.json({ error: "unsupported_type" }, { status: 415 });
  if (!req.body) return Response.json({ error: "no_file" }, { status: 400 });

  const rows = await sql<{ id: string }[]>`
    select id from webinars where id = ${id}::uuid limit 1
  `;
  if (!rows[0]) return Response.json({ error: "not_found" }, { status: 404 });

  await saveBadgeImage(id, name, ext, req.body);
  return Response.json({ ok: true, url: `/api/media/${id}/badge/${encodeURIComponent(name)}` });
}
