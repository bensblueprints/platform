# Slice 1 Implementation Plan — Infrastructure + Phase 1 Timeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed Next.js app on Coolify that plays a pre-recorded video on a server-authoritative timeline (spec section 4), with late-join seek, refresh resume, and drift correction — plus the monorepo and Supabase infrastructure every later phase builds on.

**Architecture:** npm-workspaces monorepo in `github.com/bensblueprints/platform` (public). Supabase one-click service on Coolify provides Postgres (app uses direct connection string, service-role pattern; RLS enabled, no public policies). App deploys via Dockerfile from the repo behind existing Traefik TLS. Pure timeline logic lives in a framework-free package with vitest.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, postgres.js, vitest, Playwright (acceptance only), Docker multi-stage on Coolify 4.1.2.

## Global Constraints

- `offsetSeconds = Math.floor((serverNowMs - startsAtMs) / 1000)` — never from `<video>.currentTime` (spec §4).
- Player: no `controls` attribute, `pointer-events: none` on `<video>`, keyboard seeks swallowed, volume + fullscreen only, explicit click-gate before playback (spec §14, §16.3).
- No secrets in the repo (it is public). Secrets live in Coolify env vars and local `.env.local` (gitignored).
- Room reads authorize via `registrants.access_token` in application code, not Supabase auth (spec §5). Unknown token → 404 with zero detail.
- `/api/time` drift re-sync every 60s with backoff; timers never trusted after backgrounding (spec §16.2, §16.6).
- Commits: small, conventional (`feat:`, `chore:`, `test:`), at every task end.
- Working dir: `C:/Users/HP/platform`. Git remote `origin` already carries credentials.
- Coolify: base `https://server.advancedmarketing.co/api/v1`, server uuid `lcu0gium6zc89ljq96woj37n`, token supplied via `COOLIFY_TOKEN` shell var only (never committed).
- Demo video (verified 2026-07-23, HTTP 206 on range probe): `https://archive.org/download/1968-night-of-the-living-dead/Night%20of%20the%20Living%20Dead%20(1968)%20English.mp4`, duration 5752 s, public domain.

---

## Task 1: Monorepo scaffold + Next.js app shell

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.env.example`; append to `.gitignore`
- Create: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/postcss.config.mjs`, `apps/web/next-env.d.ts`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/globals.css`, `apps/web/public/.gitkeep`
- Create: `packages/{core,room-ui,timeline,chat,offers,media,analytics,notifications}/package.json` + `src/index.ts`
- Create: `apps/workers/package.json`

**Interfaces:**
- Produces: workspace names `@platform/web`, `@platform/core`, `@platform/timeline`, `@platform/room-ui`, `@platform/chat`, `@platform/offers`, `@platform/media`, `@platform/analytics`, `@platform/notifications`, `@platform/workers`. Root scripts: `npm run dev`, `npm run build`, `npm test`.

- [ ] **Step 1: Root files.** Root `package.json`:

```json
{
  "name": "platform",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "npm run dev -w @platform/web",
    "build": "npm run build -w @platform/web",
    "test": "npm test --workspaces --if-present"
  },
  "engines": { "node": ">=20" }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

Append to `.gitignore`: `.env.local`, `.env`, `*.tsbuildinfo`, `.next/`, `dist/`, `playwright-report/`, `test-results/`.

`.env.example`:

```
DATABASE_URL=postgres://postgres:CHANGE_ME@212.28.184.24:5432/postgres
DEV_SEED_TOKEN=change-me
```

- [ ] **Step 2: Placeholder packages.** Each of `packages/{core,room-ui,timeline,chat,offers,media,analytics,notifications}` gets:

```json
{ "name": "@platform/<name>", "version": "0.0.0", "private": true, "type": "module",
  "main": "src/index.ts", "types": "src/index.ts",
  "scripts": { "test": "vitest run" } }
```

(`main` points at TS source — consumed only by the Next app and vitest, both of which transpile TS workspaces.) `src/index.ts`: `export {};`. `apps/workers/package.json` is the same shape with name `@platform/workers`.

- [ ] **Step 3: `apps/web` hand-written Next 15 shell.** `apps/web/package.json`:

```json
{
  "name": "@platform/web",
  "version": "0.0.0",
  "private": true,
  "scripts": { "dev": "next dev", "build": "next build", "start": "next start" },
  "dependencies": {
    "next": "^15.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@platform/core": "*",
    "@platform/timeline": "*",
    "@platform/media": "*"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4"
  }
}
```

`next.config.ts`:

```ts
import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@platform/core", "@platform/timeline", "@platform/media"],
};

export default config;
```

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["dom", "dom.iterable", "esnext"],
    "noEmit": true,
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next-env.d.ts`: `/// <reference types="next" />` + `/// <reference types="next/image-types/global" />` (two lines).

`postcss.config.mjs`: `export default { plugins: { "@tailwindcss/postcss": {} } };`

`app/globals.css`: `@import "tailwindcss";`

`app/layout.tsx`:

```tsx
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Webinar Platform" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
```

`app/page.tsx`: renders `<main className="p-8">Platform — Slice 1 up</main>`.

- [ ] **Step 4: Install and boot.**

Run: `cd /c/Users/HP/platform && npm install`
Expected: installs cleanly, workspaces linked.
Run: `npm run dev` in background; `curl -s http://localhost:3000 | grep -q "Slice 1 up" && echo OK`
Expected: `OK`. Stop dev server.

- [ ] **Step 5: Commit.**

```bash
git add -A && git commit -m "chore: monorepo scaffold with Next.js 15 app shell"
```

---

## Task 2: `packages/timeline` — offset math, server clock, PRNG (TDD)

**Files:**
- Create: `packages/timeline/src/offset.ts`, `packages/timeline/src/prng.ts`, `packages/timeline/src/server-clock.ts`, `packages/timeline/src/index.ts`, `packages/timeline/vitest.config.ts`
- Test: `packages/timeline/src/offset.test.ts`, `packages/timeline/src/prng.test.ts`, `packages/timeline/src/server-clock.test.ts`
- Modify: `packages/timeline/package.json` (devDep `vitest`)

**Interfaces:**
- Produces (later tasks rely on these exactly):
  - `offsetSeconds(startsAtMs: number, nowMs: number): number`
  - `type SessionState = "pre" | "live" | "over"`; `resolveSessionState(offsetSec: number, durationSec: number): SessionState`
  - `mulberry32(seed: number): () => number`
  - `interface ServerClock { nowMs(): number; consecutiveFailures(): number; start(): void; stop(): void; resyncNow(): Promise<void> }`
  - `createServerClock(opts: { ping: () => Promise<number>; resyncIntervalMs?: number }): ServerClock`

- [ ] **Step 1: Failing tests — `src/offset.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { offsetSeconds, resolveSessionState } from "./offset";

describe("offsetSeconds", () => {
  it("is 0 exactly at start", () => expect(offsetSeconds(1000, 1000)).toBe(0));
  it("floors sub-second", () => expect(offsetSeconds(1000, 1999)).toBe(0));
  it("is negative before start", () => expect(offsetSeconds(10_000, 4_000)).toBe(-6));
  it("computes late join", () => expect(offsetSeconds(0, 600_000)).toBe(600));
});

describe("resolveSessionState", () => {
  it("pre when negative", () => expect(resolveSessionState(-1, 100)).toBe("pre"));
  it("live at 0", () => expect(resolveSessionState(0, 100)).toBe("live"));
  it("live at duration-1", () => expect(resolveSessionState(99, 100)).toBe("live"));
  it("over at duration", () => expect(resolveSessionState(100, 100)).toBe("over"));
  it("over past duration", () => expect(resolveSessionState(5753, 5752)).toBe("over"));
});
```

- [ ] **Step 2: Run** `npm test -w @platform/timeline` → FAIL (module not found).

- [ ] **Step 3: Implement `src/offset.ts`:**

```ts
export function offsetSeconds(startsAtMs: number, nowMs: number): number {
  return Math.floor((nowMs - startsAtMs) / 1000);
}

export type SessionState = "pre" | "live" | "over";

export function resolveSessionState(offsetSec: number, durationSec: number): SessionState {
  if (offsetSec < 0) return "pre";
  if (offsetSec >= durationSec) return "over";
  return "live";
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Failing tests — `src/prng.test.ts`:** same seed → identical first 10 outputs; different seeds → differing sequences; every output in `[0, 1)`.

- [ ] **Step 6: Implement `src/prng.ts`:**

```ts
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 7: Run → PASS.**

- [ ] **Step 8: Failing tests — `src/server-clock.test.ts`** with `vi.useFakeTimers()`:
  - before first ping, `nowMs()` ≈ `Date.now()` (delta 0)
  - after `resyncNow()` with ping resolving `Date.now() + 5000`, `nowMs()` ≈ `Date.now() + 5000`
  - `start()` re-pings every `resyncIntervalMs` (advance timers, assert ping call count grows)
  - on ping rejection, `consecutiveFailures()` increments, a retry is scheduled (backoff ≤ 30s cap), and a later success resets failures to 0

- [ ] **Step 9: Implement `src/server-clock.ts`:**

```ts
export interface ServerClock {
  nowMs(): number;
  consecutiveFailures(): number;
  start(): void;
  stop(): void;
  resyncNow(): Promise<void>;
}

export function createServerClock(opts: {
  ping: () => Promise<number>;
  resyncIntervalMs?: number;
}): ServerClock {
  const resyncIntervalMs = opts.resyncIntervalMs ?? 60_000;
  let deltaMs = 0;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;

  async function resyncNow(): Promise<void> {
    try {
      const serverMs = await opts.ping();
      deltaMs = serverMs - Date.now();
      failures = 0;
    } catch {
      failures += 1;
      throw new Error("time sync failed");
    }
  }

  function scheduleNext(ms: number) {
    if (stopped) return;
    timer = setTimeout(tick, ms);
  }

  async function tick() {
    try {
      await resyncNow();
      scheduleNext(resyncIntervalMs);
    } catch {
      scheduleNext(Math.min(1000 * 2 ** failures, 30_000));
    }
  }

  return {
    nowMs: () => Date.now() + deltaMs,
    consecutiveFailures: () => failures,
    start() {
      if (!stopped) return;
      stopped = false;
      void tick();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    resyncNow,
  };
}
```

- [ ] **Step 10: `src/index.ts`:** `export * from "./offset"; export * from "./prng"; export * from "./server-clock";` (three lines). `vitest.config.ts` (root of package): `import { defineConfig } from "vitest/config"; export default defineConfig({ test: { environment: "node" } });`

- [ ] **Step 11: Full suite → PASS. Commit** `feat(timeline): offset math, drift-corrected server clock, seeded PRNG`.

---

## Task 3: Coolify project + Supabase service (infra via API)

**Files:** none (infra). Credentials go to local `.env.local` (gitignored) and Coolify app env (Task 7).

**Interfaces:**
- Produces: `PROJECT_UUID`, `SVC_UUID` (recorded in `.env.local` as comments), `DATABASE_URL` reachable from the dev machine, supabase-db internal container name, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`.

- [ ] **Step 1: Create project.**

```bash
export COOLIFY_TOKEN='<token>'; B="https://server.advancedmarketing.co/api/v1"
curl -s -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Webinar Platform","description":"Evergreen + live webinar platform"}' "$B/projects"
```
Expected: JSON with `uuid` → save as `PROJECT_UUID`.

- [ ] **Step 2: Create Supabase one-click service.**

```bash
curl -s -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" -H "Content-Type: application/json" -d '{
  "type": "supabase", "name": "webinar-supabase",
  "project_uuid": "'"$PROJECT_UUID"'", "environment_name": "production",
  "server_uuid": "lcu0gium6zc89ljq96woj37n", "instant_deploy": true
}' "$B/services"
```
Expected: JSON with `uuid` → `SVC_UUID`. If the shape is rejected, inspect an existing one-click service with `GET "$B/services"` and mirror its fields.

- [ ] **Step 3: Poll** `GET "$B/services/$SVC_UUID"` until `.status` contains `running` (up to 10 min). Then `GET "$B/services/$SVC_UUID/envs"`; record Postgres password (`SERVICE_PASSWORD_POSTGRES` or `POSTGRES_PASSWORD`), `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`. Get the db container name from the service detail's `docker_compose_raw`.

- [ ] **Step 4: Expose Postgres for migrations.** Edit `docker_compose_raw` to add `ports: ["5432:5432"]` to the db service, then:

```bash
curl -s -X PATCH -H "Authorization: Bearer $COOLIFY_TOKEN" -H "Content-Type: application/json" \
  -d '{"docker_compose_raw": "<edited compose>"}' "$B/services/$SVC_UUID"
curl -s -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" "$B/services/$SVC_UUID/restart"
```

- [ ] **Step 5: Verify from dev machine** (after Task 4 installs `postgres`):

Run: `node -e "import('postgres').then(async ({default:p})=>{const s=p(process.env.DATABASE_URL);await s\`select 1\`;console.log('DB OK');await s.end()})"` with `DATABASE_URL=postgres://postgres:<PW>@212.28.184.24:5432/postgres`
Expected: `DB OK`. Write `DATABASE_URL` and a generated `DEV_SEED_TOKEN` (e.g. `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`) into `.env.local`.

---

## Task 4: Migration 0001 + `packages/core` (db client, types, room logic)

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `packages/core/src/types.ts`, `packages/core/src/db.ts`, `packages/core/src/room.ts`, `packages/core/src/index.ts`, `packages/core/vitest.config.ts`
- Test: `packages/core/src/room.test.ts`
- Create: `packages/core/scripts/migrate.mjs`
- Modify: `packages/core/package.json` (dep `postgres`, devDep `vitest`, script `migrate`)

**Interfaces:**
- Produces: `createDb(url?: string): Sql`; `getRoomPayload(sql: Sql, token: string): Promise<RoomPayload | null>`; `toRoomPayload(w, s, r, nowMs): RoomPayload`; types `WebinarRow`, `SessionRow`, `RegistrantRow`, and:

```ts
export interface RoomPayload {
  webinar: { title: string; durationSeconds: number; videoUrl: string | null;
             showAttendeeCount: boolean; allowRealChat: boolean };
  session: { id: string; startsAtMs: number; seed: number };
  serverNowMs: number;
  registrant: { firstName: string | null };
  over: boolean;
  redirectUrl?: string;
}
```

- [ ] **Step 1: Write `supabase/migrations/0001_init.sql`** — tables `webinars`, `sessions`, `registrants`, `attendances` with every column, check, default, and index from spec §5 verbatim (including nullable `tenant_id uuid`), plus `alter table <t> enable row level security;` on all four. No policies: deny-by-default for anon/auth; the app connects as `postgres` and bypasses RLS.

- [ ] **Step 2: Failing pure test `packages/core/src/room.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { toRoomPayload } from "./room";

const w = { id: "w1", title: "Demo", duration_seconds: 5752, video_url: "https://v",
  show_attendee_count: true, allow_real_chat: true } as any;
const s = { id: "s1", starts_at: new Date(1_000_000), seed: 42 } as any;
const r = { first_name: "Ben" } as any;

describe("toRoomPayload", () => {
  it("maps rows to the payload contract", () => {
    const p = toRoomPayload(w, s, r, 1_000_500);
    expect(p.webinar.durationSeconds).toBe(5752);
    expect(p.session.startsAtMs).toBe(1_000_000);
    expect(p.session.seed).toBe(42);
    expect(p.serverNowMs).toBe(1_000_500);
    expect(p.over).toBe(false);
    expect(p.registrant.firstName).toBe("Ben");
  });
  it("flags over when past duration", () => {
    expect(toRoomPayload(w, s, r, 1_000_000 + 5753 * 1000).over).toBe(true);
  });
});
```

- [ ] **Step 3: Run → FAIL. Implement `types.ts` + `room.ts`.** `toRoomPayload` maps snake_case → contract; `over = nowMs - startsAtMs >= duration_seconds * 1000`. Run → PASS.

- [ ] **Step 4: `db.ts` + IO half of `room.ts`:**

```ts
import postgres from "postgres";
export function createDb(url: string = process.env.DATABASE_URL!) {
  return postgres(url, { max: 5 });
}
```

`getRoomPayload(sql, token)`: select registrant by `access_token` (null → return null) → select its webinar → if `session_id` is null (on-demand): `INSERT INTO sessions (webinar_id, starts_at, seed) VALUES ($1, now(), floor(random()*2147483647)) RETURNING id`, then `UPDATE registrants SET session_id=$1 WHERE id=$2 AND session_id IS NULL`; zero rows updated → re-select registrant (concurrent-create race) → select session → `toRoomPayload(webinar, session, registrant, Date.now())`.

- [ ] **Step 5: `scripts/migrate.mjs`:** loads `.env.local` from repo root if present, creates `_migrations(name text primary key, applied_at timestamptz default now())`, applies `supabase/migrations/*.sql` in lexical order inside per-file transactions, prints `applied <name>` / `already applied`. Add `"migrate": "node scripts/migrate.mjs"` to `packages/core/package.json`.

- [ ] **Step 6: Run migration against deployed DB.** `npm run migrate -w @platform/core` → `applied 0001_init.sql`; re-run → idempotent. Verify tables exist via a `select tablename from pg_tables where schemaname='public'` query.

- [ ] **Step 7: Commit** `feat(core): schema 0001, db client, room payload builder, migrate script`.

---

## Task 5: Room API routes + dev seed endpoint

**Files:**
- Create: `apps/web/app/api/time/route.ts`, `apps/web/app/api/room/[token]/route.ts`, `apps/web/app/api/dev/seed/route.ts`
- (No unit tests — thin IO; covered by Task 8 smoke.)

**Interfaces:**
- Consumes: `@platform/core` `createDb`, `getRoomPayload`.
- Produces: `GET /api/time` → `{ nowMs: number }`; `GET /api/room/[token]` → `RoomPayload` or 404 `{ error: "not_found" }`; `GET /api/dev/seed` (header `x-seed-token`) → `{ joinUrl, token, webinarSlug }`, 404 if token env unset/mismatched.

- [ ] **Step 1: `app/api/time/route.ts`:**

```ts
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ nowMs: Date.now() }, { headers: { "cache-control": "no-store" } });
}
```

- [ ] **Step 2: `app/api/room/[token]/route.ts`:**

```ts
import { createDb, getRoomPayload } from "@platform/core";

export const dynamic = "force-dynamic";
const sql = createDb();

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(token)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const payload = await getRoomPayload(sql, token);
  if (!payload) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(payload, { headers: { "cache-control": "no-store" } });
}
```

- [ ] **Step 3: `app/api/dev/seed/route.ts`:** 404 unless `DEV_SEED_TOKEN` is set and header `x-seed-token` matches. Upsert webinar: `slug='demo'`, `title='Demo Webinar'`, `broadcast_mode='evergreen'`, `schedule_mode='ondemand'`, `duration_seconds=5752`, `video_url` = the verified archive.org URL in Global Constraints, `ON CONFLICT (slug) DO UPDATE SET video_url = EXCLUDED.video_url, duration_seconds = EXCLUDED.duration_seconds`. Insert registrant: `email = 'smoke-' || <ts> || '@example.com'`, `first_name='Smoke'`, `access_token = crypto.randomUUID()`. Return `{ joinUrl: "/room/" + token, token, webinarSlug: "demo" }`.

- [ ] **Step 4: Local verification** (dev server + `.env.local`):
  - `curl -s -H "x-seed-token: $DEV_SEED_TOKEN" localhost:3000/api/dev/seed` → JSON with token
  - `curl -s localhost:3000/api/room/<token>` → payload with `session.startsAtMs`; second call 2s later → identical `startsAtMs`
  - `curl -s localhost:3000/api/room/bogus-token` → 404
  - `curl -s localhost:3000/api/time` → `nowMs`

- [ ] **Step 5: Commit** `feat(web): /api/time, /api/room/[token], dev seed endpoint`.

---

## Task 6: Room page + hardened player

**Files:**
- Create: `apps/web/app/room/[token]/page.tsx`, `apps/web/components/RoomClient.tsx`, `apps/web/components/Player.tsx`, `apps/web/lib/clock.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `getRoomPayload`, `createDb` (core); `createServerClock`, `offsetSeconds`, `resolveSessionState` (timeline); `RoomPayload` type.
- Produces: `/room/[token]` route — 404 via `notFound()`, `redirect(payload.redirectUrl ?? "/")` when `over`, else `<RoomClient payload={...} />`.

- [ ] **Step 1: `lib/clock.ts`** (client module):

```ts
"use client";
import { createServerClock } from "@platform/timeline";

export const clock = createServerClock({
  ping: async () => {
    const res = await fetch("/api/time", { cache: "no-store" });
    const j = (await res.json()) as { nowMs: number };
    return j.nowMs;
  },
});
```

- [ ] **Step 2: `components/Player.tsx`** — exactly the hardened-player code from the design: client component, props `{ videoUrl: string; videoRef: RefObject<HTMLVideoElement | null>; title: string }`; `<video>` with no `controls`, `className="pointer-events-none h-full w-full"`, `playsInline`, `tabIndex={-1}`, `onKeyDown={(e) => e.preventDefault()}`, `disablePictureInPicture`; overlay row bottom-right with volume range input (`onChange` sets `videoRef.current.volume`) and a Fullscreen button (`requestFullscreen`/`exitFullscreen` on the wrapper div).

- [ ] **Step 3: `components/RoomClient.tsx`** — holds `videoRef`, renders title bar (`payload.webinar.title` + red LIVE dot), `<Player>`, and the gate: full-width "Join the session" button. On click: `const v = videoRef.current; v.currentTime = Math.max(0, offsetSeconds(payload.session.startsAtMs, clock.nowMs())); await v.play();` then hide gate. Below: offset readout `mm:ss / mm:ss` ticking every 1s from `offsetSeconds(startsAtMs, clock.nowMs())` and `payload.webinar.durationSeconds` (acceptance tooling; Phase 4 replaces with the status bar). `useEffect` starts `clock.start()` and returns `clock.stop`.

- [ ] **Step 4: `app/room/[token]/page.tsx`:**

```tsx
import { notFound, redirect } from "next/navigation";
import { createDb, getRoomPayload } from "@platform/core";
import RoomClient from "../../../components/RoomClient";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await getRoomPayload(createDb(), token);
  if (!payload) notFound();
  if (payload.over) redirect(payload.redirectUrl ?? "/");
  return <RoomClient payload={payload} />;
}
```

- [ ] **Step 5: README** — add: "Player hardening is friction, not DRM (spec §14): anyone with devtools can seek; the schedule is server-driven, so scrubbing gains nothing."

- [ ] **Step 6: Local manual check** — seed, open join URL, click Join, confirm seek + playback + ticking readout. Commit `feat(web): room page with hardened player and click-to-join gate`.

---

## Task 7: Dockerfile + Coolify application deploy

**Files:**
- Create: `Dockerfile`, `.dockerignore`

- [ ] **Step 1: `Dockerfile`:**

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/timeline/package.json packages/timeline/
COPY packages/media/package.json packages/media/
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @platform/web

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

`.dockerignore`: `node_modules`, `**/.next`, `.git`, `docs`, `test-results`, `playwright-report`, `.env`, `.env.local`.

- [ ] **Step 2: Validate build locally** (no Docker on dev machine): `npm run build` must succeed and produce `apps/web/.next/standalone/apps/web/server.js`. Fix `outputFileTracingRoot` if the server lands elsewhere. Commit `chore: dockerize app (standalone output)` and `git push origin main`.

- [ ] **Step 3: Create Coolify application.** First `nslookup webinar.advancedmarketing.co`; if it resolves to 212.28.184.24 use `https://webinar.advancedmarketing.co` for `domains`, else `https://webinar-platform.212.28.184.24.sslip.io`.

```bash
curl -s -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" -H "Content-Type: application/json" -d '{
  "project_uuid": "'"$PROJECT_UUID"'", "environment_name": "production",
  "server_uuid": "lcu0gium6zc89ljq96woj37n",
  "name": "webinar-web",
  "git_repository": "https://github.com/bensblueprints/platform",
  "git_branch": "main", "build_pack": "dockerfile", "dockerfile": "Dockerfile",
  "ports_exposes": "3000", "domains": "<chosen domain>", "instant_deploy": true
}' "$B/applications/public"
```
If a field is rejected, `GET "$B/applications/<existing-app-uuid>"` and mirror its field names.

- [ ] **Step 4: Set env vars** `DATABASE_URL` (prefer the supabase-db internal container name from Task 3; fall back to `212.28.184.24:5432`) and `DEV_SEED_TOKEN` via `POST "$B/applications/$APP_UUID/envs"` (`{key, value}` per call), then redeploy: `POST "$B/deploy?uuid=$APP_UUID&force=true"`.

- [ ] **Step 5: Verify.** Poll `GET "$B/applications/$APP_UUID"` until running; then `curl -s https://<domain>/api/time` → `nowMs`; `curl -s -H "x-seed-token: ..." https://<domain>/api/dev/seed` → join URL. Record domain + `APP_UUID` in `.env.local`.

---

## Task 8: Smoke script + Playwright acceptance + README

**Files:**
- Create: `apps/web/scripts/smoke.mjs`, `apps/web/playwright.config.ts`, `apps/web/e2e/room.spec.ts`
- Modify: `README.md`, `apps/web/package.json` (scripts `smoke`, `test:e2e`; devDep `@playwright/test`)

- [ ] **Step 1: `scripts/smoke.mjs`** — args `<baseUrl> <seedToken>`; asserts: `/api/time` returns `nowMs` within 60s of local; `/api/dev/seed` returns a token; `/api/room/<token>` returns all `RoomPayload` keys; `startsAtMs` identical across two calls 2s apart; `/api/room/definitely-bogus` → 404. Prints PASS/FAIL per check, exit 1 on any failure. Run against the deployed domain → all PASS.

- [ ] **Step 2: Playwright.** `npm i -D -w @platform/web @playwright/test && npx playwright install chromium`. `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
});
```

- [ ] **Step 3: `e2e/room.spec.ts`:**
  - `beforeAll`: fetch `/api/dev/seed` (header `x-seed-token` from `process.env.DEV_SEED_TOKEN`) → `{ token }`; fetch `/api/room/<token>` once to materialize the on-demand session and record `startsAtMs`.
  - Test 1 **late join seeks**: wait until wall clock is ≥ 12s after `startsAtMs`, open `/room/<token>`, click `Join the session`, assert `video.currentTime` in `[11, 20]`.
  - Test 2 **refresh resumes**: from test 1's page, note `currentTime`, `page.reload()`, click Join again, assert new `currentTime` ≥ noted and within 20s of `(Date.now() - startsAtMs)/1000`.
  - Test 3 **offset tracks wall clock**: read the mm:ss readout, wait 5s, assert it advanced 4–6s.

- [ ] **Step 4: Run e2e against production:** `E2E_BASE_URL=https://<domain> DEV_SEED_TOKEN=<token> npx playwright test --config apps/web/playwright.config.ts` → 3 PASS. If bundled Chromium lacks h264 for the mp4, document it and assert seek/clock behavior via `video.currentTime` after programmatic `play()` (which resolves for metadata-only); note the limitation in README.

- [ ] **Step 5: README** — repo map, dev loop (`npm install`, `.env.local`, `npm run dev`, `npm run migrate -w @platform/core`), secrets policy (public repo; secrets only in Coolify env / `.env.local`), deploy flow (push → Coolify), Phase 1 acceptance checklist with results.

- [ ] **Step 6: Commit + push** `test: smoke + playwright acceptance; docs: readme`.

---

## Self-review notes (plan author, completed)

- Spec coverage: §4 rules 1–4 → Tasks 2, 5, 6. §5 schema subset → Task 4. §10 on-demand → Task 4 `getRoomPayload`. §14 → Task 6. §16.2/16.3/16.6 → Tasks 2, 6. Design-doc infra decisions → Tasks 3, 7. Phase 0 (R2) intentionally absent — awaits Cloudflare credentials, gates only the final `packages/media` adapter (design doc "Out of scope").
- Placeholder scan: no TBD/TODO; every code step shows full code; infra steps show full commands with fallbacks.
- Type consistency: `RoomPayload`, `getRoomPayload`, `toRoomPayload`, `createDb`, `createServerClock`, `offsetSeconds`, `resolveSessionState`, `mulberry32`, `ServerClock` identical across Tasks 2/4/5/6/8.
