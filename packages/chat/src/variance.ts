import { mulberry32 } from "@platform/timeline";

export interface VarianceLine {
  offsetSeconds: number;
  role: "admin" | "attendee";
  mode: "chat" | "question" | "answer" | "highlighted" | "tip";
}

/**
 * Per-session chat variance (spec §6.2), keyed on session.seed: seeded drop
 * of a fraction of attendee chat lines, then seeded offset jitter that
 * preserves relative ordering. Deterministic per seed — identical across
 * refreshes within a session, different between sessions.
 *
 * Only attendee role + mode "chat" lines are eligible to drop: never admin
 * lines, never questions, never answers — dropping a question would orphan
 * its answer and break the §7.4 pairing invariant.
 */
export function applySessionVariance<T extends VarianceLine>(
  lines: T[],
  opts: { seed: number; variancePct?: number | null; jitterSeconds?: number | null },
): T[] {
  const variancePct = opts.variancePct ?? 0.1;
  const jitterSeconds = opts.jitterSeconds ?? 3;
  const rng = mulberry32(opts.seed);

  const kept = lines.filter((l) => {
    const eligible = l.role === "attendee" && l.mode === "chat";
    return !eligible || rng() >= variancePct;
  });

  let prev = -Infinity;
  return kept.map((l) => {
    const delta = Math.round((rng() * 2 - 1) * jitterSeconds);
    const jittered = Math.max(0, l.offsetSeconds + delta);
    const offsetSeconds = Math.max(jittered, prev);
    prev = offsetSeconds;
    return { ...l, offsetSeconds };
  });
}
