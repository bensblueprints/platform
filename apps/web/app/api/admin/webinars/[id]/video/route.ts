import { getScopedUser, canAccessWebinar } from "../../../../../../lib/auth";
import { getSharedDb } from "@platform/core";
import { mp4DurationSeconds, saveVideo } from "../../../../../../lib/video-storage";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/**
 * Video upload (raw body = the mp4). Saves to the persistent volume, reads
 * the duration from the mvhd box, and wires the webinar to the media route.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });
  const { id } = await params;
  if (!(await canAccessWebinar(sql, scopedUser, id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (!req.body) return Response.json({ error: "no_file" }, { status: 400 });

  const webinars = await sql<{ id: string }[]>`
    select id from webinars where id = ${id}::uuid limit 1
  `;
  if (!webinars[0]) return Response.json({ error: "not_found" }, { status: 404 });

  try {
    await saveVideo(id, req.body);
  } catch (err) {
    return Response.json({ error: "write_failed", detail: (err as Error).message }, { status: 500 });
  }

  const duration = mp4DurationSeconds(
    (process.env.VIDEO_STORAGE_DIR ?? "/data/videos") + `/${id}.mp4`,
  );
  await sql`
    update webinars set video_url = ${"/api/media/" + id}
    ${duration ? sql`, duration_seconds = ${duration}` : sql``}
    where id = ${id}
  `;

  return Response.json({ ok: true, durationSeconds: duration });
}
