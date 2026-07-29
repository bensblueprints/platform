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
    // pay-first: a WHOP purchase made with this email before signup attaches now
    const claims = await tx<{ plan: "lifetime" | "monthly"; whop_membership_id: string | null }[]>`
      update pending_plan_claims set claimed_at = now()
      where email = ${email} and claimed_at is null
      returning plan, whop_membership_id
    `;
    const claim = claims[0];
    if (claim) {
      await tx`
        update tenants set plan = ${claim.plan}, status = 'active', whop_membership_id = ${claim.whop_membership_id}
        where id = ${t[0].id}
      `;
    }
    const u = await tx<{ id: string }[]>`
      insert into users (email, password_hash, tenant_id, role)
      values (${email}, ${hashPassword(password)}, ${t[0].id}, 'owner')
      returning id
    `;
    return u[0].id;
  });

  const { token, expires } = await createSession(userId);
  const claimed = await sql<{ plan: string }[]>`
    select t.plan from users u join tenants t on t.id = u.tenant_id where u.id = ${userId}::uuid limit 1
  `;
  return Response.json(
    { ok: true, plan: claimed[0]?.plan ?? "free" },
    { headers: { "set-cookie": sessionCookie(token, expires) } },
  );
}
