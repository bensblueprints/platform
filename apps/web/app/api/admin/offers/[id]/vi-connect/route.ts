import { getSetting, getSharedDb } from "@platform/core";
import { getScopedUser, canAccessWebinar } from "../../../../../../lib/auth";

export const dynamic = "force-dynamic";

const sql = getSharedDb();

const VI_TIMEOUT_MS = 10_000;

interface ViInvoice {
  id: string;
  slug?: string;
  title?: string;
  status?: string;
  currency?: string;
  priceCents?: number;
  checkoutUrl?: string;
}

/** Normalize the instance URL to an origin; https only (http allowed for localhost dev). */
function parseViUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !local) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** fetch wrapper: null on network error/timeout. The API key never leaves this scope. */
async function viFetch(base: string, path: string, apiKey: string, init?: RequestInit) {
  try {
    return await fetch(`${base}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(VI_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

type ViResult = { invoices: ViInvoice[] } | { error: "invalid_api_key" | "vi_unreachable" | "vi_error"; status?: number };

async function listInvoices(base: string, apiKey: string): Promise<ViResult> {
  const res = await viFetch(base, "/api/v1/invoices", apiKey);
  if (!res) return { error: "vi_unreachable" };
  if (res.status === 401) return { error: "invalid_api_key" };
  if (!res.ok) return { error: "vi_error", status: res.status };
  const body = (await res.json().catch(() => ({}))) as { invoices?: ViInvoice[] };
  return { invoices: Array.isArray(body.invoices) ? body.invoices : [] };
}

function viErrorResponse(e: { error: string; status?: number }) {
  if (e.error === "invalid_api_key") {
    return Response.json(
      { error: "invalid_api_key", message: "Viral Invoice rejected the API key — check it under Settings → API Keys." },
      { status: 400 },
    );
  }
  if (e.error === "vi_unreachable") {
    return Response.json(
      { error: "vi_unreachable", message: "Could not reach the Viral Invoice instance (timeout or network error)." },
      { status: 502 },
    );
  }
  return Response.json({ error: "vi_error", message: `Viral Invoice returned HTTP ${e.status}.` }, { status: 502 });
}

/**
 * One-shot bridge to a Viral Invoice instance. The API key is used for this
 * request only — it is never stored or logged.
 * Body: { action: "list", viUrl, apiKey }
 *     | { action: "connect", viUrl, apiKey, invoiceId }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const scopedUser = await getScopedUser(req);
  if (!scopedUser) return Response.json({ error: "not_found" }, { status: 404 });
  const { id: offerId } = await params;

  const offers = await sql<{ id: string; webinar_id: string }[]>`
    select id, webinar_id from offers where id = ${offerId}::uuid limit 1
  `;
  const offer = offers[0];
  if (!offer || !(await canAccessWebinar(sql, scopedUser, offer.webinar_id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    viUrl?: string;
    apiKey?: string;
    invoiceId?: string;
  };
  const base = parseViUrl(body.viUrl);
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!base || !apiKey) return Response.json({ error: "bad_request" }, { status: 400 });

  if (body.action === "list") {
    const result = await listInvoices(base, apiKey);
    if ("error" in result) return viErrorResponse(result);
    return Response.json({
      invoices: result.invoices.map((i) => ({
        id: i.id,
        title: i.title ?? "",
        status: i.status ?? "",
        currency: i.currency ?? "USD",
        priceCents: i.priceCents ?? null,
      })),
    });
  }

  if (body.action === "connect") {
    const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
    if (!invoiceId) return Response.json({ error: "bad_request" }, { status: 400 });

    const result = await listInvoices(base, apiKey);
    if ("error" in result) return viErrorResponse(result);
    const invoice = result.invoices.find((i) => i.id === invoiceId);
    if (!invoice?.checkoutUrl) {
      return Response.json({ error: "invoice_not_found" }, { status: 400 });
    }

    await sql`update offers set button_url = ${invoice.checkoutUrl} where id = ${offer.id}`;

    const secret = await getSetting(sql, "PURCHASE_WEBHOOK_SECRET");
    if (!secret) {
      return Response.json(
        {
          error: "purchase_webhook_secret_missing",
          message: "Set PURCHASE_WEBHOOK_SECRET in /admin/settings first — Viral Invoice signs each payment callback with it.",
        },
        { status: 400 },
      );
    }

    const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(/:$/, "");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
    const webhookUrl = `${proto}://${host}/api/offers/${offer.id}/purchase`;

    const reg = await viFetch(base, `/api/v1/invoices/${encodeURIComponent(invoiceId)}/webhook`, apiKey, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, secret }),
    });
    if (!reg) return viErrorResponse({ error: "vi_unreachable" });
    if (reg.status === 401) return viErrorResponse({ error: "invalid_api_key" });
    if (!reg.ok) return viErrorResponse({ error: "vi_error", status: reg.status });

    return Response.json({ ok: true, checkoutUrl: invoice.checkoutUrl });
  }

  return Response.json({ error: "bad_request" }, { status: 400 });
}
