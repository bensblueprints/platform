import {  getSharedDb, getRoomPayload  } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(token)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const payload = await getRoomPayload(sql, token);
  if (!payload) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(payload, { headers: { "cache-control": "no-store" } });
}
