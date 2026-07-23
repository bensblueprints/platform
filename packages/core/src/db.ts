import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export function createDb(url: string = process.env.DATABASE_URL!): Sql {
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, { max: 5 });
}

let shared: Sql | null = null;

/**
 * One shared pool per process. Route modules and pages must use this —
 * a createDb() per module exhausted Postgres' connection slots on the
 * Supabase box (found 2026-07-23: "remaining connection slots reserved").
 */
export function getSharedDb(): Sql {
  if (!shared) shared = createDb();
  return shared;
}
