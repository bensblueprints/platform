import { test, expect } from "@playwright/test";

/**
 * Phase 3 acceptance (spec §15): two sessions show different names and
 * slightly different chat; the same session is identical across refreshes.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const seedToken = process.env.DEV_SEED_TOKEN!;

function csv(): string {
  const rows = ["Hour,Minute,Second,Name,Role,Message,Mode"];
  for (let i = 1; i <= 20; i++) {
    rows.push(`0,0,${String(i).padStart(2, "0")},Attendee ${i},Attendee,chat line ${i},chat`);
  }
  rows.push("0,0,25,{{name}},Attendee,token line one,question");
  rows.push("0,0,26,{{name}},Attendee,token line two,question");
  rows.push("0,0,27,{{name}},Attendee,token question,question");
  rows.push("0,0,28,Sarah (Support),Admin,admin answer,answer");
  return rows.join("\n");
}

async function newTokenPayload(): Promise<any> {
  const seed = await fetch(`${baseURL}/api/dev/seed?webinar=demo-var`, {
    headers: { "x-seed-token": seedToken },
  }).then((r) => r.json());
  return fetch(`${baseURL}/api/room/${seed.token}`, { cache: "no-store" }).then((r) => r.json());
}

test.beforeAll(async () => {
  await fetch(`${baseURL}/api/dev/seed?webinar=demo-var`, {
    headers: { "x-seed-token": seedToken },
  });
  const roster = await fetch(`${baseURL}/api/dev/seed-roster?webinar=demo-var&reset=1`, {
    headers: { "x-seed-token": seedToken },
  });
  expect(roster.status).toBe(200);
  const imp = await fetch(`${baseURL}/api/dev/import-chat?webinar=demo-var&reset=1`, {
    method: "POST",
    headers: { "x-seed-token": seedToken, "content-type": "text/plain" },
    body: csv(),
  });
  expect(imp.status).toBe(200);
});

test("same session is identical across refreshes", async () => {
  const seed = await fetch(`${baseURL}/api/dev/seed?webinar=demo-var`, {
    headers: { "x-seed-token": seedToken },
  }).then((r) => r.json());
  const p1 = await fetch(`${baseURL}/api/room/${seed.token}`, { cache: "no-store" }).then((r) => r.json());
  const p2 = await fetch(`${baseURL}/api/room/${seed.token}`, { cache: "no-store" }).then((r) => r.json());
  expect(p1.chat).toEqual(p2.chat);
});

test("two sessions differ in names and/or lines", async () => {
  const a = await newTokenPayload();
  const b = await newTokenPayload();
  expect(a.session.seed).not.toBe(b.session.seed);
  expect(a.chat).not.toEqual(b.chat);
});

test("admin and answer lines survive variance in every session", async () => {
  const a = await newTokenPayload();
  const b = await newTokenPayload();
  for (const p of [a, b]) {
    expect(p.chat.some((l: any) => l.role === "admin" && l.mode === "answer")).toBe(true);
    expect(p.chat.some((l: any) => l.mode === "question")).toBe(true);
  }
});

test("{{name}} tokens resolve to roster names and never render literally", async ({ page }) => {
  const seed = await fetch(`${baseURL}/api/dev/seed?webinar=demo-var`, {
    headers: { "x-seed-token": seedToken },
  }).then((r) => r.json());
  const payload = await fetch(`${baseURL}/api/room/${seed.token}`, { cache: "no-store" }).then((r) =>
    r.json(),
  );
  const tokenLines = payload.chat.filter((l: any) => l.message.startsWith("token"));
  expect(tokenLines.length).toBeGreaterThan(0);
  for (const l of tokenLines) {
    expect(l.displayName).not.toBe("{{name}}");
  }
  // same occurrence → same name within the session
  const one = tokenLines.find((l: any) => l.message === "token line one");
  const two = tokenLines.find((l: any) => l.message === "token line two");
  expect(one.displayName).not.toBe(two.displayName);

  await page.goto(`/room/${seed.token}`);
  await expect(page.locator("text={{name}}")).toHaveCount(0);
});
