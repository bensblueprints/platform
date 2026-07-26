import { createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { getSetting, getSharedDb } from "@platform/core";

export const DOC_COOKIE = "doc_unlock";
const COOKIE_HOURS = 12;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function docPasswordHash(): Promise<string | null> {
  return getSetting(getSharedDb(), "DOC_PASSWORD_HASH");
}

export async function verifyDocPassword(password: string): Promise<boolean> {
  const stored = await docPasswordHash();
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, "hex"));
}

function sign(ts: number, secret: string): string {
  return sha256(`${ts}.${secret}`);
}

export function docCookieValue(secret: string): string {
  const ts = Date.now();
  return `${ts}.${sign(ts, secret)}`;
}

export async function isDocUnlocked(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  const raw = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${DOC_COOKIE}=`))
    ?.split("=")[1];
  if (!raw) return false;
  const [tsStr, sig] = raw.split(".");
  const ts = Number(tsStr);
  if (!ts || !sig) return false;
  if (Date.now() - ts > COOKIE_HOURS * 3600_000) return false;
  const secret = await docPasswordHash();
  if (!secret) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(sign(ts, secret)));
}

export function docCookie(secret: string): string {
  return `${DOC_COOKIE}=${docCookieValue(secret)}; Path=/documentation; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_HOURS * 3600}; Secure`;
}

export async function docCookieSecret(): Promise<string | null> {
  return docPasswordHash();
}
