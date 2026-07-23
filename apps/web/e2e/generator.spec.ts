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
 * Phase 9 (spec §15, mock inference): generate → validation gates → publish
 * → per-beat regen preserves hand edits → CSV round-trips through our own
 * parser. Real-API acceptance runs when INFERENCE keys arrive.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const seedToken = process.env.DEV_SEED_TOKEN!;
const adminKey = process.env.ADMIN_KEY!;
const headers = { "x-seed-token": seedToken };
const adminHeaders = { "x-admin-key": adminKey, "content-type": "application/json" };

let webinarId: string;
let draft: any[];
let beats: any[];

test.setTimeout(240_000);

test.beforeAll(async () => {
  const seed = await fetch(`${baseURL}/api/dev/seed?webinar=demo`, { headers });
  expect(seed.status).toBe(200);
  const list = await fetch(`${baseURL}/api/admin/webinars`, { headers: { "x-admin-key": adminKey } }).then((r) =>
    r.json(),
  );
  webinarId = list.webinars.find((w: any) => w.slug === "demo").id;

  // reset generator state so the daily cap (§7.8) and drafts are deterministic
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!);
  await sql`delete from generation_jobs where webinar_id = ${webinarId}`;
  await sql`delete from chat_scripts where webinar_id = ${webinarId} and status = 'draft'`;
  await sql.end();
});

test("generation job completes and lands a validated draft", async () => {
  const enq = await fetch(`${baseURL}/api/admin/generate`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ webinarId }),
  });
  expect(enq.status).toBe(200);
  const { jobId } = await enq.json();

  let job: any = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    job = await fetch(`${baseURL}/api/admin/generate/${jobId}`, {
      headers: { "x-admin-key": adminKey },
    }).then((r) => r.json());
    if (job.status === "done" || job.status === "failed") break;
  }
  expect(job.status, JSON.stringify(job.error)).toBe("done");

  const data = await fetch(`${baseURL}/api/admin/scripts/${webinarId}`, {
    headers: { "x-admin-key": adminKey },
  }).then((r) => r.json());
  draft = data.draft;
  beats = data.lastJob?.usage?.beats ?? [];
  expect(draft.length).toBeGreaterThanOrEqual(8);
  expect(data.roster.length).toBeGreaterThanOrEqual(20);
  expect(beats.length).toBeGreaterThan(0);
});

test("draft passes the §7.5 gates", async () => {
  // every question answered within 90s
  for (const q of draft.filter((l) => l.mode === "question" && l.role === "attendee")) {
    const answered = draft.some(
      (l) =>
        l.role === "admin" &&
        l.mode === "answer" &&
        l.offset_seconds > q.offset_seconds &&
        l.offset_seconds <= q.offset_seconds + 90,
    );
    expect(answered, `question at ${q.offset_seconds}s`).toBe(true);
  }

  // no persona over 8%
  const counts = new Map<string, number>();
  for (const l of draft) counts.set(l.display_name, (counts.get(l.display_name) ?? 0) + 1);
  for (const [name, c] of counts) {
    expect(c / draft.length, `${name} ${c}/${draft.length}`).toBeLessThanOrEqual(0.08);
  }

  // zero attendee earnings/results claims (FTC §12)
  const claims = /\$\s?\d|\b\d+(\.\d+)?\s?%|\b(i|i've|my)\b.{0,50}\b(made|earned|doubled|tripled|income|profit)\b/i;
  for (const l of draft) {
    if (l.role === "attendee") expect(claims.test(l.message), l.message).toBe(false);
  }

  // at least three lines reference mock-transcript content
  const terms = /(diagnose|deploy|framework|sarah|one time suite|worksheet|65 percent|replay)/i;
  const referencing = draft.filter((l) => terms.test(l.message));
  expect(referencing.length).toBeGreaterThanOrEqual(3);
});

test("publish swaps the draft live; room payload carries it", async () => {
  const pub = await fetch(`${baseURL}/api/admin/scripts/${webinarId}/publish`, {
    method: "POST",
    headers: adminHeaders,
  });
  expect(pub.status).toBe(200);

  const seed = await fetch(`${baseURL}/api/dev/seed?webinar=demo`, { headers }).then((r) => r.json());
  const payload = await fetch(`${baseURL}/api/room/${seed.token}`, { cache: "no-store" }).then((r) =>
    r.json(),
  );
  expect(payload.chat.length).toBeGreaterThan(5);
});

test("hand edit in one beat survives regeneration of another beat", async () => {
  const data = await fetch(`${baseURL}/api/admin/scripts/${webinarId}`, {
    headers: { "x-admin-key": adminKey },
  }).then((r) => r.json());
  const lines = data.draft;
  const beatsNow = data.lastJob?.usage?.beats ?? beats;
  expect(beatsNow.length).toBeGreaterThan(1);

  // hand-edit a line in the FIRST beat; regenerate the LAST beat
  const firstBeat = beatsNow[0];
  const lastBeat = beatsNow[beatsNow.length - 1];
  const editTarget = lines.find(
    (l: any) => l.offset_seconds >= firstBeat.start && l.offset_seconds <= firstBeat.end,
  );
  const handText = `hand-edited line ${Date.now()}`;
  const patch = await fetch(`${baseURL}/api/admin/scripts/${webinarId}/line`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ id: editTarget.id, message: handText }),
  });
  expect(patch.status).toBe(200);

  const enq = await fetch(`${baseURL}/api/admin/generate`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ webinarId, mode: "regen-beat", beatType: lastBeat.type }),
  });
  const { jobId } = await enq.json();
  let job: any = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    job = await fetch(`${baseURL}/api/admin/generate/${jobId}`, {
      headers: { "x-admin-key": adminKey },
    }).then((r) => r.json());
    if (job.status === "done" || job.status === "failed") break;
  }
  expect(job.status).toBe("done");

  const after = await fetch(`${baseURL}/api/admin/scripts/${webinarId}`, {
    headers: { "x-admin-key": adminKey },
  }).then((r) => r.json());
  const edited = after.draft.find((l: any) => l.id === editTarget.id);
  expect(edited?.message).toBe(handText);
});

test("CSV download round-trips through the EverWebinar parser", async () => {
  const res = await fetch(`${baseURL}/api/admin/scripts/${webinarId}/csv?key=${adminKey}`);
  expect(res.status).toBe(200);
  const text = await res.text();
  expect(text).toContain("Hour,Minute,Second,Name,Role,Message,Mode");
  const dataLines = text.trim().split("\n").slice(1);
  expect(dataLines.length).toBeGreaterThan(10);
  for (const line of dataLines.slice(0, 25)) {
    expect(line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).length).toBe(7);
  }
});
