import { getScopedUser, canAccessWebinar } from "../../../../../../lib/auth";
import { getSharedDb } from "@platform/core";
import { deleteWaitingImage, saveWaitingImage } from "../../../../../../lib/video-storage";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Waiting-room image upload (raw body = the image, content-type image/*). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  if (!(await canAccessWebinar(sql, scopedUser, id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const ext = EXT_BY_TYPE[(req.headers.get("content-type") ?? "").split(";")[0]];
  if (!ext) return Response.json({ error: "unsupported_type" }, { status: 415 });
  if (!req.body) return Response.json({ error: "no_file" }, { status: 400 });
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > 8 * 1024 * 1024) return Response.json({ error: "too_large" }, { status: 413 });

  const rows = await sql<{ id: string }[]>`
    select id from webinars where id = ${id}::uuid limit 1
  `;
  if (!rows[0]) return Response.json({ error: "not_found" }, { status: 404 });

  await saveWaitingImage(id, ext, req.body);
  const url = `/api/media/${id}/waiting`;
  await sql`update webinars set waiting_image_url = ${url} where id = ${id}::uuid`;
  return Response.json({ ok: true, url });
}

/** Remove the waiting-room image. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  if (!(await canAccessWebinar(sql, scopedUser, id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  deleteWaitingImage(id);
  await sql`update webinars set waiting_image_url = null where id = ${id}::uuid`;
  return Response.json({ ok: true });
}
