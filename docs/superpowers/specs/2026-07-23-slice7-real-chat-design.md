# Slice 7: Real chat + moderator console (Phase 7)

**Date:** 2026-07-23
**Status:** Approved via standing go-ahead ("go and don't stop")
**Parent spec:** Evergreen Build Spec v2 — §5 (`chat_messages`), §6.1 (real chat path), §11 (moderator console), §15 Phase 7 acceptance.

## Scope

Real attendee chat with strict visibility isolation, a moderator console with unified inbox, private replies, and broadcasts reaching every active session of the webinar.

**Transport deviation (like slice 5):** spec names Supabase Realtime; Kong on this box is broken (see slice 5 design doc), so real chat uses the same app-mediated SSE pattern as offer ticks: `GET /api/chat/[token]/stream` (per-attendee channel), plus a moderator SSE at `/api/admin/chat/stream`. If Kong is fixed, swap transports (migration 0008 still adds `chat_messages` to the publication).

## Design

| Decision | Choice | Rationale |
|---|---|---|
| Message model | `chat_messages` verbatim from §5 (migration 0008 + publication guard) | Spec |
| Visibility rule | Attendee sees: own messages + moderator broadcasts (`broadcast=true`). Moderator sees: everything for the webinar. Never attendee-to-attendee (§6.1) | Acceptance: "Attendee A never sees attendee B's message" |
| Attendee send | `POST /api/chat/[token]` `{body}` → insert `author_type='attendee'`, broadcast=false; delivered to that attendee's own stream + moderator inbox | |
| Moderator reply | `/admin/live` console (behind a simple admin token env for now — real Supabase Auth lands with the tenant spec): pick a message, reply privately (`author_type='moderator'`, broadcast=false, registrant_id = target attendee — delivered only to that attendee) or broadcast (`broadcast=true` → every active session of the webinar) | §11 |
| Attendee stream | SSE per (token): server polls `chat_messages` every 2s for `registrant_id = me OR broadcast = true` (and webinar's active sessions for broadcast); dedupe client-side by id | Mirrors offer-tick pattern |
| Moderator stream | SSE per webinar: all non-broadcast attendee messages + own broadcasts, with attendee name, join offset, and current offset per message (§11) | Unified inbox |
| Room UI | Real chat composes **above** seeded chat in the same rail: a "Say something" input at the bottom (only when `allow_real_chat`); real messages render in a distinct "you" treatment; moderator broadcasts render in the admin treatment | §6.1 two paths stay separate |
| Moderator console | `/admin/live?key=<ADMIN_KEY>`: active sessions list + unified inbox + reply box with private/broadcast toggle. Simple key check (env), documented as interim | Real auth with tenant spec |
| Heartbeats | Attendance rows: create on join (with `join_offset_seconds`), heartbeat every 30s (`last_heartbeat_at`), `exit_offset_seconds` on unload — powers "active sessions" and Phase 8 analytics | Table exists since 0001, unused until now |

## Verification

- vitest: visibility query builder (attendee vs moderator projections), heartbeat math.
- e2e (`realchat.spec.ts`, production): attendee A sends → A sees it, B never does, moderator sees both A's and B's; moderator private reply → only target sees it; moderator broadcast → both see it in admin treatment; `/admin/live` shows attendee name + offsets; heartbeat rows exist.
