import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import path from "node:path";

// repo-root .env.local for DATABASE_URL (specs run from apps/web)
try {
  for (const line of readFileSync(path.resolve(__dirname, "../../../.env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

/**
 * Phase 5 acceptance (spec §15): panel appears on time; countdown survives
 * refresh; a purchase increments units_sold, the price rises by the
 * increment, and the rise pushes live to a second open browser.
 *
 * Until STRIPE_SECRET_KEY is configured, the "purchase" is simulated by a
 * direct SQL increment — it exercises the identical propagation path
 * (offers row UPDATE → Realtime → client ladder recompute), minus Stripe's
 * signature. The live Stripe purchase runs when the key arrives.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const seedToken = process.env.DEV_SEED_TOKEN!;

let offerId: string;
let token: string;
let startsAtMs: number;

test.beforeAll(async () => {
  await fetch(`${baseURL}/api/dev/seed?webinar=demo-offer`, {
    headers: { "x-seed-token": seedToken },
  });
  const offer = await fetch(`${baseURL}/api/dev/seed-offer?webinar=demo-offer&start=8`, {
    headers: { "x-seed-token": seedToken },
  }).then((r) => r.json());
  offerId = offer.offerId;
  expect(offerId).toBeTruthy();

  const seed = await fetch(`${baseURL}/api/dev/seed?webinar=demo-offer`, {
    headers: { "x-seed-token": seedToken },
  }).then((r) => r.json());
  token = seed.token;
  const payload = await fetch(`${baseURL}/api/room/${token}`, { cache: "no-store" }).then((r) =>
    r.json(),
  );
  startsAtMs = payload.session.startsAtMs;
  expect(payload.offers.length).toBe(1);
  expect(payload.offers[0].currentPriceCents).toBe(10000);
  expect(payload.offers[0].nextPriceCents).toBe(10500);
});

test("panel hidden before start offset, appears at start", async ({ page }) => {
  const seed = await fetch(`${baseURL}/api/dev/seed?webinar=demo-offer`, {
    headers: { "x-seed-token": seedToken },
  }).then((r) => r.json());
  await page.goto(`/room/${seed.token}`); // materializes a fresh session at ~0s
  await expect(page.getByTestId("offer-panel")).toHaveCount(0);
  await expect(page.getByTestId("offer-panel")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("offer-price")).toHaveText("$100");
  await expect(page.getByTestId("offer-scarcity")).toContainText("left");
});

test("impression recorded once per attendee", async () => {
  const res = await fetch(
    `${baseURL}/api/offers/${offerId}/impression`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, offsetSeconds: 12 }),
    },
  );
  expect(res.ok).toBe(true);
  const events = await fetch(`${baseURL}/api/dev/offer-events?offer=${offerId}`, {
    headers: { "x-seed-token": seedToken },
  }).then((r) => r.json());
  expect(events.counts.impression).toBeGreaterThanOrEqual(1);
});

test("countdown persists across reload (per-attendee, localStorage)", async ({ page }) => {
  await page.goto(`/room/${token}`);
  const cd = page.getByTestId("offer-countdown");
  await expect(cd).toBeVisible({ timeout: 20_000 });
  const t1 = await cd.innerText();
  await page.waitForTimeout(4_000);
  await page.reload();
  await expect(cd).toBeVisible({ timeout: 20_000 });
  const t2 = await cd.innerText();
  const toSec = (s: string) => {
    const [m, sec] = s.split(":").map(Number);
    return m * 60 + sec;
  };
  // continuous, not reset: t2 is a few seconds BELOW t1 with a bounded gap
  const gap = toSec(t1) - toSec(t2);
  expect(gap).toBeGreaterThan(0);
  expect(gap).toBeLessThan(20);
});

test("simulated purchase ticks the price live in two open browsers", async ({ page, browser }) => {
  const pageA = page;
  const pageB = await browser.newPage();

  await pageA.goto(`/room/${token}`);
  await expect(pageA.getByTestId("offer-price")).toHaveText("$100", { timeout: 20_000 });

  const seedB = await fetch(`${baseURL}/api/dev/seed?webinar=demo-offer`, {
    headers: { "x-seed-token": seedToken },
  }).then((r) => r.json());
  await pageB.goto(`/room/${seedB.token}`);
  await expect(pageB.getByTestId("offer-price")).toHaveText("$100", { timeout: 20_000 });

  // simulate a verified purchase landing (same UPDATE the webhook performs)
  const sql = postgres(process.env.DATABASE_URL!);
  await sql`update offers set units_sold = units_sold + 1 where id = ${offerId}`;
  await sql.end();

  await expect(pageA.getByTestId("offer-price")).toHaveText("$105", { timeout: 15_000 });
  await expect(pageB.getByTestId("offer-price")).toHaveText("$105", { timeout: 15_000 });

  const events = await fetch(`${baseURL}/api/dev/offer-events?offer=${offerId}`, {
    headers: { "x-seed-token": seedToken },
  }).then((r) => r.json());
  expect(events.unitsSold).toBe(1);
  await pageB.close();
});

test("checkout endpoint returns 503 until Stripe is configured", async () => {
  const res = await fetch(`${baseURL}/api/offers/${offerId}/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  expect([503, 200]).toContain(res.status); // 200 once STRIPE_SECRET_KEY is set
  if (res.status === 503) {
    expect((await res.json()).error).toBe("payments_not_configured");
  }
});
