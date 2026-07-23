# Slice 6: Registration + scheduling (Phase 6)

**Date:** 2026-07-23
**Status:** Approved via standing go-ahead ("go and don't stop")
**Parent spec:** Evergreen Build Spec v2 — §10 (scheduling), §11 (registration), §15 Phase 6 acceptance, §16.7 (session table hygiene).

## Scope

Public registration page, all three schedule modes (JIT, recurring, on-demand), timezone handling, `.ics`, and the workers app (BullMQ) that materializes recurring sessions and cleans up dead ones.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Registration page | `/w/[slug]` server component: webinar title/subtitle, next-session time rendered in the viewer's zone (with abbreviation), email + first name + optional phone form, hidden timezone input filled by `Intl.DateTimeFormat().resolvedOptions().timeZone` (fallback UTC) | §11 + §10 timezone rule |
| Register POST | `POST /api/register` → validates slug + email, creates registrant with `crypto.randomUUID()` access token, stores timezone + utm (from query params), assigns session per mode: **jit** = shared slot session (create-if-missing), **recurring** = next materialized session ≥ now, **ondemand** = null (created lazily on room hit, existing behavior) | §10: session rows on registration, not page view |
| JIT slot | `ceil(now / jit_interval_minutes) + jit_lead_minutes`; session insert `on conflict (webinar_id, starts_at) do nothing` | §10 JIT + acceptance "exactly one session row" |
| Idempotency | Migration 0007: `create unique index on sessions (webinar_id, starts_at)` — makes JIT + recurring materialization race-safe | §10 "Idempotent on (webinar_id, starts_at)" |
| Recurring materialization | `materializeRecurringSessions(sql)` in `packages/core` — for every recurring webinar: next 14 days in the webinar's timezone, matching `recurring_days` × `recurring_times`, insert on conflict do nothing. Called by the BullMQ job (every 15 min) and by a dev endpoint (e2e) | §10 recurring, testable without waiting for the scheduler |
| Cleanup job | Daily: delete `sessions` where `starts_at + duration_seconds` has passed, zero attendances, status 'scheduled' | §16.7 |
| Workers app | `apps/workers`: BullMQ + ioredis, one `scheduling` queue, repeatable jobs (materialize every 15 min, cleanup daily), own `Dockerfile.workers`, deployed as a second Coolify application from the same repo. `tsx` runtime (no build step) | Redis arrives exactly when first needed, as planned |
| Redis | Coolify one-click `redis` service with password; port 6379 published for dev (same pattern as Postgres); workers connect via `212.28.184.24:6379` | Matches existing infra pattern |
| Confirmation | `/w/[slug]/confirmed?token=...`: session time in registrant tz + abbreviation, `.ics` download (`/api/ics/[token]`, DTSTART UTC + DURATION), join button `/room/[token]`; ondemand shows "starts now" | §11 |
| Schedule display on /w/[slug] | jit: next slot live-computed; recurring: next materialized session; ondemand: "starts immediately after you register" | Per-mode truth |

## Verification

- vitest `packages/timeline/schedule`: JIT ceil+lead boundaries (exact multiple, 1s past, lead addition), recurring slot computation across DST-irrelevant UTC and a DST-observing zone (America/Denver spring-forward week), 14-day horizon, day/time filtering.
- e2e (`register.spec.ts`, production): JIT page shows a slot within `interval+lead`; registering creates **exactly one** session row (dev endpoint count) and a second registration to the same slot creates none; recurring webinar + materialize endpoint → 14 days of sessions, second call adds zero; registration confirmation shows tz abbreviation and a working `.ics`; ondemand register → join works end-to-end.
