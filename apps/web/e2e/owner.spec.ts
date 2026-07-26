import { test, expect } from "@playwright/test";

/**
 * End-to-end owner journey: signup → login → create webinar → upload video
 * (with HTTP 206 range serving) → viewer registers → room plays the upload
 * → offer button_url drives an external checkout.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const OWNER = { email: "owner@advancedmarketing.co", password: "platform-owner-2026!" };
const SAMPLE_VIDEO = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

let webinarId: string;

test("owner signs up (bootstrap) or logs in", async ({ page }) => {
  await page.goto("/signup");
  await page.getByPlaceholder("Email").fill(OWNER.email);
  await page.getByPlaceholder(/Password/).fill(OWNER.password);
  await page.getByRole("button", { name: /Create the owner account|Sign in/ }).click();

  // signup may already be closed (re-runs) — log in instead
  await page.waitForTimeout(1500);
  if (!page.url().includes("/admin")) {
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(OWNER.email);
    await page.getByPlaceholder("Password").fill(OWNER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await page.waitForURL(/\/admin/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Webinars" })).toBeVisible();
});

test("create webinar, upload video, range serving works", async ({ page }) => {
  await page.goto("/admin/webinars/new");
  await page.getByLabel("Title").fill(`Owner E2E ${Date.now() % 100000}`);
  await page.getByLabel("Schedule").selectOption("ondemand");
  await page.getByRole("button", { name: "Create webinar" }).click();
  await page.waitForURL(/\/admin\/webinars\//);
  webinarId = page.url().split("/").pop()!;
  expect(webinarId).toMatch(/^[0-9a-f-]{36}$/);

  // download a small sample mp4, upload it through the browser's authed context
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

  // full GET → 200; range → 206 (spec: range requests are load-bearing)
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
  expect(create.ok()).toBe(true);

  // register a viewer
  const list = await page.request.get("/api/admin/webinars");
  const w = (await list.json()).webinars.find((x: any) => x.id === webinarId);
  await page.goto(`/w/${w.slug}`);
  await page.getByPlaceholder("Email address").fill("viewer-e2e@example.com");
  await page.getByRole("button", { name: "Register for the session" }).click();
  await page.waitForURL(/confirmed\?token=/);

  await page.getByRole("link", { name: /Go to the room|Join the session now/ }).click();
  await page.waitForURL(/\/room\//);

  // the room plays the uploaded file, and the offer CTA goes to the external checkout
  const src = await page.locator("video").getAttribute("src");
  expect(src).toContain(`/api/media/${webinarId}`);

  await expect(page.getByTestId("offer-cta")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("offer-cta").click();
  await page.waitForURL(/example\.com\/checkout/, { timeout: 15_000 });
});
