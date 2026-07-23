# Slice 9: Chat script generator (Phase 9)

**Date:** 2026-07-23
**Status:** Approved via standing go-ahead ("go and don't stop")
**Parent spec:** Evergreen Build Spec v2 — §7 (generator), §12 (compliance), §15 Phase 9 acceptance.

## The shape of it

BullMQ pipeline (7 stages per §7.2) behind `packages/chat/generator/`, inference via an OpenAI-compatible client (`packages/chat/inference/`) — baseURL-selectable: hosted API for production, local rig for dev (§7.2). This is the differentiating module; the bar is the Phase 9 acceptance verbatim.

## Pipeline stages (BullMQ job per generation, one worker chain)

1. **Transcribe.** Whisper against the video, segment-level timestamps. **Cache against video hash** (`transcript_cache` table keyed by sha256 of video_url+size or R2 etag) — regeneration never re-transcribes (§7.8).
2. **Beat detection.** One LLM call classifying the transcript into typed segments with start/end offsets (`arrival|intro|credibility|teaching|story|transition|pitch|offer|objection_handling|close|qa`). **Cache against transcript hash.**
3. **Roster generation.** 20–40 personas (name, location, archetype with §7.3 proportions, typing style, arc) → `name_roster` rows + `persona` JSON. Cap: no persona > 8% of lines.
4. **Per-beat generation.** One call per beat: beat transcript slice + type + density target (§7.4 table) + roster + already-generated lines for continuity. Never one call for the whole webinar.
5. **Merge.** Sort, jitter, dedupe near-identicals, enforce persona spacing.
6. **Validate** (§7.5 — hard gates): persona spacing ≥45s; persona ≤8% lines; every `question` has an `answer` within 90s; total lines within density target ±15%; FTC lint on attendee lines (currency, % gains, first-person outcome — hard block); **transcript-grounding** — each line's content words must overlap its beat's transcript slice above a threshold (cheap TF-IDF/token-overlap similarity — the spec's "cheap embedding similarity pass"; real embeddings would need an embeddings endpoint we don't have keys for — token-overlap similarity is the honest cheap version, documented). Failed beat → regenerate that beat only, once; then surface the failure.
7. **Emit.** Write `chat_scripts` rows (marked `generated` via a new `source` column) + CSV download in the 7-column schema.

## Data (migration 0010)

- `transcript_cache(video_hash pk, transcript jsonb, created_at)`
- `beat_cache(transcript_hash pk, beats jsonb, created_at)`
- `name_roster` + `persona jsonb` column
- `chat_scripts` + `source text default 'imported'` ('generated'|'imported'|'reconstructed'|'hand')
- `generation_jobs(id, webinar_id, status, stage, error, usage jsonb, created_at, updated_at)` — drives the editor + §7.8 usage_records intent (meters generation minutes from day one)

## Editor (§7.7) — scoped to v1-honest

Generation output is a draft, never auto-published: scripts land with `status='draft'` (new column) and publish swaps them live. Editor at `/admin/scripts/[webinar]`:

- Timeline: chat lines plotted against a video scrubber; beat bands labeled
- Inline edit any line; drag to retime (input box); reassign persona (dropdown)
- Density heatmap strip (CSS gradient from per-minute counts)
- Regenerate: whole script / one beat / one line (buttons)
- Diff view vs previous generation (simple two-column diff of changed lines)
- Publish button (draft → live swap in a transaction)

Beat-boundary editing + per-beat regenerate: beat type editable; regenerating one beat re-runs stage 4 for that beat with the corrected type — the most common action, one click (§7.7).

## Inference adapter

```ts
interface InferenceClient {
  transcribe(videoUrl: string): Promise<TranscriptSegment[]>;   // segments with start/end/text
  generate(messages: ChatMessage[], opts?: {json?: boolean}): Promise<string>;
}
```
Env: `INFERENCE_BASE_URL`, `INFERENCE_API_KEY`, `INFERENCE_MODEL` (default gpt-4o-mini-class), `TRANSCRIBE_MODEL` (whisper-1). OpenAI-compatible `/v1/audio/transcriptions` + `/v1/chat/completions` via fetch. Keys pending from user — pipeline ships with a `mock` mode (deterministic fixture transcript + templated lines) so the whole chain, validation gates, and editor are e2e-verifiable without keys; real-API acceptance runs when keys land (same flag flip as Stripe).

## Verification (spec §15 Phase 9 — the real bar)

- vitest: density targets per beat type, clustering (bursts 2–4 with gaps), question/answer pairing enforcement, persona caps + spacing, FTC hard-block, grounding similarity threshold, merge dedupe, per-beat regen isolation (other beats' hand edits untouched).
- e2e with mock inference: generate against the demo video → script lands as draft; ≥3 lines reference mock-transcript content; every question answered ≤90s; no persona >8%; zero attendee earnings claims; publish → appears in room payload; regenerate one beat preserves a hand edit in another beat; CSV download parses with our own parser (round-trip).
- With real keys (when provided): the actual 45-min-video acceptance from §15.

## Cost controls (§7.8)

Transcript + beat caches as above; per-beat regen touches one beat; `generation_jobs.usage` records tokens/minutes per run from day one; a per-tenant daily generation cap constant (default 10, env-tunable) enforced in the enqueue path.
