import type { Sql } from "./db";

const TTL_MS = 60_000;
let cache: { at: number; values: Map<string, string> } | null = null;

async function load(sql: Sql): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const rows = await sql<{ key: string; value: string }[]>`
    select key, value from app_settings
  `;
  cache = { at: Date.now(), values: new Map(rows.map((r) => [r.key, r.value])) };
  return cache.values;
}

/** UI-saved setting, falling back to the process env. */
export async function getSetting(sql: Sql, key: string): Promise<string | null> {
  const values = await load(sql);
  return values.get(key) ?? process.env[key] ?? null;
}

export async function setSettings(sql: Sql, entries: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    if (value === "") continue; // blank = leave unchanged
    await sql`
      insert into app_settings (key, value) values (${key}, ${value})
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
  }
  cache = null;
}

export async function deleteSetting(sql: Sql, key: string): Promise<void> {
  await sql`delete from app_settings where key = ${key}`;
  cache = null;
}

export function mask(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/** Per-tenant settings (BYOK): a tenant's own keys live in tenant_settings;
 * the platform tenant falls back to the global app_settings/env. */
export async function getTenantSetting(
  sql: Sql,
  tenantId: string | null,
  key: string,
  platformTenantId: string | null,
): Promise<string | null> {
  if (tenantId && tenantId !== platformTenantId) {
    const rows = await sql<{ value: string }[]>`
      select value from tenant_settings where tenant_id = ${tenantId} and key = ${key} limit 1
    `;
    return rows[0]?.value ?? null;
  }
  return getSetting(sql, key);
}

export async function setTenantSettings(
  sql: Sql,
  tenantId: string,
  entries: Record<string, string>,
): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    if (value === "") continue;
    await sql`
      insert into tenant_settings (tenant_id, key, value) values (${tenantId}, ${key}, ${value})
      on conflict (tenant_id, key) do update set value = excluded.value, updated_at = now()
    `;
  }
}

export async function deleteTenantSetting(sql: Sql, tenantId: string, key: string): Promise<void> {
  await sql`delete from tenant_settings where tenant_id = ${tenantId} and key = ${key}`;
}

/** The single platform tenant (backfilled in 0016), cached per process. */
let platformTenant: { id: string } | null = null;
export async function getPlatformTenantId(sql: Sql): Promise<string | null> {
  if (platformTenant) return platformTenant.id;
  const rows = await sql<{ id: string }[]>`
    select t.id from tenants t join users u on u.tenant_id = t.id
    where u.role = 'platform' order by t.created_at asc limit 1
  `;
  platformTenant = rows[0] ?? null;
  return platformTenant?.id ?? null;
}
