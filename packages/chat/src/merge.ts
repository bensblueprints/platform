/** Merge stage (spec §7.2.5): flatten, jitter, dedupe near-identicals. */

interface MergeLine {
  offsetSeconds: number;
  persona: string;
  text: string;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function mergeLines<T extends MergeLine>(rng: () => number, beats: T[][], jitterSeconds = 3): T[] {
  const flat = beats.flat().sort((a, b) => a.offsetSeconds - b.offsetSeconds);

  // order-preserving jitter (same clamp walk as session variance)
  let prev = -Infinity;
  const jittered = flat.map((l) => {
    const delta = Math.round((rng() * 2 - 1) * jitterSeconds);
    const offsetSeconds = Math.max(0, Math.max(l.offsetSeconds + delta, prev));
    prev = offsetSeconds;
    return { ...l, offsetSeconds };
  });

  // dedupe near-identical text within a 60s window, keep the first
  const out: T[] = [];
  for (const l of jittered) {
    const dup = out.some(
      (o) => normalize(o.text) === normalize(l.text) && l.offsetSeconds - o.offsetSeconds < 60,
    );
    if (!dup) out.push(l);
  }
  return out;
}
