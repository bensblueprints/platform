import { test, expect } from "@playwright/test";

/**
 * End-to-end owner journey: bootstrap/login → create webinar → upload video
 * (with HTTP 206 range serving) → viewer registers → room plays the upload
 * → offer button_url drives an external checkout.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const OWNER = { email: "owner@advancedmarketing.co", password: "platform-owner-2026!" };
const SAMPLE_VIDEO = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";

let webinarId: string;

// Playwright gives each test a fresh browser context, so authenticate via
// the API — the context's cookie jar picks up the session cookie.
test.beforeEach(async ({ page }) => {
  let res = await page.request.post(`${baseURL}/api/auth/login`, { data: OWNER });
  if (!res.ok()) {
    res = await page.request.post(`${baseURL}/api/auth/signup`, { data: OWNER });
    if (!res.ok()) {
      // signup closed already — login must work then
      res = await page.request.post(`${baseURL}/api/auth/login`, { data: OWNER });
    }
  }
  expect(res.ok(), `auth failed: ${res.status()}`).toBe(true);
});

test("dashboard renders the webinar list", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Webinars" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New webinar" })).toBeVisible();
});

test("create webinar, upload video, range serving works", async ({ page }) => {
  await page.goto("/admin/webinars/new");
  await page.getByLabel("Title", { exact: true }).fill(`Owner E2E ${Date.now() % 100000}`);
  await page.getByLabel("Schedule").selectOption("ondemand");
  await page.getByRole("button", { name: "Create webinar" }).click();
  await page.waitForURL(/\/admin\/webinars\/[0-9a-f-]{36}/);
  webinarId = page.url().split("/").pop()!;
  expect(webinarId).toMatch(/^[0-9a-f-]{36}$/);

  const video = await page.request.get(SAMPLE_VIDEO);
  expect(video.ok()).toBe(true);
  const buf = await video.body();

  const upload = await page.request.put(`${baseURL}/api/admin/webinars/${webinarId}/video`, {
    data: buf,
    headers: { "content-type": "video/mp4" },
  });
  expect(upload.ok()).toBe(true);
  const up = await upload.json();
  expect(up.durationSeconds).toBeGreaterThan(5);

  const full = await page.request.get(`${baseURL}/api/media/${webinarId}`);
  expect(full.status()).toBe(200);
  const ranged = await page.request.get(`${baseURL}/api/media/${webinarId}`, {
    headers: { range: "bytes=100000-199999" },
  });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-range"]).toContain("bytes 100000-");
});

test("offer with button_url drives the external checkout", async ({ page }) => {
  const create = await page.request.post(`${baseURL}/api/admin/webinars/${webinarId}/offers`, {
    data: {
      name: "E2E Offer",
      headline: "The External Checkout",
      buttonText: "Buy via external link",
      buttonUrl: "https://example.com/checkout",
      startOffsetSeconds: 5,
      urgencyEnabled: false,
      scarcityEnabled: false,
    },
  });
  expect(create.ok(), `offer create: ${create.status()}`).toBe(true);

  const list = await page.request.get("/api/admin/webinars");
  const w = (await list.json()).webinars.find((x: any) => x.id === webinarId);
  expect(w).toBeTruthy();

  await page.goto(`/w/${w.slug}`);
  await page.getByPlaceholder("Email address").fill("viewer-e2e@example.com");
  await page.getByRole("button", { name: "Register for the session" }).click();
  await page.waitForURL(/confirmed\?token=/);

  await page.getByRole("link", { name: /Go to the room|Join the session now/ }).click();
  await page.waitForURL(/\/room\//);

  const src = await page.locator("video").getAttribute("src");
  expect(src).toContain(`/api/media/${webinarId}`);

  await expect(page.getByTestId("offer-cta")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("offer-cta").click();
  await page.waitForURL(/example\.com\/checkout/, { timeout: 15_000 });
});
