import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSharedDb } from "@platform/core";

export const SESSION_COOKIE = "platform_session";
const SESSION_DAYS = 30;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

export interface SessionUser {
  id: string;
  email: string;
}

export async function createSession(userId: string): Promise<{ token: string; expires: Date }> {
  const sql = getSharedDb();
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql`
    insert into auth_sessions (token_hash, user_id, expires_at)
    values (${sha256(token)}, ${userId}, ${expires.toISOString()})
  `;
  return { token, expires };
}

/** Resolve the session cookie to a user, or null. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  if (!token) return null;

  const sql = getSharedDb();
  const rows = await sql<{ id: string; email: string }[]>`
    select u.id, u.email
    from auth_sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)} and s.expires_at > now()
    limit 1
  `;
  return rows[0] ?? null;
}

export async function destroySession(req: Request): Promise<void> {
  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  if (!token) return;
  const sql = getSharedDb();
  await sql`delete from auth_sessions where token_hash = ${sha256(token)}`;
}

/**
 * Admin authorization: valid session user, or the interim ADMIN_KEY header/
 * query param (kept for e2e and scripts until tenant roles land).
 */
export async function isAdminAuthorized(req: Request): Promise<boolean> {
  if (await getSessionUser(req)) return true;
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  const url = new URL(req.url);
  return req.headers.get("x-admin-key") === key || url.searchParams.get("key") === key;
}

export function sessionCookie(token: string, expires: Date): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}; Secure`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}
