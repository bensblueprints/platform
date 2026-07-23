# Platform

Evergreen + live webinar platform. Replaces EverWebinar/WebinarJam as one subscription.
Evergreen mode plays a pre-recorded video as a scheduled "live" session on a
**server-authoritative timeline** — every timed thing in the room derives from
`offsetSeconds = (serverNow - starts_at) / 1000`, never from `<video>.currentTime`.

## Status

**Slice 1 (infrastructure + Phase 1 timeline core): shipped and verified.**
**Slice 2 (Phase 2 seeded chat): shipped and verified.**
**Slice 3 (Phase 3 per-session variance + name roster): shipped and verified.**
**Slice 4 (Phase 4 simulated attendee counter): shipped and verified.**
**Slice 5 (Phase 5 offer + payments): shipped; live Stripe purchase pending API key.**

- Live app: https://webinar-platform.212.28.184.24.sslip.io
- Repo: https://github.com/bensblueprints/platform (public for now — no secrets here)

Phase 1 acceptance results (spec §15):

- Join late → video seeks to the wall-clock offset: PASS (Playwright, production, 12 s late join; 600 s case covered by unit tests in `packages/timeline`)
- Refresh resumes at the correct point: PASS (Playwright, production)
- Offset stays accurate (wall-clock derived, re-derived every second; `/api/time` resync every 60 s with backoff): PASS (Playwright + vitest)
- API smoke (10 checks against production): PASS — `npm run smoke -w @platform/web -- <baseUrl> <seedToken>`

Phase 2 acceptance results (spec §15):

- EverWebinar-format CSV imports unedited: PASS — `POST /api/dev/import-chat?webinar=<slug>[&reset=1]` (7-column schema, header detect, quoted fields, 5,000-row cap, append default; FTC lint warnings per §12 never block)
- Malformed row returns row number and reason in EverWebinar vocabulary (`Row column count is not 7`, `Role is invalid`, `Type is invalid`, `Hour is invalid`, `Name issue`): PASS (unit + e2e)
- Late join renders the full backlog in order; forward lines arrive on time: PASS (Playwright, production — join at ~12 s, lines at 17 s/23 s land within tolerance)
- Three treatments (attendee / admin / highlighted) + Q badge, autoscroll-only-at-bottom with new-message pill: PASS
- Chat rides the wall-clock tick, immune to background-tab throttle (§16.2): by design, covered by clock unit tests

Phase 3 acceptance results (spec §15):

- Two sessions show different names and slightly different chat: PASS (Playwright, production — distinct seeds produce distinct drop/jitter/roster draws)
- The same session is identical across refreshes: PASS (deterministic transform keyed on `session.seed`)
- `{{name}}` resolves against `name_roster` via a stable per-session index map; literal names pass through: PASS (unit + e2e; tokens never render literally)
- Admin/question/answer lines are never dropped (preserves the §7.4 pairing invariant — stricter than §6.2's letter, documented in the slice 3 design doc): PASS
- Suite runs parallel-safe: each e2e spec seeds its own isolated webinar (`?webinar=<slug>`)

Phase 4 acceptance results (spec §15):

- Ramps (logistic), plateaus, decays to `end_pct * peak`: PASS (unit tests; ramp verified live on a 1-minute test curve)
- Never zero, never decreases during ramp: PASS (full-sweep unit tests + live ramp check)
- Identical on refresh at the same offset: PASS (deterministic per `(seed, 10s bucket)`; e2e refresh check)
- Count animates, never hard-swaps; instant under `prefers-reduced-motion`; compact status bar (live dot + title + count): PASS
- `show_attendee_count = false` hides the module: PASS (e2e toggle)
- Evergreen-only: the function lives in `packages/timeline/attendance.ts` with a header warning; live mode must use real counts (§8)

Phase 5 acceptance results (spec §15):

- Panel appears on time (start offset), entrance animated, collapsible, beneath the video on mobile: PASS
- Per-attendee urgency countdown persists across refresh (localStorage, never resets): PASS
- Impression/click events recorded server-side; impression idempotent per attendee: PASS
- Price ladder computed server-side; `units_sold` increment → price rises by increment and pushes live to a second open browser: PASS (SQL-simulated purchase over SSE)
- **Transport note:** spec names Supabase Realtime for ticks. This box's Kong gateway redirects every Supabase API route (incl. `/realtime/v1/websocket`) to `/login` (verified 2026-07-23), so browser→Realtime is not viable; ticks ship as SSE from our own app (`/api/offers/[id]/stream`) delivering the identical visible behavior. Swap back if Kong is fixed (migration 0006 already publishes `offers`).
- Stripe Checkout Session created at click time with server-computed price; webhook is the only `units_sold` increment (idempotent via `stripe_session_id`): code shipped, **live test-purchase pending `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`**

## Repo map

```
apps/
  web/            Next.js 15 (App Router) — registration, room, admin, APIs
  workers/        BullMQ jobs (placeholder until Phase 6)
packages/
  core/           db client (postgres.js, service-role), types, room payload, migrate script
  timeline/       offset math, drift-corrected server clock, seeded PRNG (pure, vitest)
  room-ui/        chat rail, offer panel, countdown, attendee count (Phase 2+)
  chat/           seeded engine, CSV parser, realtime adapter (Phase 2+)
  offers/         price ladder, Stripe, urgency, scarcity (Phase 5)
  media/          storage + playback adapters (R2 adapter lands with Phase 0 credentials)
  analytics/      (Phase 8)
  notifications/  (Phase 8)
supabase/migrations/  SQL migrations, applied by packages/core/scripts/migrate.mjs
docs/superpowers/     design specs + implementation plans
```

## Dev loop

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL + DEV_SEED_TOKEN
npm run migrate -w @platform/core   # apply DB migrations
npm run dev                       # http://localhost:3000
npm test                          # vitest across workspaces
```

Env vars: `DATABASE_URL` (direct Postgres connection string), `DEV_SEED_TOKEN`
(enables `/api/dev/seed` with matching `x-seed-token` header; unset disables it).

## Infrastructure (Coolify @ https://server.advancedmarketing.co)

- Project "Webinar Platform": Supabase one-click service (`webinar-supabase`) + app (`webinar-web`, this repo, Dockerfile build)
- Postgres exposed on `212.28.184.24:5432` for migrations/dev (strong random password; can be closed later)
- Deploy: push to `main`, then trigger via Coolify API `POST /api/v1/deploy?uuid=<app>&force=true` (uuids are in local `.env.local`, not committed)
- Redis/workers intentionally deferred to Phase 6

## Player hardening

Player hardening is friction, not DRM (spec §14): anyone with devtools can seek; the schedule is server-driven, so scrubbing gains nothing. The video element ships no `controls`, `pointer-events: none`, swallowed keyboard seeks; volume + fullscreen only; playback starts behind an explicit "Join the session" click gate (autoplay-with-sound is blocked everywhere, spec §16.3).

## Testing

- `npm test` — vitest (timeline math, clock drift/backoff, PRNG, room payload mapping)
- `node apps/web/scripts/smoke.mjs <baseUrl> <seedToken>` — 10 API checks
- `cd apps/web && E2E_BASE_URL=<url> DEV_SEED_TOKEN=<token> npx playwright test` — Phase 1 acceptance (uses system Edge via `channel: "msedge"` for h264; bundled Chromium lacks the codec)

## Secrets policy

Public repo: code only. Secrets live in Coolify env vars and local `.env.local` (gitignored). Never commit tokens, keys, or connection strings.
