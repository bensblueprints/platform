import { getSharedDb, setSettings, deleteSetting, setTenantSettings, deleteTenantSetting } from "@platform/core";
import { getScopedUser } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

/** Customer tenants manage their own inference keys (BYOK). */
const TENANT_KEYS = [
  "INFERENCE_BASE_URL",
  "INFERENCE_API_KEY",
  "INFERENCE_MODEL",
  "TRANSCRIBE_MODEL",
] as const;

/** Platform-level integrations — the platform tenant only. */
const PLATFORM_KEYS = [
  "GHL_API_KEY",
  "GHL_LOCATION_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "YOUTUBE_COOKIES",
  "PURCHASE_WEBHOOK_SECRET",
  "PUBLIC_ORIGIN",
  "BRANDFETCH_CLIENT_ID",
  "WHOP_LIFETIME_URL",
  "WHOP_MONTHLY_URL",
  "WHOP_WEBHOOK_SECRET",
  "WHOP_PRODUCT_LIFETIME_ID",
  "WHOP_PRODUCT_MONTHLY_ID",
] as const;

/** Full view of integration settings (values visible — this page is for the
 * account owner). Tenants see their own keys; platform sees the globals. */
export async function GET(req: Request) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });

  const settings: { key: string; set: boolean; value: string | null; source: string | null }[] = [];

  if (scopedUser.role === "platform") {
    const rows = await sql<{ key: string; value: string }[]>`select key, value from app_settings`;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    for (const key of [...TENANT_KEYS, ...PLATFORM_KEYS]) {
      const value = map.get(key) ?? process.env[key] ?? null;
      settings.push({ key, set: value != null, value, source: map.has(key) ? "settings" : process.env[key] ? "env" : null });
    }
  } else {
    const rows = await sql<{ key: string; value: string }[]>`
      select key, value from tenant_settings where tenant_id = ${scopedUser.tenantId}::uuid
    `;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    for (const key of TENANT_KEYS) {
      const value = map.get(key) ?? null;
      settings.push({ key, set: value != null, value, source: value != null ? "settings" : null });
    }
  }

  return Response.json({ settings, role: scopedUser.role, plan: scopedUser.plan });
}

/** Save settings. Blank fields are left unchanged; "__DELETE__" removes. */
export async function POST(req: Request) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const tenantUpdates: Record<string, string> = {};
  const platformUpdates: Record<string, string> = {};

  for (const key of TENANT_KEYS) {
    const value = body[key];
    if (value === undefined || value === "") continue;
    if (value === "__DELETE__") {
      if (scopedUser.role === "platform") await deleteSetting(sql, key);
      else await deleteTenantSetting(sql, scopedUser.tenantId!, key);
      continue;
    }
    if (scopedUser.role === "platform") platformUpdates[key] = value;
    else tenantUpdates[key] = value;
  }
  if (scopedUser.role === "platform") {
    for (const key of PLATFORM_KEYS) {
      const value = body[key];
      if (value === undefined || value === "") continue;
      if (value === "__DELETE__") {
        await deleteSetting(sql, key);
        continue;
      }
      platformUpdates[key] = value;
    }
    await setSettings(sql, platformUpdates);
  } else {
    await setTenantSettings(sql, scopedUser.tenantId!, tenantUpdates);
  }

  return Response.json({ saved: Object.keys(tenantUpdates).length + Object.keys(platformUpdates).length });
}
