import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

try {
  for (const line of readFileSync(path.resolve(__dirname, "../../../.env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

/**
 * Phase 8 (spec §15): BullMQ reminder sequences + funnel/retention analytics.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const seedToken = process.env.DEV_SEED_TOKEN!;
const adminKey = process.env.ADMIN_KEY!;
const headers = { "x-seed-token": seedToken };

test("JIT registration enqueues the reminder sequence", async ({ page }) => {
  await fetch(`${baseURL}/api/dev/seed-webinar?slug=e2e-jit&mode=jit&interval=15&lead=5`, { headers });
  await page.goto("/w/e2e-jit");
  await page.getByPlaceholder("Email address").fill("notif-e2e@example.com");
  await page.getByRole("button", { name: "Register for the session" }).click();
  await page.waitForURL(/confirmed\?token=/);

  const res = await fetch(`${baseURL}/api/dev/notif-jobs`, { headers }).then((r) => r.json());
  const mine = res.jobs.filter((j: any) => j.kind !== undefined);
  const kinds = new Set(mine.map((j: any) => j.kind));
  // confirm fired or queued; reminders + post-session delayed
  expect(kinds.has("reminder-10m") || kinds.has("post-session")).toBe(true);
});

test("page view increments visitors on the funnel", async ({ page }) => {
  const before = await page.request
    .get(`/admin/analytics/demo?key=${adminKey}`)
    .then((r) => r.text());
  const beforeVisitors = Number(before.match(/metric-visitors[^>]*>(\d+)</)?.[1] ?? -1);

  await page.goto("/w/demo?utm_source=e2e");
  await page.waitForTimeout(500);

  const after = await page.request
    .get(`/admin/analytics/demo?key=${adminKey}`)
    .then((r) => r.text());
  const afterVisitors = Number(after.match(/metric-visitors[^>]*>(\d+)</)?.[1] ?? -1);
  expect(afterVisitors).toBe(beforeVisitors + 1);
});

test("analytics page renders funnel, retention chart, and offer funnel", async ({ page }) => {
  await page.goto(`/admin/analytics/demo-offer?key=${adminKey}`);
  await expect(page.getByTestId("funnel")).toBeVisible();
  const registrants = await page.getByTestId("metric-registrants").innerText();
  expect(Number(registrants)).toBeGreaterThan(0);

  // offer funnel: impressions >= clicks >= purchases, and revenue per-capita block renders
  const funnelText = await page.getByTestId("offer-funnel").innerText();
  const nums = funnelText.match(/(\d+) impressions → (\d+) clicks → (\d+) purchases/);
  expect(nums).not.toBeNull();
  expect(Number(nums![1])).toBeGreaterThanOrEqual(Number(nums![2]));
  expect(Number(nums![2])).toBeGreaterThanOrEqual(Number(nums![3]));
  await expect(page.getByTestId("revenue-per")).toBeVisible();

  // retention chart renders when attendance exists (demo-offer had rooms joined in earlier suites)
  const chart = page.getByTestId("retention-chart");
  if (await chart.count()) {
    await expect(chart.locator("polyline")).toBeVisible();
  }
});

test("analytics requires the admin key", async ({ page }) => {
  const res = await page.goto("/admin/analytics/demo");
  expect(res?.status()).toBe(404);
});
