import { mulberry32 } from "@platform/timeline";

/** Fisher–Yates shuffle driven by a seeded PRNG. */
export function seededShuffle(indices: number[], seed: number): number[] {
  const a = [...indices];
  const rng = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * {{name}} token substitution (spec §6.3): the k-th occurrence of the token
 * maps to roster[perm[k]], where perm is a seeded shuffle — the "stable
 * index map" that pins each occurrence to one person for the whole session.
 * Literal names pass through untouched; an empty roster leaves tokens as-is.
 */
export function resolveNameTokens<T extends { displayName: string }>(
  lines: T[],
  roster: string[],
  seed: number,
): T[] {
  if (roster.length === 0) return lines;
  const perm = seededShuffle(
    roster.map((_, i) => i),
    seed,
  );
  let occurrence = 0;
  return lines.map((l) => {
    if (l.displayName !== "{{name}}") return l;
    const displayName = roster[perm[occurrence % perm.length]];
    occurrence++;
    return { ...l, displayName };
  });
}
