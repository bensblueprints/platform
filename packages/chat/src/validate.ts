import type { Beat, BeatType } from "./density";
import { targetLineCount, densityBandOk } from "./density";
import { grounded } from "./ground";
import { FTC_PATTERNS } from "./lint";
import { personaCapViolations } from "./personas";

export interface GenLine {
  offsetSeconds: number;
  persona: string;
  role: "admin" | "attendee";
  mode: "chat" | "question" | "answer" | "highlighted" | "tip";
  text: string;
  beat: BeatType;
  /** Human editor override — exempt from grounding/FTC gates (spec §7.7). */
  hand?: boolean;
}

export interface ValidationFailure {
  rule: "persona_spacing" | "persona_cap" | "question_pairing" | "density" | "ftc" | "grounding";
  detail: string;
  beat?: BeatType;
}

/**
 * Validation gates (spec §7.5). The job fails and regenerates the offending
 * beat when any of these break.
 */
export function validateScript(
  lines: GenLine[],
  beats: Beat[],
  opts?: { skipDensity?: boolean },
): { ok: boolean; failures: ValidationFailure[] } {
  const failures: ValidationFailure[] = [];

  // persona spacing: no two lines from the same audience persona within
  // 45s. Admin-role lines are exempt — the host/moderator answers rapidly
  // by nature, and §7.3's personas are the audience characters.
  const byPersona = new Map<string, number[]>();
  for (const l of lines) {
    if (l.role === "admin") continue;
    const arr = byPersona.get(l.persona) ?? [];
    arr.push(l.offsetSeconds);
    byPersona.set(l.persona, arr);
  }
  for (const [persona, offsets] of byPersona) {
    offsets.sort((a, b) => a - b);
    for (let i = 1; i < offsets.length; i++) {
      if (offsets[i] - offsets[i - 1] < 45) {
        failures.push({ rule: "persona_spacing", detail: `${persona} twice within 45s` });
        break;
      }
    }
  }

  // persona cap: 8% of total lines, audience personas only (§7.3 personas
  // are the audience characters). Only meaningful at script scale —
  // below 25 lines any repeat persona trivially exceeds 8%.
  if (lines.length >= 25) {
    const audience = lines.filter((l) => l.role !== "admin");
    for (const p of personaCapViolations(audience, 0.08)) {
      failures.push({ rule: "persona_cap", detail: `${p} exceeds 8% of audience lines` });
    }
  }

  // question pairing: every attendee question answered by admin within 90s
  for (const q of lines) {
    if (q.mode !== "question" || q.role !== "attendee") continue;
    const answered = lines.some(
      (l) =>
        l.role === "admin" &&
        l.mode === "answer" &&
        l.offsetSeconds > q.offsetSeconds &&
        l.offsetSeconds <= q.offsetSeconds + 90,
    );
    if (!answered) {
      failures.push({ rule: "question_pairing", detail: `question at ${q.offsetSeconds}s unanswered within 90s`, beat: q.beat });
    }
  }

  // density: total lines within ±15% of the summed targets
  if (!opts?.skipDensity && beats.length > 0) {
    const target = beats.reduce((sum, b) => sum + targetLineCount(b), 0);
    // admin answers are added mechanically by question pairing; the density
    // target describes audience/organic volume (§7.4)
    const counted = lines.filter((l) => !(l.role === "admin" && l.mode === "answer")).length;
    if (!densityBandOk(counted, target)) {
      failures.push({ rule: "density", detail: `${counted} lines vs target ${target} (±15%)` });
    }
  }

  // FTC (§12 + the spec's own acceptance bar): the hard block targets
  // earnings/results claims by attendees ("I made $X with this"). Bare
  // price/percentage mentions ("is it $20 one time?", "did he say 40%?")
  // are pricing curiosity, which the spec's density table expects in pitch
  // and offer beats — they are not claims.
  for (const l of lines) {
    if (l.role !== "attendee" || l.hand) continue;
    if (FTC_PATTERNS.outcome.test(l.text)) {
      failures.push({ rule: "ftc", detail: `attendee claim: "${l.text.slice(0, 60)}"`, beat: l.beat });
    }
  }

  // grounding: no references to things the presenter never said. Scope is
  // everything said UP TO the line's offset — attendees naturally reference
  // earlier content ("the app from before"), which is fine and real.
  const sortedBeats = [...beats].sort((a, b) => a.start - b.start);
  const priorTranscript = (offset: number) =>
    sortedBeats
      .filter((b) => b.start <= offset)
      .map((b) => b.transcript)
      .join(" ");
  for (const l of lines) {
    if (l.hand) continue; // human override: not generated, not re-judged
    const transcript = priorTranscript(l.offsetSeconds);
    if (l.mode === "question") {
      // generic questions are natural chat; only invented specifics count as
      // hallucination: numbers the presenter never said, or capitalized names
      // that don't appear in the transcript
      const saidWords = new Set(transcript.match(/[A-Za-z]{3,}/g) ?? []);
      const inventedNumber = /\d/.test(l.text) && !grounded(l.text, transcript);
      const inventedName = (l.text.match(/\b[A-Z][a-z]{3,}\b/g) ?? []).some(
        (t) => !saidWords.has(t) && l.text.indexOf(t) > 0,
      );
      if (inventedNumber || inventedName) {
        failures.push({ rule: "grounding", detail: `ungounded question: "${l.text.slice(0, 60)}"`, beat: l.beat });
      }
      continue;
    }
    if (!grounded(l.text, transcript)) {
      failures.push({ rule: "grounding", detail: `ungounded line: "${l.text.slice(0, 60)}"`, beat: l.beat });
    }
  }

  return { ok: failures.length === 0, failures };
}
