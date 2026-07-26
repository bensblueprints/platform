import { getSharedDb } from "@platform/core";
import { createSession, sessionCookie, verifyPassword } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  const rows = await sql<{ id: string; password_hash: string }[]>`
    select id, password_hash from users where email = ${email} limit 1
  `;
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    return Response.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const { token, expires } = await createSession(user.id);
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(token, expires) } });
}
