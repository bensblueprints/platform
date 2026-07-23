/** Density model keyed to beat type (spec §7.4), with bursty clustering. */

export type BeatType =
  | "arrival" | "intro" | "credibility" | "teaching" | "story" | "transition"
  | "pitch" | "offer" | "objection_handling" | "close" | "qa";

export interface Beat {
  type: BeatType;
  start: number; // seconds
  end: number;
  transcript: string;
}

export const DENSITY: Record<BeatType, { minPerMin: number; maxPerMin: number; character: string }> = {
  arrival: { minPerMin: 5, maxPerMin: 7, character: "Greetings, cities, audio checks" },
  intro: { minPerMin: 2, maxPerMin: 3, character: "Settling, anticipation" },
  credibility: { minPerMin: 1, maxPerMin: 2, character: "Light acknowledgement" },
  teaching: { minPerMin: 1, maxPerMin: 3, character: "Clustered after a point lands" },
  story: { minPerMin: 0.5, maxPerMin: 1.5, character: "Sparse, then a cluster at the payoff" },
  transition: { minPerMin: 2, maxPerMin: 3, character: "Where do we get this, anticipation" },
  pitch: { minPerMin: 3, maxPerMin: 4, character: "Rising, pricing curiosity" },
  offer: { minPerMin: 4, maxPerMin: 6, character: "Peak. Logistics only" },
  objection_handling: { minPerMin: 2, maxPerMin: 3, character: "Pushback and reassurance" },
  close: { minPerMin: 2, maxPerMin: 3, character: "Thanks, replay questions" },
  qa: { minPerMin: 2, maxPerMin: 3, character: "Questions and answers" },
};

export function targetLineCount(beat: Pick<Beat, "type" | "start" | "end">): number {
  const minutes = Math.max(0.5, (beat.end - beat.start) / 60);
  const d = DENSITY[beat.type];
  return Math.round(minutes * (d.minPerMin + d.maxPerMin) / 2);
}

export function densityBandOk(actual: number, target: number): boolean {
  // ±15% with a ±2 floor for small targets — the gate must not flake at
  // tiny line counts (mock/short scripts); at real scale (target ~100+)
  // the 15% rule dominates unchanged.
  return Math.abs(actual - target) <= Math.max(target * 0.15, 2);
}

/**
 * Clustering rule (§7.4): lines grouped into bursts of 2-4 with real gaps
 * between, never evenly spaced. Deterministic under the caller's rng.
 */
export function burstOffsets(rng: () => number, count: number, start: number, end: number): number[] {
  if (count <= 0) return [];
  // split into burst sizes 2-4, adjusting so no size-1 burst remains
  const sizes: number[] = [];
  let left = count;
  while (left > 0) {
    let s = 2 + Math.floor(rng() * 3); // 2-4
    if (left - s === 1) s = left >= 4 ? s : left; // avoid trailing singleton
    if (s > left) s = left;
    sizes.push(s);
    left -= s;
  }
  if (sizes.length > 1 && sizes[sizes.length - 1] === 1) {
    // merge the singleton: shrink the previous burst if it was 4, else append
    if (sizes[sizes.length - 2] === 4) {
      sizes[sizes.length - 2] = 3;
      sizes[sizes.length - 1] = 2;
    } else {
      sizes[sizes.length - 2] += 1;
      sizes.pop();
    }
  }

  const offsets: number[] = [];
  const within = () => 5 + Math.floor(rng() * 16); // 5-20s inside a burst
  const between = () => 35 + Math.floor(rng() * 36); // 35-70s between bursts

  let cursor = start + Math.floor(rng() * 10);
  for (let bi = 0; bi < sizes.length; bi++) {
    for (let li = 0; li < sizes[bi]; li++) {
      offsets.push(Math.min(cursor, end));
      cursor += within();
    }
    cursor += between();
  }

  // compress from the right if we overflowed the window, keeping gaps > 30
  if (offsets.length && offsets[offsets.length - 1] > end) {
    const overflow = offsets[offsets.length - 1] - end;
    for (let i = offsets.length - 1; i >= 0; i--) offsets[i] -= overflow;
    if (offsets[0] < start) {
      const shift = start - offsets[0];
      for (let i = 0; i < offsets.length; i++) offsets[i] += shift;
    }
  }
  return offsets;
}
