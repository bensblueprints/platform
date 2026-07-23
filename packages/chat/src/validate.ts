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

  // FTC (§12): attendee-role lines must not carry results/earnings claims
  for (const l of lines) {
    if (l.role !== "attendee") continue;
    if (FTC_PATTERNS.currency.test(l.text) || FTC_PATTERNS.outcome.test(l.text)) {
      failures.push({ rule: "ftc", detail: `attendee claim: "${l.text.slice(0, 60)}"`, beat: l.beat });
    } else if (FTC_PATTERNS.percentage.test(l.text) && FTC_PATTERNS.outcome.test(l.text)) {
      failures.push({ rule: "ftc", detail: `attendee gain claim: "${l.text.slice(0, 60)}"`, beat: l.beat });
    }
  }

  // grounding: no references to things the presenter never said
  const beatByType = new Map(beats.map((b) => [b.type, b]));
  for (const l of lines) {
    const beat = beatByType.get(l.beat);
    const transcript = beat?.transcript ?? beats.map((b) => b.transcript).join(" ");
    if (!grounded(l.text, transcript)) {
      failures.push({ rule: "grounding", detail: `ungounded line: "${l.text.slice(0, 60)}"`, beat: l.beat });
    }
  }

  return { ok: failures.length === 0, failures };
}
