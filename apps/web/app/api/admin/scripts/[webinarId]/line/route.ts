import { getSharedDb } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Inline line edit (spec §7.7): retime, reassign persona, edit text. Marks the line hand-edited. */
export async function PATCH(req: Request, { params }: { params: Promise<{ webinarId: string }> }) {
  const key = process.env.ADMIN_KEY;
  if (!key || req.headers.get("x-admin-key") !== key) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const { webinarId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    offsetSeconds?: number;
    displayName?: string;
    message?: string;
  };
  if (!body.id) return Response.json({ error: "bad_request" }, { status: 400 });

  const updated = await sql`
    update chat_scripts set
      offset_seconds = coalesce(${body.offsetSeconds ?? null}, offset_seconds),
      display_name = coalesce(${body.displayName ?? null}, display_name),
      message = coalesce(${body.message ?? null}, message),
      source = case when source = 'generated' then 'hand' else source end
    where id = ${body.id}::uuid and webinar_id = ${webinarId}::uuid
    returning id
  `;
  if (updated.length === 0) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ updated: true });
}
