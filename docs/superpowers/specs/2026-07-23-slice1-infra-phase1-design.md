# Slice 1: Infrastructure + Phase 1 (server-authoritative timeline)

**Date:** 2026-07-23
**Status:** Approved by owner 2026-07-23
**Parent spec:** Evergreen Build Spec v2 (provided in conversation; sections referenced below)
**This slice covers:** monorepo scaffold, Coolify infrastructure, database migration 0001, room payload API, custom player, server-authoritative offset with drift correction. Everything in spec section 15 "Phase 1", plus the deploy plumbing all later phases build on.

## Context

One product, two broadcast modes (evergreen now, live later per the companion spec). Replaces EverWebinar/WebinarJam at $99/mo. The full evergreen build is ~7 subsystems and is being built in the spec's own phase order; this is the first design+implementation cycle. Phase 0 (R2 range verification) runs as soon as Cloudflare credentials exist, in parallel — it is not a code dependency of this slice, only of the final video adapter.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Hosting | Existing Contabo VPS via Coolify 4.1.2 API (`https://server.advancedmarketing.co`, server IP 212.28.184.24) | No Docker on the dev machine; matches the spec's eventual self-hosted deploy shape |
| Supabase | Fresh dedicated one-click service on Coolify | Isolation from the existing cupidcoach instance; spec leans on Auth/Realtime later |
| Redis/workers | Deferred to Phase 6 | Nothing in Phases 1–5 uses BullMQ; box already runs ~116 containers |
| Git | Public repo `github.com/bensblueprints/platform` for now | Coolify pulls public repos with no GitHub App wiring; secrets live only in Coolify env vars |
| Monorepo tooling | npm workspaces, plain npm scripts | No pnpm installed; build graph is tiny; no Turbo |
| App hostname | `webinar.advancedmarketing.co` if DNS resolves, else `webinar-platform.212.28.184.24.sslip.io` | Traefik + Let's Encrypt already on the box; sslip is the zero-DNS fallback |
| Demo content | One seeded "Demo Webinar" (on-demand schedule) with a public-domain 45+ min MP4 (a Blender Foundation open movie, e.g. Big Buck Bunny / Sintel class of content) | Makes Phase 1 acceptance tests real |

## Architecture

```
GitHub (public repo, push triggers Coolify deploy)
  └── Coolify project "Webinar Platform"
        ├── Service: Supabase (one-click stack: Postgres, Kong, GoTrue, PostgREST, Realtime, Storage, Studio)
        └── Application: apps/web (Dockerfile, multi-stage)
              ├── public: /w/[slug] (registration — stub this slice), /room/[token]
              └── api: /api/room/[token], /api/time, /api/dev/seed (enabled only when a DEV_SEED_TOKEN env var matches a request header; unset in production)
Developer machine (Windows, Node 24, no Docker)
  └── npm run dev against the deployed Supabase (public Postgres port for migrations)
```

Data flow for a room join:

```
browser → GET /room/[token] (Next.js page, server component)
        → server: registrant = lookup(access_token)         [404 if unknown]
        → server: session = resolveSession(registrant)      [on-demand only this slice; jit/recurring arrive in Phase 6]
        → server: if over → payload carries { over: true, redirectUrl }; page redirects per webinar config
        → page renders player shell + payload JSON
browser → GET /api/time → { nowMs }
client  → delta = serverNow − clientNow; stored; re-pinged every 60s
client  → offsetSeconds = floor((serverNow() − starts_at) / 1000)
client  → seek video to offsetSeconds inside the "Join" click gesture; play
```

## Repo scaffold

```
platform/
  apps/
    web/                  Next.js 15 App Router, React 19, TypeScript, Tailwind
    workers/              placeholder package.json only (Phase 6)
  packages/
    core/                 db client (service-role), shared types, RLS helpers
    room-ui/              placeholder (Phase 2)
    timeline/             offset math, server-clock drift correction — pure TS + vitest
    chat/                 placeholder (Phase 2)
    offers/               placeholder (Phase 5)
    media/                adapters/evergreen.ts (plain-URL impl now; R2 signed-URL later), storage/ placeholder
    analytics/            placeholder (Phase 8)
    notifications/        placeholder (Phase 8)
  supabase/migrations/    0001_init.sql
  docs/superpowers/specs/
```

All packages exist as wired workspaces from day one (empty `index.ts` exports where deferred) so no import path ever gets rewired mid-build.

## Database — migration 0001

Tables exactly per spec section 5, including nullable `tenant_id` columns: `webinars`, `sessions`, `registrants`, `attendances` (with the spec's indexes). Chat, offer, roster, and curve tables arrive as later migrations with their phases. RLS enabled on all four tables with no public policies — the app server uses the service key and authorizes by `access_token` in application code, per spec ("Room reads authenticate via `registrants.access_token`… not Supabase auth"). Applied via `psql` against the Supabase Postgres public port; the same SQL files are the migration source of truth in `supabase/migrations/`.

Seed data (dev-only endpoint + SQL): one webinar row — slug `demo`, `schedule_mode='ondemand'`, `duration_seconds` matching the demo video, `video_url` a public-domain MP4 — plus a registrant factory so acceptance runs end-to-end.

## API design

`GET /api/time` → `{ "nowMs": 1721300000000 }`. No caching headers.

`GET /api/room/[token]`:

- 404 `{ error: "not_found" }` for unknown tokens (no information leak about token validity).
- Resolves session: registrant's `session_id`; if null (on-demand), creates one with `starts_at = now()` inside a transaction and links it (spec section 10 on-demand rule).
- 200 body:

```json
{
  "webinar": { "title": "...", "durationSeconds": 2700, "videoUrl": "https://...",
               "showAttendeeCount": true, "allowRealChat": true },
  "session": { "id": "uuid", "startsAtMs": 1721300000000, "seed": 123456 },
  "serverNowMs": 1721300000300,
  "registrant": { "firstName": "Ben" },
  "over": false
}
```

- If `offsetSeconds > duration_seconds`: `{ "over": true, "redirectUrl": ... }` and the room page redirects per webinar config (spec section 4 rule 4).

## Timeline core (`packages/timeline`)

Pure, framework-free, fully unit-tested:

- `createServerClock(ping: () => Promise<number>)` — holds `deltaMs = serverNow − performance.now()`-based local clock; `nowMs()`; resyncs on interval and on failure backoff (spec 16.6: not optional).
- `offsetSeconds(startsAtMs, nowMs)` — the one integer everything derives from. Never from `<video>.currentTime`.
- `resolveSessionState(offsetSeconds, durationSeconds)` → `pre | live | over`.
- Session PRNG (mulberry32 keyed on `session.seed`) lives here too — Phase 3's variance and Phase 4's curve consume it; defining it now keeps them pure later.

Browser behavior (spec 16.2): timers are never trusted; on every `visibilitychange` the schedule re-derives from wall clock. Slice 1 has no scheduled events yet, but the clock primitive is built and tested here because Phases 2–5 all depend on it.

## Player (`apps/web` client component)

Per spec section 14: wraps `<video>`, no `controls` attribute, `pointer-events: none` on the element, keyboard seek handlers swallowed, volume + fullscreen exposed only. Explicit "Join the session" button — playback starts inside that user gesture, with sound (spec 16.3: never attempt unmuted autoplay). On join: seek to `offsetSeconds`, play. If `over`, redirect instead. README states plainly: friction, not DRM.

## Error handling

- Unknown/expired token → clean 404 page, no stack, no hint which part failed.
- `/api/time` failure → keep last delta, exponential backoff (1s→30s cap), room stays functional on the local clock; banner only after 5 consecutive failures.
- Video load failure → inline retry with backoff; the *schedule* keeps running regardless (the timeline never depends on the player).
- Session ends mid-watch → redirect per config at `offset == duration`.
- Supabase unreachable at request time → 503 with retry-after; no partial payloads.

## Testing

- **vitest** in `packages/timeline`: offset math at boundaries (0, exact start, negative, exact end, 1s past end), drift correction with a fake clock, visibilitychange re-derivation, PRNG determinism per seed and difference across seeds.
- **API smoke script** (`apps/web/scripts/smoke.mjs`, run against the deployed URL): seeds a webinar + registrant, hits `/api/room/[token]`, asserts payload shape and that `startsAtMs` is stable across calls; asserts unknown token → 404.
- **Live acceptance (spec Phase 1):** join 10 minutes after start → video begins at 10:00; refresh resumes at the correct point; background the tab 2 minutes → offset accurate on return. Verified manually against the deployed URL with the demo webinar, plus the unit tests covering the math.

## Risks / watch items

- **Box capacity:** the Supabase stack adds ~10 containers to a server running ~116. Watch RAM after deploy; if it pressures the box, the fallback is standalone Postgres + app-side realtime later (rejected as primary because the spec needs Supabase Realtime/Auth for live mode).
- **DNS:** `webinar.advancedmarketing.co` needs an A record to 212.28.184.24 (or a wildcard that already covers it). Let's Encrypt fails until then; sslip fallback keeps the slice unblocked either way.
- **Supabase public Postgres port:** required to apply migrations from the dev machine; enable in Coolify service settings, restrict/keep credential-strength password.
- **Public repo:** code only. All secrets (Supabase keys, DB passwords) live in Coolify env vars; a repo-secret scan is part of the pre-push checklist.

## Out of scope for this slice

Phase 0 R2 harness (awaits Cloudflare credentials), seeded chat, variance/roster, attendee curve, offers/Stripe, scheduling modes beyond on-demand, real chat/moderator, notifications, analytics, script generator, registration page beyond a stub, `.ics`.
