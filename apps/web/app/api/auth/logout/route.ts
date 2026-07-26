import { clearSessionCookie, destroySession } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await destroySession(req);
  return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
}
