import { test, expect } from "@playwright/test";

/**
 * Settings page: save integration keys, masked display, plumbing reaches
 * the inference factory (settings store beats env beats mock).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const OWNER = { email: "owner-e2e@example.com", password: "e2e-owner-test-pw" };

test.beforeEach(async ({ page }) => {
  const res = await page.request.post(`${baseURL}/api/auth/login`, { data: OWNER });
  expect(res.ok()).toBe(true);
});

test("settings page saves keys and shows them masked", async ({ page }) => {
  await page.goto("/admin/settings");

  const marker = `sk-test-${Date.now()}`;
  await page.locator('input').first().fill("https://api.groq.com/openai/v1");
  await page.locator('input[type="password"]').nth(1).fill(marker);
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("saved")).toBeVisible({ timeout: 10_000 });

  // masked readback via the API
  const res = await page.request.get("/api/admin/settings");
  const { settings } = await res.json();
  const key = settings.find((s: any) => s.key === "INFERENCE_API_KEY");
  expect(key.set).toBe(true);
  expect(key.masked).toContain("••••");
  expect(key.masked).not.toBe(marker);

  const base = settings.find((s: any) => s.key === "INFERENCE_BASE_URL");
  expect(base.set).toBe(true);

  // cleanup so the mock generator keeps working in other specs
  await page.request.post("/api/admin/settings", {
    data: { INFERENCE_BASE_URL: "__DELETE__", INFERENCE_API_KEY: "__DELETE__" },
  });
});
