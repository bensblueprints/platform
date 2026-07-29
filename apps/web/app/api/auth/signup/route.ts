import { getSharedDb } from "@platform/core";
import { createSession, hashPassword, sessionCookie } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Public signup: every account is its own tenant (free plan, BYOK). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string; name?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const taken = await sql<{ id: string }[]>`
    select id from users where email = ${email} limit 1
  `;
  if (taken.length > 0) {
    return Response.json({ error: "email_taken" }, { status: 409 });
  }

  const userId = await sql.begin(async (tx) => {
    const t = await tx<{ id: string }[]>`
      insert into tenants (name, plan, status)
      values (${body.name?.trim() || email.split("@")[0]}, 'free', 'active')
      returning id
    `;
    const u = await tx<{ id: string }[]>`
      insert into users (email, password_hash, tenant_id, role)
      values (${email}, ${hashPassword(password)}, ${t[0].id}, 'owner')
      returning id
    `;
    return u[0].id;
  });

  const { token, expires } = await createSession(userId);
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookie(token, expires) } });
}
