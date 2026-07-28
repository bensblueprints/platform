import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 1 acceptance (spec §15): join late -> video starts at the right
 * offset; refresh resumes; playback tracks wall clock. The room shows no
 * duration timer (a live event has no known end), so assertions read the
 * video element directly.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const seedToken = process.env.DEV_SEED_TOKEN!;

let token: string;
let startsAtMs: number;

async function waitPlaying(page: Page, minSeconds = 0.5) {
  await page.waitForFunction(
    (min) => {
      const v = document.querySelector("video");
      return v && !v.paused && v.currentTime >= min;
    },
    minSeconds,
    { timeout: 30_000 },
  );
}

test.beforeAll(async () => {
  const seed = await fetch(`${baseURL}/api/dev/seed`, {
    headers: { "x-seed-token": seedToken },
  }).then((r) => r.json());
  token = seed.token;
  // Materialize the on-demand session and learn when it starts.
  const payload = await fetch(`${baseURL}/api/room/${token}`, { cache: "no-store" }).then((r) =>
    r.json(),
  );
  startsAtMs = payload.session.startsAtMs;
});

test("late join seeks to the wall-clock offset", async ({ page }) => {
  const waitMs = 12_000 - (Date.now() - startsAtMs);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

  await page.goto(`/room/${token}`);
  await waitPlaying(page, 10);

  const currentTime = await page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime);
  const expected = (Date.now() - startsAtMs) / 1000;
  expect(currentTime).toBeGreaterThan(11);
  expect(Math.abs(currentTime - expected)).toBeLessThan(10);
});

test("refresh resumes at the correct point", async ({ page }) => {
  await page.goto(`/room/${token}`);
  await waitPlaying(page);

  await page.waitForTimeout(4_000);
  const before = await page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime);

  await page.reload();
  await waitPlaying(page);

  const after = await page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime);
  const expected = (Date.now() - startsAtMs) / 1000;
  expect(after).toBeGreaterThanOrEqual(before);
  expect(Math.abs(after - expected)).toBeLessThan(10);
});

test("playback tracks wall clock", async ({ page }) => {
  await page.goto(`/room/${token}`);
  await waitPlaying(page);

  const t1 = await page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.waitForTimeout(5_000);
  const t2 = await page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime);

  const delta = t2 - t1;
  expect(delta).toBeGreaterThanOrEqual(4);
  expect(delta).toBeLessThanOrEqual(6);
});
