# Slice 4: Simulated attendee counter (Phase 4)

**Date:** 2026-07-23
**Status:** Approved via standing go-ahead ("go and don't stop")
**Parent spec:** Evergreen Build Spec v2 — §5 (`attendance_curves`), §8 (curve function), §13 (status bar, animation), §15 Phase 4 acceptance.

## Scope

A deterministic, seeded "people in the room" number for evergreen sessions only: logistic ramp, plateau, linear decay, seeded jitter, animated display in a compact status bar. `show_attendee_count = false` hides it.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Home | `packages/timeline/src/attendance.ts` (pure) — the workspace description already covers "seeded curve" | Stays framework-free and unit-testable; **evergreen-only by construction** — nothing in live mode may import it (§8 warning) |
| Ramp shape | True logistic `L(t)=1/(1+e^{-12(t-0.5)})`, normalized so `L(0)≈0`, `L(ramp)=peak` exactly | Spec says logistic; smoothstep would be easier but isn't |
| Plateau | Flat at peak from ramp end to `plateau_pct * durationSeconds` (jitter supplies the wobble) | §8 "hold near peak" |
| Decay | Linear from peak at plateau end to `end_pct * peak` at `durationSeconds` | §8 |
| Jitter | Per-10s-bucket multiplier `1 + (rng-0.5)*2*jitterPct`, rng = `mulberry32(seedCombine(sessionSeed, bucket))` | §8: wobbles every 10s, identical on refresh |
| Never decrease during ramp | Sweep buckets 0→current once per call, enforcing a running max during the ramp window | O(offset/10) ≈ 600 iterations worst case — trivial; deterministic and stateless |
| Never zero | Clamp to ≥ 1 after rounding, at every offset | §8 |
| Payload | `webinar.curve: {peakCount, rampMinutes, plateauPct, endPct, jitterPct}` from `attendance_curves`, falling back to table defaults (240/8/0.55/0.35/0.03) when no row | One payload, no extra round trip |
| Display | `StatusBar` (live dot + title + animated count) in `room-ui`; count tweens over ~600ms via rAF; `prefers-reduced-motion` → instant set (§13); hidden when `showAttendeeCount=false` | §13 "animates, does not jump" |
| Config write path | Dev endpoint `/api/dev/seed-curve?webinar=<slug>&peak=&ramp=` (upsert) for e2e + demos | Admin UI lands later |

## Verification

- vitest: monotonic non-decreasing during ramp; ≈peak through plateau (± jitter band); decays to `endPct*peak` at duration; deterministic per (seed, offset); different seeds wobble differently but same trend; never zero across a full sweep; duration clamp.
- e2e (`count.spec.ts`, production, dedicated webinar `demo-count` with peak=100, ramp=1min): count visible and ≥1 at join; larger at ~40s than at ~15s; immediate reload shows the identical value (same 10s bucket); hidden when `show_attendee_count=false` (set via new dev endpoint flag, then restored).
