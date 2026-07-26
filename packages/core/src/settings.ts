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
