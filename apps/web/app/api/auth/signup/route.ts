import { getSharedDb } from "@platform/core";
import { createSession, hashPassword, sessionCookie } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Bootstrap-only signup: allowed while zero users exist (first = owner). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const existing = await sql<{ c: number }[]>`select count(*)::int as c from users`;
  if (existing[0].c > 0) {
    return Response.json({ error: "signup_closed" }, { status: 403 });
  }

  const inserted = await sql<{ id: string }[]>`
    insert into users (email, password_hash) values (${email}, ${hashPassword(password)})
    on conflict (email) do nothing
    returning id
  `;
  if (inserted.length === 0) return Response.json({ error: "signup_closed" }, { status: 403 });

  const { token, expires } = await createSession(inserted[0].id);
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(token, expires) } });
}
