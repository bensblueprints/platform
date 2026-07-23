# Slice 2: Seeded chat (Phase 2)

**Date:** 2026-07-23
**Status:** Approved via standing go-ahead ("go and don't stop")
**Parent spec:** Evergreen Build Spec v2 — §5 (chat_scripts), §6 (chat engine), §12 (import lint), §13 (treatments), §15 Phase 2 acceptance, §16.2/16.8.

## Scope

CSV import (EverWebinar-compatible), backlog render on join, forward scheduling, three line treatments. Variance/roster (§6.2–6.3) is Phase 3; real chat (§6.1 Realtime) is Phase 7.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Delivery | Full `chat_scripts` array embedded in the existing `/api/room/[token]` payload (spec §6.1: static data, not a stream) | Zero websocket traffic; survives reconnects |
| Forward scheduling | 1s wall-clock tick + filter (`offset <= now`) instead of per-line `setTimeout` | Behaviorally identical, inherently immune to background-tab throttle (§16.2); fewer moving parts |
| Rendering cap | When backlog > 200 lines, render the most recent 200 (data stays complete in memory) | Meets §13's intent without a virtualization lib this slice; acceptance backlogs are ~30 lines |
| Import endpoint | `POST /api/dev/import-chat?webinar=<slug>[&reset=1]`, dev-token gated, body = raw CSV | Admin UI lands in a later slice; endpoint makes import testable now. `reset=1` clears the webinar's script first (e2e determinism) |
| Import semantics | Atomic: any row error → reject whole file, return all row errors; warnings never block (§6.4 + §12) | Matches EverWebinar reject-on-error behavior |
| Error vocabulary | Exact EW strings: `Row column count is not 7`, `Role is invalid`, `Type is invalid`, `Hour is invalid`, `Name issue` (+ `Minute is invalid`, `Second is invalid` by analogy; `Message is empty` is our documented extension) | Compatibility is deliberate (§6.4) |
| Layering | `ChatLine` (camelCase payload contract) lives in `@platform/core` types; `@platform/chat` parses to snake_case DB rows, no core dependency; `@platform/room-ui` renders `ChatLine[]` | Parser stays standalone; payload contract stays in one place |
| Treatments | attendee (default) / admin (accent + badge) / highlighted (amber border, mode `highlighted` or `tip` overrides); `question` gets a small badge on attendee lines (§13) | Three visually distinct treatments, highlighted interrupts without shouting |

## CSV rules (spec §6.4)

Seven columns `Hour,Minute,Second,Name,Role,Message,Mode`; header row optional (detect + skip); Hour 0–7, Minute/Second 0–59; `offset_seconds = h*3600+m*60+s`; Role Admin|Attendee case-insensitive; Mode `chat|question|answer` (attendee), plus `highlighted|tip` (admin); UTF-8, RFC4180 quoting; cap 5,000 rows/file; append by default; `.txt` accepted (content-based — the endpoint reads text regardless of extension).

## Import lint (spec §12)

Attendee-role lines only. Warnings (never block) for: currency amounts (`$5,000`, `10k dollars`), percentage gains (`40%`), first-person outcome claims (`I made/earned/doubled…`). Returned as `{row, reason}` in the import response.

## Data

Migration `0002_chat_scripts.sql`: `chat_scripts` table verbatim from spec §5 + index + RLS (no policies, app connects as postgres).

## Verification

- vitest: parser (valid EW sample verbatim from spec, header detect, quoted commas, CRLF, every error string, 5,001-row cap), lint patterns, backlog/cap split. Target ~25 tests.
- API: import → room payload contains lines in order; malformed CSV → 422 `{row, reason}`; `reset=1` replaces.
- Playwright (`e2e/chat.spec.ts`, production): unique-per-run script with lines at 5s/10s/15s/20s; join at ~12s → the two backlog lines present instantly in order; 15s and 20s lines appear on time (±3s); admin + highlighted treatments carry distinct hooks; autoscroll pill appears when scrolled up.
