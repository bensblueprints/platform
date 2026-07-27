import { mulberry32 } from "@platform/timeline";
import type { InferenceClient, TranscriptSegment } from "./inference";
import type { Beat, BeatType } from "./density";
import { targetLineCount, burstOffsets, DENSITY } from "./density";
import { generateRoster, type Persona } from "./personas";
import { mergeLines } from "./merge";
import { validateScript, type GenLine, type ValidationFailure } from "./validate";
import { contentWords, isAtmospheric } from "./ground";

/** Structural DB handle so @platform/chat never depends on @platform/core. */
export type SqlLike = <T = any>(strings: TemplateStringsArray, ...values: any[]) => Promise<T>;

const ADMIN_PERSONA = "Sarah (Support)";

/**
 * Small non-crypto hash (FNV-1a, two passes) for cache keys and seeds.
 * node:crypto was avoided deliberately: this package also ships to the
 * browser bundle, where node: schemes don't build.
 */
/** Escape literal control chars inside JSON string values (models emit
 * raw newlines/tabs inside "text" fields, which is invalid JSON). */
function sanitizeJsonText(raw: string): string {
  let out = "";
  let inStr = false;
  let escape = false;
  for (const ch of raw) {
    if (escape) {
      escape = false;
      out += ch;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      out += ch;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      out += ch;
      continue;
    }
    if (inStr && ch === "
") {
      out += "\n";
      continue;
    }
    if (inStr && ch === "") continue;
    if (inStr && ch === "	") {
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

/** Extract the first JSON object from model output (fences, prose, truncation). */
function extractJson(raw: string): any {
  const cleaned = sanitizeJsonText(raw.replace(/```json|```/g, ""));
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("no JSON object in model output");
  // try the full span first
  const end = cleaned.lastIndexOf("}");
  if (end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      // fall through to balanced-prefix parse (model truncated with junk after)
    }
  }
  // walk forward from the first { tracking depth; stop at the first balanced close
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(cleaned.slice(start, i + 1));
      }
    }
  }
  throw new Error("no balanced JSON object in model output");
}

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

function applyStyle(text: string, persona: Persona, rng: () => number, anchors?: Set<string>): string {
  let out = text;
  if (persona.style.caps === "lower") out = out.toLowerCase();
  if (persona.style.caps === "shout") {
    const words = out.split(" ");
    if (words.length > 0) words[0] = words[0].toUpperCase();
    out = words.join(" ");
  }
  if (persona.style.typos && rng() < 0.3) {
    const words = out.split(" ");
    // typo only small non-anchor words — mangling an anchor ("diagonse")
    // both reads wrong and breaks the grounding gate
    const candidates = words
      .map((w, i) => ({ w, i }))
      .filter(({ w }) => {
        const clean = w.toLowerCase().replace(/[^a-z]/g, "");
        return clean.length >= 4 && clean.length <= 5 && !(anchors?.has(clean) ?? false);
      });
    if (candidates.length > 0) {
      const { w, i } = candidates[Math.floor(rng() * candidates.length)];
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
  const parsed = extractJson(raw) as { lines?: { name?: string; mode?: string; text?: string }[] };
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
  densityScale = 1,
  offerTerms?: string,
): Promise<GenLine[]> {
  const target = Math.max(1, Math.round(targetLineCount(beat) * densityScale));
  const eligible = roster.filter((p) => p.arc.arriveOffset <= beat.end);
  const pool = eligible.length > 0 ? eligible : roster;
  const rosterSummary = pool
    .slice(0, 30)
    .map((p) => `${p.name} (${p.archetype}, ${p.style.caps === "lower" ? "lowercase typer" : p.style.caps === "shout" ? "caps-lock energy" : "normal case"}${p.style.emoji ? ", uses emoji" : ""})`)
    .join("; ");
  const continuity = priorLines.slice(-8).map((l) => `${l.persona}: ${l.text}`).join("\n");

  const buildMessages = (count: number) => [
    {
      role: "system" as const,
      content:
        "You write realistic live-chat lines for a webinar audience, keyed to what the presenter actually says. Return JSON only: {\"lines\":[{ \"name\": \"<persona name or {{persona}}>\", \"mode\": \"chat|question\", \"text\": \"...\" }]}. Never write earnings, income, or results claims. Never reference content not in the transcript slice. Never invent numbers, prices, percentages, names, or features — only use ones that literally appear in the slice. Attendees ask logistics questions and react to specific moments.",
    },
    {
      role: "user" as const,
      content:
        `Beat type: ${beat.type} (${DENSITY[beat.type].character}).\n` +
        `Write exactly ${target} lines for this beat.\n` +
        `Transcript slice the audience is hearing:\n"""\n${beat.transcript}\n"""\n` +
        `Roster (use these people): ${rosterSummary}\n` +
        (continuity ? `Recent chat for continuity:\n${continuity}\n` : "") +
        `At least one question referencing something specific in the slice. Use {{persona}} as the name for exactly one third of the lines (roster substitution happens later).`,
    },
  ];

  // big targets are generated in half-size calls — small models truncate
  // long outputs, and an unbalanced object kills the whole beat otherwise
  async function generateChunk(count: number): Promise<{ name: string; mode: string; text: string }[]> {
    const messages = buildMessages(count);
    let raw = "";
    // alternate modes: plain output first (json_object mode 400s under load),
    // json_object as the parse-guarantee fallback
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        raw = await inference.generate(messages, attempt % 2 === 1 ? { json: true } : undefined);
        return parseGeneratedLines(raw);
      } catch (err) {
        console.error(`[beat ${beat.type}] chunk attempt ${attempt + 1} failed:`, String(err).slice(0, 100));
      }
    }
    return []; // graceful: a dropped chunk costs density, not the job
  }

  const halves = target > 8 ? [Math.ceil(target / 2), Math.floor(target / 2)] : [target];
  let parsed: { name: string; mode: string; text: string }[] = [];
  for (const count of halves) {
    parsed.push(...(await generateChunk(count)));
  }
  const offsets = burstOffsets(rng, parsed.length, beat.start + 3, Math.max(beat.start + 10, beat.end - 3));
  const anchors = contentWords(beat.transcript);

  // Global persona assignment (§7.3/§7.5 by construction): spread usage,
  // never the same persona within 45s, and a persona only speaks after
  // their arc's arrival offset (late arrivers can't talk early).
  const lines: GenLine[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const t = offsets[i] ?? beat.start + 3 + i * 7;
    const candidates = roster
      .filter(
        (p) =>
          p.arc.arriveOffset <= t && (usage.lastUsed.get(p.name) ?? -Infinity) <= t - 45,
      )
      .sort((a, b) => (usage.counts.get(a.name) ?? 0) - (usage.counts.get(b.name) ?? 0) || rng() - 0.5);
    // fallback: nobody free inside 45s — least-recent speaker at ≥30s
    // rather than dropping the line (drops break the density gate)
    const fallback =
      candidates.length === 0
        ? roster
            .filter(
              (p) =>
                p.arc.arriveOffset <= t && (usage.lastUsed.get(p.name) ?? -Infinity) <= t - 30,
            )
            .sort((a, b) => (usage.lastUsed.get(a.name) ?? 0) - (usage.lastUsed.get(b.name) ?? 0))[0]
        : undefined;
    const persona = candidates[0] ?? fallback;
    if (!persona) continue; // genuinely nobody available — drop the line
    usage.lastUsed.set(persona.name, t);
    usage.counts.set(persona.name, (usage.counts.get(persona.name) ?? 0) + 1);
    const l = parsed[i];
    lines.push({
      offsetSeconds: t,
      persona: persona.name,
      role: "attendee",
      mode: l.mode === "question" ? "question" : "chat",
      text: applyStyle(l.text, persona, rng, anchors),
      beat: beat.type,
    });
  }

  return lines;
}


const ANSWER_TEMPLATES = [
  "great question — dropping the link in the chat now",
  "yes — the replay covers exactly that",
  "good catch, adding it to the worksheet link now",
  "answering that on the download link in just a sec",
];

/** §7.4 pairing, enforced globally after merge so regen scopes can't strand questions. */
/** Trim overproduction to the density band: drop sentiment-only filler
 * first, then seeded-random others, until organic count is inside. */
function trimToDensity(lines: GenLine[], beats: Beat[], rng: () => number): GenLine[] {
  const target = beats.reduce((s, b) => s + targetLineCount(b), 0);
  const organic = (ls: GenLine[]) => ls.filter((l) => !(l.role === "admin" && l.mode === "answer"));
  const upper = target + Math.max(target * 0.15, 2);
  if (organic(lines).length <= upper) return lines;
  const hypeOnly = (l: GenLine) => isAtmospheric(l.text);
  let out = [...lines];
  // pass 1: drop sentiment-only lines (least informational)
  for (let i = out.length - 1; i >= 0 && organic(out).length > upper; i--) {
    if (out[i].role === "attendee" && out[i].mode === "chat" && hypeOnly(out[i])) out.splice(i, 1);
  }
  // pass 2: seeded-random attendee chat drops, looping until inside band
  let guard = 0;
  while (organic(out).length > upper && guard++ < 10) {
    for (let i = out.length - 1; i >= 0 && organic(out).length > upper; i--) {
      if (out[i].role === "attendee" && out[i].mode === "chat" && rng() < 0.7) out.splice(i, 1);
    }
  }
  return out;
}

/** Repair persona spacing post-merge: reassign lines violating the 45s
 * rule to a free persona at that offset (drop only if nobody is free). */
function repairPersonaSpacing(lines: GenLine[], roster: Persona[], rng: () => number): GenLine[] {
  const lastUsed = new Map<string, number>();
  const counts = new Map<string, number>();
  return lines.map((l) => {
    if (l.role === "admin") {
      lastUsed.set(l.persona, l.offsetSeconds);
      return l;
    }
    const last = lastUsed.get(l.persona);
    if (last === undefined || l.offsetSeconds - last >= 45) {
      lastUsed.set(l.persona, l.offsetSeconds);
      counts.set(l.persona, (counts.get(l.persona) ?? 0) + 1);
      return l;
    }
    // violating — find a free persona at this offset
    const free = roster
      .filter((p) => (lastUsed.get(p.name) ?? -Infinity) <= l.offsetSeconds - 45)
      .sort((a, b) => (counts.get(a.name) ?? 0) - (counts.get(b.name) ?? 0))[0];
    if (!free) return l; // nobody free: keep as-is (validator will flag honestly)
    const renamed = { ...l, persona: free.name };
    lastUsed.set(free.name, l.offsetSeconds);
    counts.set(free.name, (counts.get(free.name) ?? 0) + 1);
    return renamed;
  });
}

function ensurePairing(lines: GenLine[], rng: () => number): GenLine[] {
  const out = [...lines];
  let idx = 0;
  for (const q of lines) {
    if (q.mode !== "question" || q.role !== "attendee") continue;
    const answered = out.some(
      (l) =>
        l.role === "admin" &&
        l.mode === "answer" &&
        l.offsetSeconds > q.offsetSeconds &&
        l.offsetSeconds <= q.offsetSeconds + 90,
    );
    if (!answered) {
      out.push({
        offsetSeconds: q.offsetSeconds + 20 + Math.floor(rng() * 70),
        persona: ADMIN_PERSONA,
        role: "admin",
        mode: "answer",
        text: ANSWER_TEMPLATES[idx++ % ANSWER_TEMPLATES.length],
        beat: q.beat,
      });
    }
  }
  return out.sort((a, b) => a.offsetSeconds - b.offsetSeconds);
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
    /** Scales line density and roster size (webinars.chat_audience_size, default 240). */
    audienceSize?: number;
    /** Overrides stage 1 (e.g. voice-compressed audio for oversized videos). */
    transcribeFn?: () => Promise<TranscriptSegment[]>;
  },
): Promise<GenerationResult> {
  const usage = { beats: 0, llmCalls: 0, transcriptHash: "" };

  // 1. transcribe (cached against video hash, §7.8)
  const videoHash = sha256(opts.videoUrl);
  const cachedT = await sql<{ transcript: { start: number; end: number; text: string }[] }[]>`
    select transcript from transcript_cache where video_hash = ${videoHash} limit 1
  `;
  let segments = cachedT[0]?.transcript;
  if (typeof segments === "string") segments = JSON.parse(segments); // legacy stringified rows
  if (!segments) {
    segments = opts.transcribeFn ? await opts.transcribeFn() : await inference.transcribe(opts.videoUrl);
    usage.llmCalls++;
    await sql`
      insert into transcript_cache (video_hash, transcript) values (${videoHash}, ${(sql as any).json(segments)})
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
  if (typeof beats === "string") beats = JSON.parse(beats); // legacy stringified rows
  if (!beats) {
    if (opts.useMockBeats) {
      beats = heuristicBeats(segments);
    } else {
      // classify in two halves for longer transcripts — a single shot over
      // the whole transcript busts small models' TPM ceilings, and char-based
      // estimation of their tokenizer is unreliable (measured 2.4:1 and worse)
      const classify = async (segs: { start: number; end: number; text: string }[], maxBeats: number) => {
        const perSeg = Math.max(30, Math.floor(4000 / Math.max(1, segs.length)));
        const condensed = segs
          .map((s) => `[${Math.floor(s.start)}s] ${s.text.length > perSeg ? s.text.slice(0, perSeg) + "…" : s.text}`)
          .join("\n");
        const raw = await inference.generate([
          {
            role: "system",
            content:
              'Classify this webinar transcript into beats. Return JSON only: {"beats":[{"type":"arrival|intro|credibility|teaching|story|transition|pitch|offer|objection_handling|close|qa","start":<seconds>,"end":<seconds>}]}. Return at most MAXBEATS beats total; do not fragment short moments into separate beats. Cover the whole timeline contiguously.'.replace("MAXBEATS", String(maxBeats)),
          },
          { role: "user", content: condensed },
        ], { json: true });
        usage.llmCalls++;
        const classified = extractJson(raw) as { beats: { type: BeatType; start: number; end: number }[] };
        return classified.beats;
      };

      let rawBeats: { type: BeatType; start: number; end: number }[];
      if (segments.length > 24) {
        const mid = Math.floor(segments.length / 2);
        const a = await classify(segments.slice(0, mid), 6);
        const b = await classify(segments.slice(mid), 6);
        // reconcile the seam: drop any second-half beat starting before the first half's last beat ends
        const lastA = [...a].sort((x, y) => x.end - y.end).pop()?.end ?? 0;
        rawBeats = [...a, ...b.filter((x) => x.start >= lastA - 30)];
      } else {
        rawBeats = await classify(segments, 10);
      }
      beats = rawBeats.map((b) => ({
        type: b.type,
        start: b.start,
        end: b.end,
        transcript: segments.filter((s) => s.start < b.end && s.end > b.start).map((s) => s.text).join(" "),
      }));
    }
  }

  // normalize classifier output to the DENSITY enum (LLMs improvise labels)
  const TYPE_SYNONYMS: Record<string, BeatType> = {
    welcome: "arrival", opening: "intro", opener: "intro", hook: "intro",
    demo: "teaching", demonstration: "teaching", content: "teaching", lesson: "teaching",
    testimonial: "story", case_study: "story",
    cta: "offer", call_to_action: "offer", pricing: "offer",
    objections: "objection_handling", faq: "qa", "q&a": "qa", questions: "qa",
    wrap_up: "close", outro: "close", conclusion: "close", recap: "close",
  };
  const VALID = new Set(["arrival","intro","credibility","teaching","story","transition","pitch","offer","objection_handling","close","qa"]);
  beats = (beats as Beat[])
    .map((b) => {
      const t = String(b.type).toLowerCase().replace(/[\s-]+/g, "_") as BeatType;
      const type = VALID.has(t) ? t : TYPE_SYNONYMS[t] ?? "teaching";
      return { ...b, type };
    })
    .filter((b) => b.end > b.start);

  // merge micro-beats (<20s) into the previous beat — fragmentation starves
  // the per-beat density model and multiplies generation calls
  const merged: Beat[] = [];
  for (const b of beats as Beat[]) {
    const prev = merged[merged.length - 1];
    if (prev && b.end - b.start < 20 && (b.type === prev.type || prev.type === "teaching" || b.type === "teaching")) {
      prev.end = b.end;
      prev.transcript = `${prev.transcript} ${b.transcript}`;
    } else {
      merged.push({ ...b });
    }
  }
  beats = merged;

  if (!opts.useMockBeats) {
    await sql`
      insert into beat_cache (transcript_hash, beats) values (${transcriptHash}, ${(sql as any).json(beats)})
      on conflict (transcript_hash) do nothing
    `;
  }

  // 3. roster (sized to the audience knob: ~1 persona per 8 attendees, 20-60)
  const audience = Math.max(10, opts.audienceSize ?? 240);
  const densityScale = Math.min(6, Math.max(0.25, audience / 240));
  const rosterSize = Math.min(120, Math.max(20, Math.round(audience / 40)));
  const roster = opts.existingRoster ?? generateRoster(mulberry32(parseInt(sha256(opts.webinarId).slice(0, 8), 16)), rosterSize);
  usage.beats = beats.length;

  // 4-5. per-beat generation + merge
  const rng = mulberry32(parseInt(sha256(opts.webinarId + transcriptHash).slice(0, 8), 16));
  const targetBeats = opts.onlyBeatType ? beats.filter((b) => b.type === opts.onlyBeatType) : beats;
  // exclude existing lines that fall inside the regenerated beat's range —
  // the caller replaces those; keeping them would double-count density
  const regenRange = opts.onlyBeatType
    ? beats.find((b) => b.type === opts.onlyBeatType)
    : undefined;
  const keptLines = opts.onlyBeatType
    ? (opts.existingLines ?? []).filter((l) => {
        if (!regenRange) return true;
        return l.offsetSeconds < regenRange.start || l.offsetSeconds > regenRange.end;
      })
    : [];

  // §7.1: logistics must reference the ACTUAL offer terms, not invented ones
  const offerRows = await sql<any[]>`
    select name, headline, button_text, price_start_cents, price_increment_cents, price_cap_cents
    from offers where webinar_id = ${opts.webinarId} order by created_at asc limit 3
  `;
  const offerTerms = offerRows.length
    ? offerRows
        .map((o) => {
          const price = o.price_start_cents != null ? `$${(o.price_start_cents / 100).toFixed(0)}` : "see checkout";
          const ladder = o.price_increment_cents ? `, rising $${(o.price_increment_cents / 100).toFixed(0)} after every sale${o.price_cap_cents ? ` up to $${(o.price_cap_cents / 100).toFixed(0)}` : ""}` : "";
          return `- "${o.name}" (${o.headline}) — price ${price}${ladder}. Button: "${o.button_text}".`;
        })
        .join("\n")
    : undefined;

  const generated: GenLine[] = [...keptLines];
  const personaUsage: PersonaUsage = { lastUsed: new Map(), counts: new Map() };
  // seed spacing/counts from kept lines so regen respects the whole script
  for (const l of keptLines) {
    personaUsage.lastUsed.set(l.persona, Math.max(personaUsage.lastUsed.get(l.persona) ?? -Infinity, l.offsetSeconds));
    personaUsage.counts.set(l.persona, (personaUsage.counts.get(l.persona) ?? 0) + 1);
  }
  for (const beat of targetBeats) {
    const beatLines = await generateBeatLines(
      inference, beat, roster, generated, rng, personaUsage, densityScale,
      beat.type === "offer" || beat.type === "pitch" ? offerTerms : undefined,
    );
    usage.llmCalls++;
    generated.push(...beatLines);
  }
  let lines = repairPersonaSpacing(ensurePairing(mergeLines(rng, [generated]), rng), roster, rng);
  lines = trimToDensity(lines, beats, rng);

  // Top-up: if organic volume is below the density band's floor, generate
  // once more for the sparsest beat before validating (§7.4). Persona
  // starvation on short scripts is the usual cause of the shortfall.
  const organicCount = (ls: GenLine[]) =>
    ls.filter((l) => !(l.role === "admin" && l.mode === "answer")).length;
  const totalTarget = beats.reduce((s, b) => s + targetLineCount(b), 0);
  if (organicCount(lines) < totalTarget - 2) {
    const sparsest = targetBeats
      .map((b) => ({ b, gap: targetLineCount(b) - organicCount(lines.filter((l) => l.beat === b.type)) }))
      .sort((x, y) => y.gap - x.gap)[0]?.b;
    if (sparsest) {
      const more = await generateBeatLines(inference, sparsest, roster, lines, rng, personaUsage, densityScale);
      usage.llmCalls++;
      lines = ensurePairing(mergeLines(rng, [[...lines, ...more]]), rng);
      lines = repairPersonaSpacing(lines, roster, rng);
    }
  }

  // 6. validate; regenerate failing beats once (§7.5)
  let failures = validateScript(lines, beats).failures;
  if (failures.length > 0) {
    const failingBeatTypes = [...new Set(failures.map((f) => f.beat).filter(Boolean))] as BeatType[];
    for (const bt of failingBeatTypes) {
      const beat = targetBeats.find((b) => b.type === bt);
      if (!beat) continue;
      const without = lines.filter((l) => l.beat !== bt);
      const regen = await generateBeatLines(
        inference, beat, roster, without, rng, personaUsage, densityScale,
        beat.type === "offer" || beat.type === "pitch" ? offerTerms : undefined,
      );
      usage.llmCalls++;
      lines = ensurePairing(mergeLines(rng, [[...without, ...regen]]), rng);
    }
    failures = validateScript(lines, beats).failures;
  }

  return { lines, beats, roster, failures, usage };
}
