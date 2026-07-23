import { mulberry32 } from "@platform/timeline";
import type { InferenceClient } from "./inference";
import type { Beat, BeatType } from "./density";
import { targetLineCount, burstOffsets, DENSITY } from "./density";
import { generateRoster, type Persona } from "./personas";
import { mergeLines } from "./merge";
import { validateScript, type GenLine, type ValidationFailure } from "./validate";

/** Structural DB handle so @platform/chat never depends on @platform/core. */
export type SqlLike = <T = any>(strings: TemplateStringsArray, ...values: any[]) => Promise<T>;

const ADMIN_PERSONA = "Sarah (Support)";

/**
 * Small non-crypto hash (FNV-1a, two passes) for cache keys and seeds.
 * node:crypto was avoided deliberately: this package also ships to the
 * browser bundle, where node: schemes don't build.
 */
function sha256(s: string): string {
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  };
  return fnv(0x811c9dc5) + fnv(0x01000193) + fnv(0xdeadbeef) + fnv(0x41c6ce57);
}

/** Fallback beat typing when the LLM isn't the one classifying (mock mode). */
const HEURISTIC_TYPES: BeatType[] = ["arrival", "intro", "teaching", "story", "pitch", "offer", "close"];

function heuristicBeats(segments: { start: number; end: number; text: string }[]): Beat[] {
  return segments.map((s, i) => ({
    type: HEURISTIC_TYPES[Math.min(i, HEURISTIC_TYPES.length - 1)],
    start: Math.floor(s.start),
    end: Math.ceil(s.end),
    transcript: s.text,
  }));
}

function applyStyle(text: string, persona: Persona, rng: () => number): string {
  let out = text;
  if (persona.style.caps === "lower") out = out.toLowerCase();
  if (persona.style.caps === "shout") {
    const words = out.split(" ");
    if (words.length > 0) words[0] = words[0].toUpperCase();
    out = words.join(" ");
  }
  if (persona.style.typos && rng() < 0.3) {
    const words = out.split(" ");
    const i = words.findIndex((w) => w.length > 4);
    if (i >= 0) {
      const w = words[i];
      const j = 1 + Math.floor(rng() * (w.length - 3));
      words[i] = w.slice(0, j) + w[j + 1] + w[j] + w.slice(j + 2);
      out = words.join(" ");
    }
  }
  const emojis = ["🔥", "🙌", "👏", "💯"];
  for (let e = 0; e < persona.style.emoji; e++) out += ` ${emojis[Math.floor(rng() * emojis.length)]}`;
  return out;
}

function parseGeneratedLines(raw: string): { name: string; mode: string; text: string }[] {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as { lines?: { name?: string; mode?: string; text?: string }[] };
  return (parsed.lines ?? [])
    .filter((l) => l.text && l.mode)
    .map((l) => ({ name: l.name ?? "{{persona}}", mode: l.mode!, text: l.text! }));
}

interface PersonaUsage {
  lastUsed: Map<string, number>;
  counts: Map<string, number>;
}

async function generateBeatLines(
  inference: InferenceClient,
  beat: Beat,
  roster: Persona[],
  priorLines: GenLine[],
  rng: () => number,
  usage: PersonaUsage,
): Promise<GenLine[]> {
  const target = targetLineCount(beat);
  const eligible = roster.filter((p) => p.arc.arriveOffset <= beat.end);
  const pool = eligible.length > 0 ? eligible : roster;
  const rosterSummary = pool
    .map((p) => `${p.name} (${p.archetype}, ${p.style.caps === "lower" ? "lowercase typer" : p.style.caps === "shout" ? "caps-lock energy" : "normal case"}${p.style.emoji ? ", uses emoji" : ""})`)
    .join("; ");
  const continuity = priorLines.slice(-8).map((l) => `${l.persona}: ${l.text}`).join("\n");

  const raw = await inference.generate(
    [
      {
        role: "system",
        content:
          "You write realistic live-chat lines for a webinar audience, keyed to what the presenter actually says. Return JSON only: {\"lines\":[{ \"name\": \"<persona name or {{persona}}>\", \"mode\": \"chat|question\", \"text\": \"...\" }]}. Never write earnings, income, or results claims. Never reference content not in the transcript slice. Attendees ask logistics questions and react to specific moments.",
      },
      {
        role: "user",
        content:
          `Beat type: ${beat.type} (${DENSITY[beat.type].character}).\n` +
          `Write exactly ${target} lines for this beat.\n` +
          `Transcript slice the audience is hearing:\n"""\n${beat.transcript}\n"""\n` +
          `Roster (use these people): ${rosterSummary}\n` +
          (continuity ? `Recent chat for continuity:\n${continuity}\n` : "") +
          `At least one question referencing something specific in the slice. Use {{persona}} as the name for exactly one third of the lines (roster substitution happens later).`,
      },
    ],
    { json: true },
  );

  const parsed = parseGeneratedLines(raw);
  const offsets = burstOffsets(rng, parsed.length, beat.start + 3, Math.max(beat.start + 10, beat.end - 3));

  // Global persona assignment (§7.3/§7.5 by construction): spread usage,
  // never the same persona within 45s anywhere in the script.
  const lines: GenLine[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const t = offsets[i] ?? beat.start + 3 + i * 7;
    const candidates = pool
      .filter((p) => (usage.lastUsed.get(p.name) ?? -Infinity) <= t - 45)
      .sort((a, b) => (usage.counts.get(a.name) ?? 0) - (usage.counts.get(b.name) ?? 0) || rng() - 0.5);
    const persona = candidates[0];
    if (!persona) continue; // nobody free at this offset — drop the line
    usage.lastUsed.set(persona.name, t);
    usage.counts.set(persona.name, (usage.counts.get(persona.name) ?? 0) + 1);
    const l = parsed[i];
    lines.push({
      offsetSeconds: t,
      persona: persona.name,
      role: "attendee",
      mode: l.mode === "question" ? "question" : "chat",
      text: applyStyle(l.text, persona, rng),
      beat: beat.type,
    });
  }

  // §7.4 pairing: every question gets an admin answer 20-90s later
  const answers: GenLine[] = [];
  for (const l of lines) {
    if (l.mode !== "question") continue;
    const hasAnswer = lines.some(
      (o) => o.role === "admin" && o.offsetSeconds > l.offsetSeconds && o.offsetSeconds <= l.offsetSeconds + 90,
    );
    if (!hasAnswer) {
      answers.push({
        offsetSeconds: l.offsetSeconds + 20 + Math.floor(rng() * 70),
        persona: ADMIN_PERSONA,
        role: "admin",
        mode: "answer",
        text: "great question — dropping the link in the chat now",
        beat: beat.type,
      });
    }
  }
  return [...lines, ...answers];
}

export interface GenerationResult {
  lines: GenLine[];
  beats: Beat[];
  roster: Persona[];
  failures: ValidationFailure[];
  usage: { beats: number; llmCalls: number; transcriptHash: string };
}

/**
 * The generator pipeline (spec §7.2). Transcription cached against the
 * video hash; beat detection cached against the transcript hash; per-beat
 * generation, merge, validate (§7.8).
 */
export async function runGenerationPipeline(
  sql: SqlLike,
  inference: InferenceClient,
  opts: {
    webinarId: string;
    videoUrl: string;
    durationSeconds: number;
    useMockBeats?: boolean;
    onlyBeatType?: BeatType;
    existingLines?: GenLine[];
    existingRoster?: Persona[];
  },
): Promise<GenerationResult> {
  const usage = { beats: 0, llmCalls: 0, transcriptHash: "" };

  // 1. transcribe (cached against video hash, §7.8)
  const videoHash = sha256(opts.videoUrl);
  const cachedT = await sql<{ transcript: { start: number; end: number; text: string }[] }[]>`
    select transcript from transcript_cache where video_hash = ${videoHash} limit 1
  `;
  let segments = cachedT[0]?.transcript;
  if (!segments) {
    segments = await inference.transcribe(opts.videoUrl);
    usage.llmCalls++;
    await sql`
      insert into transcript_cache (video_hash, transcript) values (${videoHash}, ${JSON.stringify(segments)}::jsonb)
      on conflict (video_hash) do nothing
    `;
  }

  // 2. beat detection (cached against transcript hash)
  const transcriptHash = sha256(JSON.stringify(segments));
  usage.transcriptHash = transcriptHash;
  const cachedB = await sql<{ beats: Beat[] }[]>`
    select beats from beat_cache where transcript_hash = ${transcriptHash} limit 1
  `;
  let beats = cachedB[0]?.beats;
  if (!beats) {
    if (opts.useMockBeats) {
      beats = heuristicBeats(segments);
    } else {
      const raw = await inference.generate([
        {
          role: "system",
          content:
            'Classify this webinar transcript into beats. Return JSON only: {"beats":[{"type":"arrival|intro|credibility|teaching|story|transition|pitch|offer|objection_handling|close|qa","start":<seconds>,"end":<seconds>}]}. Cover the whole timeline contiguously.',
        },
        { role: "user", content: segments.map((s) => `[${Math.floor(s.start)}s] ${s.text}`).join("\n") },
      ], { json: true });
      usage.llmCalls++;
      const classified = JSON.parse(raw.replace(/```json|```/g, "")) as { beats: { type: BeatType; start: number; end: number }[] };
      beats = classified.beats.map((b) => ({
        type: b.type,
        start: b.start,
        end: b.end,
        transcript: segments.filter((s) => s.start < b.end && s.end > b.start).map((s) => s.text).join(" "),
      }));
    }
    await sql`
      insert into beat_cache (transcript_hash, beats) values (${transcriptHash}, ${JSON.stringify(beats)}::jsonb)
      on conflict (transcript_hash) do nothing
    `;
  }

  // 3. roster
  const roster = opts.existingRoster ?? generateRoster(mulberry32(parseInt(sha256(opts.webinarId).slice(0, 8), 16)), 30);
  usage.beats = beats.length;

  // 4-5. per-beat generation + merge
  const rng = mulberry32(parseInt(sha256(opts.webinarId + transcriptHash).slice(0, 8), 16));
  const targetBeats = opts.onlyBeatType ? beats.filter((b) => b.type === opts.onlyBeatType) : beats;
  const keptLines = opts.onlyBeatType ? (opts.existingLines ?? []).filter((l) => l.beat !== opts.onlyBeatType) : [];

  const generated: GenLine[] = [...keptLines];
  const personaUsage: PersonaUsage = { lastUsed: new Map(), counts: new Map() };
  // seed spacing/counts from kept lines so regen respects the whole script
  for (const l of keptLines) {
    personaUsage.lastUsed.set(l.persona, Math.max(personaUsage.lastUsed.get(l.persona) ?? -Infinity, l.offsetSeconds));
    personaUsage.counts.set(l.persona, (personaUsage.counts.get(l.persona) ?? 0) + 1);
  }
  for (const beat of targetBeats) {
    const beatLines = await generateBeatLines(inference, beat, roster, generated, rng, personaUsage);
    usage.llmCalls++;
    generated.push(...beatLines);
  }
  let lines = mergeLines(rng, [generated]);

  // 6. validate; regenerate failing beats once (§7.5)
  let failures = validateScript(lines, beats).failures;
  if (failures.length > 0) {
    const failingBeatTypes = [...new Set(failures.map((f) => f.beat).filter(Boolean))] as BeatType[];
    for (const bt of failingBeatTypes) {
      const beat = targetBeats.find((b) => b.type === bt);
      if (!beat) continue;
      const without = lines.filter((l) => l.beat !== bt);
      const regen = await generateBeatLines(inference, beat, roster, without, rng, personaUsage);
      usage.llmCalls++;
      lines = mergeLines(rng, [[...without, ...regen]]);
    }
    failures = validateScript(lines, beats).failures;
  }

  return { lines, beats, roster, failures, usage };
}
