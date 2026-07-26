import { docCookie, verifyDocPassword, docCookieSecret } from "../../../../lib/doc-vault";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const ok = await verifyDocPassword(body.password ?? "");
  if (!ok) {
    return Response.json({ error: "wrong_password" }, { status: 401 });
  }
  const secret = await docCookieSecret();
  return Response.json({ ok: true }, { headers: { "set-cookie": docCookie(secret!) } });
}
