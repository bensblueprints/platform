# Slice 8: Notifications + analytics (Phase 8)

**Date:** 2026-07-23
**Status:** Approved via standing go-ahead ("go and don't stop")
**Parent spec:** Evergreen Build Spec v2 — §11 (notifications, analytics), §15 Phase 8 acceptance.

## Scope

Reminder notification sequences (registration, 24h, 1h, 10min, attended/no-show branches) as BullMQ delayed jobs with pluggable send adapters, and the analytics dashboard with the retention-vs-offer chart as its hero.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Job scheduling | BullMQ delayed jobs enqueued from the web app at registration (`delay` = ms until each reminder); workers process them. Queue `notifications` | §11 names BullMQ; web gets bullmq+ioredis deps + REDIS_URL env |
| Jobs per registration | `confirm` now; `reminder-24h`, `reminder-1h`, `reminder-10m` when starts_at minus that offset is in the future; `post-session` at starts_at + duration → resolves to `attended` or `no-show` by checking attendances | §11 exactly |
| Adapters | `packages/notifications`: `log.ts` (writes `notifications_log` rows — default, always active), `ghl.ts` (GoHighLevel contact upsert + workflow add via REST, active when `GHL_API_KEY`+`GHL_LOCATION_ID` set), `smtp.ts` (nodemailer, active when `SMTP_URL` set). Every send also recorded in `notifications_log` regardless of adapter | §11: GHL recommended default — code ready, key pending; log adapter keeps everything verifiable now |
| Migration 0009 | `page_views` (webinar_id, utm jsonb, created_at) + `notifications_log` (registrant_id, kind, channel, payload jsonb, sent_at) | Visitors metric + send records |
| Visitor tracking | `/w/[slug]` server component inserts a page_view per hit (with utm passthrough) | Feeds the funnel top |
| Analytics | `/admin/analytics/[slug]?key=` (interim ADMIN_KEY): visitors, registrants, attendees, show rate; retention curve per 30s bucket (join→exit-or-last-heartbeat); offer funnel (impressions→clicks→purchases, revenue from purchase `amount_cents`); revenue per registrant + per attendee. Hero: hand-rolled SVG polyline of retention with the first offer's start offset marked — no chart lib | §11: retention vs offer timestamp is the hero |
| Compute | `getWebinarAnalytics(sql, webinarId)` in `packages/core` — SQL for counts, JS for retention buckets (attendance volumes are small) | Testable in the smoke script |

## Verification

- vitest: reminder scheduling math (which jobs, what delays; past-window exclusions); attended/no-show resolution.
- e2e (`analytics.spec.ts`, production): JIT registration → BullMQ delayed jobs exist (dev endpoint); `/w/[slug]` view increments visitors; analytics page renders funnel numbers consistent with DB counts; retention SVG present with ≥1 data points for a session with attendances; offer funnel for demo-offer shows impressions ≥ clicks ≥ purchases.
