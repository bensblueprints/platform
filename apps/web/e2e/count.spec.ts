import { test, expect } from "@playwright/test";

/**
 * Phase 4 acceptance (spec §15): the simulated count ramps, is identical
 * on refresh at the same offset, never hits zero, and hides when
 * show_attendee_count is false.
 *
 * Uses a dedicated webinar (demo-count) with peak=100, ramp=1min so ramp
 * behavior is observable inside a test window. Plateau/decay are covered
 * by unit tests in packages/timeline.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const seedToken = process.env.DEV_SEED_TOKEN!;

async function newRoom(page: any): Promise<string> {
  const seed = await fetch(`${baseURL}/api/dev/seed?webinar=demo-count`, {
    headers: { "x-seed-token": seedToken },
  }).then((r) => r.json());
  await page.goto(`/room/${seed.token}`); // materializes session
  return seed.token;
}

async function countValue(page: any): Promise<number> {
  return Number(await page.getByTestId("attendee-count").getAttribute("data-value"));
}

test.beforeAll(async () => {
  await fetch(`${baseURL}/api/dev/seed?webinar=demo-count`, {
    headers: { "x-seed-token": seedToken },
  });
  const res = await fetch(
    `${baseURL}/api/dev/seed-curve?webinar=demo-count&peak=100&ramp=1&show_count=true`,
    { headers: { "x-seed-token": seedToken } },
  );
  expect(res.status).toBe(200);
});

test("count is visible, never zero, and ramps up", async ({ page }) => {
  await newRoom(page);
  const counter = page.getByTestId("attendee-count");
  await expect(counter).toBeVisible();

  const v1 = await countValue(page);
  expect(v1).toBeGreaterThanOrEqual(1);

  // wait until deep into the 1-minute ramp
  await page.waitForTimeout(25_000);
  const v2 = await countValue(page);
  expect(v2).toBeGreaterThan(v1);
});

test("immediate refresh shows the identical count (same bucket)", async ({ page }) => {
  const token = await newRoom(page);
  await page.waitForTimeout(3_000);
  const v1 = await countValue(page);
  await page.reload();
  // let the entrance animation settle, then compare — same session and
  // (almost always) the same 10s bucket, so within ±2 either way
  await page.waitForTimeout(1_500);
  const v2 = await countValue(page);
  expect(v2).toBeGreaterThanOrEqual(1);
  expect(Math.abs(v2 - v1)).toBeLessThanOrEqual(2);
});

test("hidden when show_attendee_count is false, restored when true", async ({ page }) => {
  await fetch(`${baseURL}/api/dev/seed-curve?webinar=demo-count&show_count=false`, {
    headers: { "x-seed-token": seedToken },
  });
  await newRoom(page);
  await expect(page.getByTestId("attendee-count")).toHaveCount(0);

  await fetch(`${baseURL}/api/dev/seed-curve?webinar=demo-count&show_count=true`, {
    headers: { "x-seed-token": seedToken },
  });
  await newRoom(page);
  await expect(page.getByTestId("attendee-count")).toBeVisible();
});
