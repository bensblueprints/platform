# Slice 3: Per-session variance + name roster (Phase 3)

**Date:** 2026-07-23
**Status:** Approved via standing go-ahead ("go and don't stop")
**Parent spec:** Evergreen Build Spec v2 — §5 (`name_roster`, `chat_variance_pct`, `chat_jitter_seconds`, `session.seed`), §6.2 (variance), §6.3 (roster substitution), §7.4 (question/answer pairing invariant), §15 Phase 3 acceptance.

## Scope

Two sessions of the same webinar show differently-named, slightly different chat; one session is byte-identical across refreshes. Server-side, deterministic, keyed on `session.seed`.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where variance applies | In `getRoomPayload`, after loading the raw script, before returning the payload | Deterministic per session; refresh replays the same transform; zero client complexity |
| Which lines can drop | Attendee-role, mode `chat` only — never admin, never `question`, never `answer` | Spec §6.2 bars dropping admin and answering lines; also dropping a `question` would orphan its `answer` and break the §7.4 pairing invariant. Stricter than the spec's letter ("drop a random % of attendee-role lines") and the only reading consistent with both sections. Documented here deliberately |
| Drop mechanics | Seeded PRNG (`mulberry32(session.seed)`), drop each eligible line when `rng() < variancePct` (default 0.10) | Stable per session, different across sessions |
| Jitter mechanics | Each remaining line: `offset += round((rng()*2-1) * jitterSeconds)` (default ±3s), then walk left-to-right clamping `offset_i = max(offset_i, prev)` to preserve relative ordering (§6.2) | Jitter never reorders |
| `{{name}}` semantics | K-th occurrence of the `{{name}}` token maps to `roster[perm[k]]`, `perm` = seeded shuffle of roster indices (`mulberry32(session.seed)`), k wraps modulo roster size | §6.3 "stable index map": same occurrence → same person within a session; one script file → differently-named audience per session. Literal names untouched |
| Roster source | `name_roster` table (spec §5 verbatim) + RLS; demo roster seeded via `/api/dev/seed-roster` (30 names) | Persisted per webinar as §7.3 expects later |
| Seed floor | If `chat_variance_pct`/`chat_jitter_seconds` null → defaults 0.10 / 3 (matches table defaults) | Null-safe |

## Transform order (fixed)

1. Drop eligible lines (seeded).
2. Jitter remaining offsets (seeded, order-preserving).
3. Substitute `{{name}}` occurrences (seeded) — after drop, so occurrence indexing is over the lines viewers actually see. (Occurrence k is the k-th *surviving* token; deterministic because drop is deterministic.)

## Verification

- vitest `variance`: determinism per seed; two seeds differ; admin/question/answer never dropped; drop rate ≈ variancePct ± tolerance over 1,000 lines; jitter within ±jitterSeconds; ordering preserved; variancePct 0 drops nothing.
- vitest `roster`: literal names untouched; same seed → same mapping; occurrence k stable; different seeds → different mapping (probabilistically over 30-name roster); wrap when occurrences > roster size; empty roster leaves tokens as-is (renders `{{name}}` literally — visible failure is better than a crash, and Phase 7's generator always supplies a roster).
- e2e (`variance.spec.ts`, production): two tokens → payloads differ (names and/or dropped lines); same token fetched twice → identical chat arrays; browser never renders the literal `{{name}}` when a roster exists.
