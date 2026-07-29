import { createHmac, timingSafeEqual } from "node:crypto";
import { getSharedDb, getSetting } from "@platform/core";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/**
 * WHOP webhook: activates or revokes a tenant's plan by the buyer's email.
 * Signature: whop-signature header "t=<ts>,v1=<hmac-sha256(secret, ts.body)>".
 *
 * Events handled: membership_activated / membership_deactivated (and the
 * payment_succeeded / payment_failed aliases some WHOP configs send).
 * Product → plan mapping comes from WHOP_PRODUCT_LIFETIME_ID /
 * WHOP_PRODUCT_MONTHLY_ID in Settings.
 */
export async function POST(req: Request) {
  const secret = await getSetting(sql, "WHOP_WEBHOOK_SECRET");
  if (!secret) return Response.json({ error: "webhook_not_configured" }, { status: 500 });

  const raw = await req.text();
  const sigHeader = req.headers.get("whop-signature") ?? "";
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=") as [string, string]));
  const ts = parts.t ?? "";
  const expected = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  const ok =
    parts.v1 &&
    ts &&
    timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(parts.v1, "utf8"));
  if (!ok) return Response.json({ error: "bad_signature" }, { status: 401 });

  const event = (() => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })();
  if (!event) return Response.json({ error: "bad_request" }, { status: 400 });

  const action: string = event.action ?? event.type ?? "";
  const data = event.data ?? event;
  const email: string | undefined =
    data.user_email ?? data.email ?? data.user?.email ?? data.customer?.email;
  const productId: string | undefined = data.product_id ?? data.product?.id ?? data.product;
  const membershipId: string | undefined = data.id ?? data.membership_id;

  if (!email) return Response.json({ error: "no_email" }, { status: 400 });

  const lifetimeId = await getSetting(sql, "WHOP_PRODUCT_LIFETIME_ID");
  const monthlyId = await getSetting(sql, "WHOP_PRODUCT_MONTHLY_ID");
  const plan =
    productId && monthlyId && productId === monthlyId
      ? "monthly"
      : productId && lifetimeId && productId === lifetimeId
        ? "lifetime"
        : "lifetime"; // single-product setups default to lifetime

  const users = await sql<{ id: string; tenant_id: string }[]>`
    select id, tenant_id from users where email = ${email.toLowerCase()} limit 1
  `;
  const user = users[0];
  if (!user?.tenant_id) {
    // buyer has no account yet — they can sign up with the same email and
    // the next webhook replay (or a manual re-run) will attach the plan
    return Response.json({ ok: false, reason: "no_account_for_email" }, { status: 202 });
  }

  if (action.includes("activated") || action === "payment_succeeded") {
    await sql`
      update tenants set plan = ${plan}, status = 'active',
        whop_membership_id = ${membershipId ?? null}, whop_email = ${email.toLowerCase()}
      where id = ${user.tenant_id}::uuid
    `;
    console.log(`[whop] ${action}: ${email} -> ${plan}`);
    return Response.json({ ok: true, plan });
  }

  if (action.includes("deactivated") || action === "payment_failed") {
    const status = action === "payment_failed" ? "past_due" : "cancelled";
    await sql`
      update tenants set status = ${status} where id = ${user.tenant_id}::uuid
    `;
    console.log(`[whop] ${action}: ${email} -> ${status}`);
    return Response.json({ ok: true, status });
  }

  return Response.json({ ok: true, ignored: action });
}
