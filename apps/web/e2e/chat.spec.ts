import { test, expect } from "@playwright/test";

/**
 * Phase 2 acceptance (spec §15): EverWebinar-format CSV imports unedited;
 * joining late shows the full backlog in order with the next line arriving
 * on time; a malformed row returns its row number and reason.
 *
 * The script uses a unique marker per run so repeated runs stay
 * deterministic even though imports append by default.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const seedToken = process.env.DEV_SEED_TOKEN!;
const marker = `e2e-${Date.now()}`;

let token: string;
let startsAtMs: number;

function csv(): string {
  // offsets: 5s, 10s backlog when joining at ~12s; 17s, 23s forward.
  // Phase 3 note: all lines use non-droppable modes (question/answer/
  // highlighted) so this Phase 2 spec stays deterministic under variance.
  return [
    "Hour,Minute,Second,Name,Role,Message,Mode",
    `0,0,05,Marcus T.,Attendee,backlog one ${marker},question`,
    `0,0,10,Casey L.,Attendee,backlog two ${marker},question`,
    `0,0,17,Sarah (Support),Admin,forward answer ${marker},answer`,
    `0,0,23,Sarah (Support),Admin,forward pinned ${marker},highlighted`,
  ].join("\n");
}

test.beforeAll(async () => {
  // Create the webinar before importing (import/roster 404 on unknown slugs).
  await fetch(`${baseURL}/api/dev/seed?webinar=demo-chat`, {
    headers: { "x-seed-token": seedToken },
  });
  const imp = await fetch(`${baseURL}/api/dev/import-chat?webinar=demo-chat&reset=1`, {
    method: "POST",
    headers: { "x-seed-token": seedToken, "content-type": "text/plain" },
    body: csv(),
  });
  expect(imp.status).toBe(200);

  const seed = await fetch(`${baseURL}/api/dev/seed?webinar=demo-chat`, {
    headers: { "x-seed-token": seedToken },
  }).then((r) => r.json());
  token = seed.token;

  const payload = await fetch(`${baseURL}/api/room/${token}`, { cache: "no-store" }).then((r) =>
    r.json(),
  );
  startsAtMs = payload.session.startsAtMs;
  expect(payload.chat.length).toBe(4);
});

test("malformed CSV returns row number and EverWebinar reason", async () => {
  const res = await fetch(`${baseURL}/api/dev/import-chat?webinar=demo`, {
    method: "POST",
    headers: { "x-seed-token": seedToken, "content-type": "text/plain" },
    body: "0,0,05,Ben,Attendee,hi,chat\n9,0,06,Ben,Attendee,bad,chat",
  });
  expect(res.status).toBe(422);
  const body = await res.json();
  expect(body.errors).toEqual([{ row: 2, reason: "Hour is invalid" }]);
});

test("late join shows backlog in order; forward lines arrive on time", async ({ page }) => {
  const waitMs = 12_000 - (Date.now() - startsAtMs);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

  await page.goto(`/room/${token}`);

  // Backlog: both lines present immediately, in offset order.
  const one = page.getByText(`backlog one ${marker}`);
  const two = page.getByText(`backlog two ${marker}`);
  await expect(one).toBeVisible();
  await expect(two).toBeVisible();
  const order = await page
    .locator("[data-role]")
    .evaluateAll((els) => els.map((e) => e.textContent ?? ""));
  expect(order.findIndex((t) => t.includes("backlog one"))).toBeLessThan(
    order.findIndex((t) => t.includes("backlog two")),
  );

  // Forward answer at 17s arrives on time (±3s tolerance).
  const three = page.getByText(`forward answer ${marker}`);
  await expect(three).toBeVisible({ timeout: 12_000 });
  const arrivalOffset = (Date.now() - startsAtMs) / 1000;
  expect(arrivalOffset).toBeGreaterThanOrEqual(16);
  expect(arrivalOffset).toBeLessThan(23);

  // Pinned admin line at 23s renders with the highlighted treatment.
  const four = page.getByText(`forward pinned ${marker}`);
  await expect(four).toBeVisible({ timeout: 12_000 });
  const adminRows = page.locator('[data-role="admin"][data-mode="highlighted"]');
  await expect(adminRows).toHaveCount(1);
});

test("line treatments are visually distinct (Q badge, admin, highlighted)", async ({ page }) => {
  // Independent session; wait for the full script to arrive so the
  // assertion is free of jitter/navigation timing races.
  const seed = await fetch(`${baseURL}/api/dev/seed?webinar=demo-chat`, {
    headers: { "x-seed-token": seedToken },
  }).then((r) => r.json());
  await page.goto(`/room/${seed.token}`); // materializes the on-demand session

  // Latest line is the highlighted admin at ~23s (±3s jitter).
  await expect(page.locator('[data-role="admin"][data-mode="highlighted"]')).toHaveCount(1, {
    timeout: 35_000,
  });
  await expect(page.locator('[data-role="attendee"][data-mode="question"]')).toHaveCount(2);
  await expect(page.locator('[data-role="admin"][data-mode="answer"]')).toHaveCount(1);
  // highlighted treatment carries the amber accent border
  await expect(
    page.locator('[data-role="admin"][data-mode="highlighted"].border-amber-400'),
  ).toHaveCount(1);
});
