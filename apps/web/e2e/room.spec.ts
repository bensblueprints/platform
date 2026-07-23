import { test, expect } from "@playwright/test";

/**
 * Phase 1 acceptance (spec §15): join late -> video starts at the right
 * offset; refresh resumes; the offset tracks wall clock.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const seedToken = process.env.DEV_SEED_TOKEN!;

let token: string;
let startsAtMs: number;

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
  await page.getByRole("button", { name: "Join the session" }).click();

  await expect(page.getByTestId("offset-readout")).toBeVisible({ timeout: 30_000 });
  const currentTime = await page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime);
  const expected = (Date.now() - startsAtMs) / 1000;
  expect(currentTime).toBeGreaterThan(11);
  expect(Math.abs(currentTime - expected)).toBeLessThan(10);
});

test("refresh resumes at the correct point", async ({ page }) => {
  await page.goto(`/room/${token}`);
  await page.getByRole("button", { name: "Join the session" }).click();
  await expect(page.getByTestId("offset-readout")).toBeVisible({ timeout: 30_000 });

  await page.waitForTimeout(4_000);
  const before = await page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime);

  await page.reload();
  await page.getByRole("button", { name: "Join the session" }).click();
  await expect(page.getByTestId("offset-readout")).toBeVisible({ timeout: 30_000 });

  const after = await page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime);
  const expected = (Date.now() - startsAtMs) / 1000;
  expect(after).toBeGreaterThanOrEqual(before);
  expect(Math.abs(after - expected)).toBeLessThan(10);
});

test("offset readout tracks wall clock", async ({ page }) => {
  await page.goto(`/room/${token}`);
  await page.getByRole("button", { name: "Join the session" }).click();
  const readout = page.getByTestId("offset-readout");
  await expect(readout).toBeVisible({ timeout: 30_000 });

  const t1 = await readout.innerText();
  await page.waitForTimeout(5_000);
  const t2 = await readout.innerText();

  const toSec = (s: string) => {
    const [mm, ss] = s.split(" / ")[0].split(":").map(Number);
    return mm * 60 + ss;
  };
  const delta = toSec(t2) - toSec(t1);
  expect(delta).toBeGreaterThanOrEqual(4);
  expect(delta).toBeLessThanOrEqual(6);
});
