import { getSharedDb, mask, setSettings, deleteSetting } from "@platform/core";
import { isAdminAuthorized } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

const KNOWN_KEYS = [
  "INFERENCE_BASE_URL",
  "INFERENCE_API_KEY",
  "INFERENCE_MODEL",
  "TRANSCRIBE_MODEL",
  "GHL_API_KEY",
  "GHL_LOCATION_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "YOUTUBE_COOKIES",
  "PURCHASE_WEBHOOK_SECRET",
  "PUBLIC_ORIGIN",
] as const;

/** Masked view of integration settings (owner Settings page). */
export async function GET(req: Request) {
  if (!(await isAdminAuthorized(req))) return Response.json({ error: "not_found" }, { status: 404 });

  const rows = await sql<{ key: string; value: string }[]>`
    select key, value from app_settings
  `;
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const settings = KNOWN_KEYS.map((key) => {
    const value = map.get(key) ?? process.env[key] ?? null;
    return { key, set: value != null, masked: mask(value), source: map.has(key) ? "settings" : process.env[key] ? "env" : null };
  });
  return Response.json({ settings });
}

/** Save settings. Blank fields are left unchanged; "__DELETE__" removes. */
export async function POST(req: Request) {
  if (!(await isAdminAuthorized(req))) return Response.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const updates: Record<string, string> = {};
  for (const key of KNOWN_KEYS) {
    const value = body[key];
    if (value === undefined || value === "") continue;
    if (value === "__DELETE__") {
      await deleteSetting(sql, key);
      continue;
    }
    updates[key] = value;
  }
  await setSettings(sql, updates);
  return Response.json({ saved: Object.keys(updates).length });
}
