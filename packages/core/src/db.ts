import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export function createDb(url: string = process.env.DATABASE_URL!): Sql {
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, { max: 5 });
}
