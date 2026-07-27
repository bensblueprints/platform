import { docCookie, verifyDocPassword, docCookieSecret } from "../../../../../lib/doc-vault";

export const dynamic = "force-dynamic";

/** Plain-form unlock (no client JS — the vault must work without /_next chunks). */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const password = (form?.get("password") ?? "").toString();
  const ok = await verifyDocPassword(password);

  const base = new URL(req.url).origin;
  if (!ok) {
    return Response.redirect(`${base}/documentation?error=1`, 303);
  }
  const secret = await docCookieSecret();
  return new Response(null, {
    status: 303,
    headers: {
      location: `${base}/documentation`,
      "set-cookie": docCookie(secret!),
    },
  });
}
