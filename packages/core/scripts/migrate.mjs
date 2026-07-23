// Applies supabase/migrations/*.sql in lexical order, tracked in _migrations.
// Loads DATABASE_URL from repo-root .env.local when present.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const envFile = path.join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (env or .env.local)");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const dir = path.join(root, "supabase", "migrations");

await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz default now())`;
const done = new Set((await sql`select name from _migrations`).map((r) => r.name));

for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) {
    console.log(`already applied: ${file}`);
    continue;
  }
  const body = readFileSync(path.join(dir, file), "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(body);
    await tx`insert into _migrations (name) values (${file})`;
  });
  console.log(`applied: ${file}`);
}
await sql.end();
