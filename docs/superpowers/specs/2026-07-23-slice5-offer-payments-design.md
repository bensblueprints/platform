# Slice 5: Offer panel + Stripe payments (Phase 5)

**Date:** 2026-07-23
**Status:** Approved via standing go-ahead ("go and don't stop")
**Parent spec:** Evergreen Build Spec v2 — §5 (`offers`, `offer_events`), §9 (offer engine), §12 (real purchases only), §13 (panel entrance, mobile), §15 Phase 5 acceptance, §16.4/16.5.

## Scope

Timed offer panel beneath the video with per-attendee urgency countdown, scarcity, server-computed price ladder, Stripe Checkout at click time, verified webhook as the only `units_sold` increment path, and live price-tick push to other viewers.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Price ladder | `currentPriceCents = min(cap, start + increment * units_sold)`, pure fn in `packages/offers`, computed server-side into the payload; `nextPriceCents` shown when increment > 0 (§9 "honest and it converts") | One implementation, tested |
| Offers in payload | `offers: [...]` array on the room payload (all offers for the webinar with window + ladder config + `unitsSold`); client mounts the panel for offers where `startOffset <= now < (endOffset ?? ∞)` | Multi-offer ready; single source of truth |
| Panel mount/unmount | Wall-clock offset like everything else; `impression` event POSTed on first mount per attendee (dedupe client-side per session) | §9 timing |
| Urgency countdown | Starts when the offer first becomes visible **to that attendee**; persisted in `localStorage["urgency:<session_id>:<offer_id>"] = startedAtEpochMs`; refresh continues, never resets (§9) | Per-attendee semantics |
| Scarcity | `inventory_total - units_sold` when enabled; updates live with the tick | §9 |
| Live price tick | Supabase Realtime `postgres_changes` subscription on `offers` UPDATE (anon key, browser). Requires: anon SELECT policy on `offers` (offer content is public room data), Supabase public URL over **https** via Traefik (not the :8000 http origin — mixed content). Client recomputes price with the ladder fn on each event. 5s polling fallback if the socket fails | §9 + §15 "price rise pushes live to a second open browser" |
| Checkout | `POST /api/offers/[id]/checkout` with registrant token → validates offer is in-window, computes price server-side, creates Stripe Checkout Session with inline `price_data` (never pre-created prices, §9), records a `click` event, returns `{url}` | Price shown = price paid |
| Webhook | `POST /api/stripe/webhook`: verifies signature, on `checkout.session.completed` inserts `purchase` offer_event (`stripe_session_id` unique = idempotency, §16.5) and `update offers set units_sold = units_sold + 1 ... returning units_sold` in one transaction (§16.4) | Never from a client click |
| Purchase toasts | Deferred to Phase 7 (Realtime broadcast infrastructure); `broadcast_sales` stays false | Acceptance doesn't cover it |
| Stripe adapter | `packages/offers/payments.ts`: `createCheckoutSession(args)` + `verifyWebhookAndParse(headers, rawBody)` — real Stripe impl; interface allows a test fake | Unit-testable without keys |
| Missing Stripe key | Checkout endpoint returns 503 `payments_not_configured`; everything else (panel, ladder, tick, events) works and is e2e-tested by simulating a purchase via SQL (`update offers set units_sold = units_sold + 1`) — same propagation path, minus Stripe's signature | Unblocked until `sk_test_...` arrives |
| Demo offer | `/api/dev/seed-offer?webinar=<slug>` — start_offset 10s, headline offer, price $100 +$5/sale cap $997, urgency 10min, scarcity 25 | E2E + demo |

## Migration 0005

`offers` and `offer_events` verbatim from spec §5 + indexes + RLS enabled. Plus **one policy**: `create policy offers_public_read on offers for select using (true);` — offer content is public room data and Realtime `postgres_changes` for anon requires SELECT. `offer_events` gets no public policy (writes via service only).

## Verification

- vitest: ladder (start, increments, cap, next-price display rule); urgency remaining-time math; window resolution.
- API: checkout 503 without key; with key (when provided) returns a Stripe URL; webhook idempotency (duplicate delivery → single increment).
- e2e (`offer.spec.ts`, production): panel hidden before start offset, appears at start (entrance class present), countdown persists across reload (remaining time continuous), scarcity shows `inventory - sold`, next price shown, SQL-simulated purchase updates the open page's price **and** a second browser's price (Realtime), Stripe live purchase when key arrives (test card 4242…, `units_sold` increments, ladder ticks).
