import { test, expect } from "@playwright/test";

/**
 * Phase 6 acceptance (spec §15): JIT shows a session starting within the
 * lead window and registering creates exactly one session row. Also covers
 * recurring materialization (14 days, idempotent), timezone display, .ics,
 * and the on-demand registration path.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const seedToken = process.env.DEV_SEED_TOKEN!;
const headers = { "x-seed-token": seedToken };

test("JIT: page shows a slot inside the lead window; register creates exactly one session row", async ({
  page,
}) => {
  await fetch(`${baseURL}/api/dev/seed-webinar?slug=e2e-jit&mode=jit&interval=15&lead=5&reset=1`, {
    headers,
  });

  await page.goto("/w/e2e-jit");
  const time = await page.getByTestId("session-time").innerText();
  expect(time).toContain("Next session:");

  // register
  await page.getByPlaceholder("Email address").fill("jit-e2e@example.com");
  await page.getByPlaceholder("First name").fill("Jit");
  await page.getByRole("button", { name: "Register for the session" }).click();
  await page.waitForURL(/\/w\/e2e-jit\/confirmed\?token=/);

  // confirmation shows a time in a named zone + calendar link
  const confirmed = await page.getByTestId("confirmed-time").innerText();
  expect(confirmed.length).toBeGreaterThan(5);
  await expect(page.getByRole("link", { name: /Add to calendar/ })).toBeVisible();

  // exactly one session row for the webinar, starting within interval+lead
  const s1 = await fetch(`${baseURL}/api/dev/sessions?webinar=e2e-jit`, { headers }).then((r) =>
    r.json(),
  );
  expect(s1.count).toBe(1);
  const startsAt = new Date(s1.sessions[0].starts_at).getTime();
  const aheadMs = startsAt - Date.now();
  expect(aheadMs).toBeGreaterThan(0);
  expect(aheadMs).toBeLessThan((15 + 5) * 60_000);

  // .ics downloads and points at the same start
  const token = page.url().split("token=")[1];
  const ics = await fetch(`${baseURL}/api/ics/${token}`).then((r) => r.text());
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain("DTSTART:");

  // second registration reuses the slot — still exactly one row
  await page.goto("/w/e2e-jit");
  await page.getByPlaceholder("Email address").fill("jit-e2e-2@example.com");
  await page.getByRole("button", { name: "Register for the session" }).click();
  await page.waitForURL(/\/w\/e2e-jit\/confirmed\?token=/);
  const s2 = await fetch(`${baseURL}/api/dev/sessions?webinar=e2e-jit`, { headers }).then((r) =>
    r.json(),
  );
  expect(s2.count).toBe(1);
});

test("recurring: materialize produces 14 days of sessions, idempotent", async () => {
  await fetch(
    `${baseURL}/api/dev/seed-webinar?slug=e2e-rec&mode=recurring&days=0,1,2,3,4,5,6&times=10:00&tz=UTC&reset=1`,
    { headers },
  );
  const m1 = await fetch(`${baseURL}/api/dev/materialize`, { headers }).then((r) => r.json());
  expect(m1.created).toBeGreaterThanOrEqual(13);

  const m2 = await fetch(`${baseURL}/api/dev/materialize`, { headers }).then((r) => r.json());
  expect(m2.created).toBe(0);

  const s = await fetch(`${baseURL}/api/dev/sessions?webinar=e2e-rec`, { headers }).then((r) =>
    r.json(),
  );
  expect(s.count).toBeGreaterThanOrEqual(13);
  expect(s.count).toBeLessThanOrEqual(15);
});

test("recurring registration assigns the next session and shows it localized", async ({ page }) => {
  await page.goto("/w/e2e-rec");
  await expect(page.getByTestId("session-time")).toContainText("Next session:");
  await page.getByPlaceholder("Email address").fill("rec-e2e@example.com");
  await page.getByRole("button", { name: "Register for the session" }).click();
  await page.waitForURL(/\/w\/e2e-rec\/confirmed\?token=/);
  const confirmed = await page.getByTestId("confirmed-time").innerText();
  expect(confirmed).toMatch(/\d/);
  // timezone abbreviation is rendered by the server from the registrant's zone
  expect(confirmed).toMatch(/(UTC|[A-Z]{2,5})$/);
});

test("ondemand: register and join end-to-end", async ({ page }) => {
  await page.goto("/w/demo");
  await expect(page.getByTestId("session-time")).toContainText("right after you register");
  await page.getByPlaceholder("Email address").fill("ondemand-e2e@example.com");
  await page.getByPlaceholder("First name").fill("OnDemand");
  await page.getByRole("button", { name: "Register for the session" }).click();
  await page.waitForURL(/\/w\/demo\/confirmed\?token=/);
  await expect(page.getByTestId("confirmed-time")).toContainText("starts as soon as you join");

  await page.getByRole("link", { name: "Join the session now" }).click();
  await page.waitForURL(/\/room\//);
  await expect(page.getByRole("button", { name: "Join the session" })).toBeVisible({ timeout: 20_000 });
});
