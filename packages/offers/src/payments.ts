/**
 * Stripe payments adapter (spec §9). Checkout Sessions are created at click
 * time with inline price_data — never pre-created prices, so the price
 * shown is the price paid. Webhook verification is the only path that may
 * increment units_sold (§12, §16.4/16.5).
 */

export interface CheckoutArgs {
  secretKey: string;
  offerId: string;
  offerName: string;
  amountCents: number;
  registrantToken: string;
  sessionId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  checkoutSessionId: string;
  url: string;
}

export async function createCheckoutSession(args: CheckoutArgs): Promise<CheckoutResult> {
  const body = new URLSearchParams({
    mode: "payment",
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(args.amountCents),
    "line_items[0][price_data][product_data][name]": args.offerName,
    "metadata[offer_id]": args.offerId,
    "metadata[registrant_token]": args.registrantToken,
    "metadata[session_id]": args.sessionId,
  });

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`stripe checkout failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { id: string; url: string };
  return { checkoutSessionId: json.id, url: json.url };
}

/**
 * Minimal Stripe webhook-signature verification (HMAC-SHA256 over
 * `${timestamp}.${rawBody}` against whsec), implemented on Web Crypto so the
 * adapter has no SDK dependency.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  const parts = new Map(
    signatureHeader.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  );
  const timestamp = parts.get("t");
  const signatures = signatureHeader
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .map((kv) => kv.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const expected = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((sig) => sig.length === expected.length && timingSafeEqual(sig, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface StripeCheckoutCompleted {
  stripeSessionId: string;
  offerId: string;
  registrantToken: string;
  sessionId: string;
  amountCents: number | null;
}

/** Parse a verified checkout.session.completed event payload. */
export function parseCheckoutCompleted(event: unknown): StripeCheckoutCompleted | null {
  const e = event as any;
  if (e?.type !== "checkout.session.completed") return null;
  const obj = e.data?.object;
  if (!obj?.id || !obj?.metadata?.offer_id) return null;
  return {
    stripeSessionId: obj.id,
    offerId: obj.metadata.offer_id,
    registrantToken: obj.metadata.registrant_token ?? "",
    sessionId: obj.metadata.session_id ?? "",
    amountCents: obj.amount_total ?? null,
  };
}
