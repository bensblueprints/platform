/** Persona roster (spec §7.3): recurring characters with arcs and typing styles. */

export const ARCHETYPE_MIX = {
  enthusiast: 0.3,
  skeptic: 0.15,
  confused: 0.2,
  technical: 0.1,
  logistics: 0.15,
  late: 0.1,
} as const;

export type Archetype = keyof typeof ARCHETYPE_MIX;

export interface Persona {
  name: string;
  location: string;
  archetype: Archetype;
  style: { caps: "normal" | "lower" | "shout"; emoji: number; typos: boolean };
  arc: { arriveOffset: number; windowSec: number; reappearAtOffer: boolean; oneShot: boolean };
}

const FIRST = [
  "Marcus", "Jess", "Tom", "Priya", "Dan", "Alisha", "Rob", "Nina", "Chris", "Fatima",
  "Greg", "Monica", "Sam", "Kelly", "Andre", "Becca", "Omar", "Tina", "Will", "Sofia",
  "Hank", "Dana", "Leo", "Rita", "Vince", "Carmen", "Joel", "Ayesha", "Brad", "Elena",
  "Miguel", "Sarah", "Dave", "Jen", "Alex", "Pat", "Morgan", "Casey", "Jamie", "Robin",
];
const LAST_INIT = "TRWKMBSLPDVCNJFGAEQZ".split("");
const US_LOCATIONS = [
  "Denver", "Austin", "Tampa", "Phoenix", "Nashville", "Columbus", "San Diego", "Charlotte",
  "Boise", "Raleigh", "Kansas City", "Fresno", "Atlanta", "Portland", "Cleveland", "Orlando",
  "Sacramento", "Pittsburgh", "Tucson", "Omaha", "Richmond", "Spokane", "Birmingham", "Tulsa",
];

function pickUniqueName(rng: () => number, used: Set<string>): string {
  for (let tries = 0; tries < 50; tries++) {
    const name = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST_INIT[Math.floor(rng() * LAST_INIT.length)]}.`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `Viewer ${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

export function generateRoster(rng: () => number, count: number, _geography = "US"): Persona[] {
  const archetypes: Archetype[] = [];
  for (const [arch, pct] of Object.entries(ARCHETYPE_MIX) as [Archetype, number][]) {
    for (let i = 0; i < Math.round(pct * count); i++) archetypes.push(arch);
  }
  while (archetypes.length < count) archetypes.push("enthusiast");
  // shuffle
  for (let i = archetypes.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [archetypes[i], archetypes[j]] = [archetypes[j], archetypes[i]];
  }

  const used = new Set<string>();
  return archetypes.slice(0, count).map((archetype) => {
    const capsRoll = rng();
    const caps = capsRoll < 0.7 ? "normal" : capsRoll < 0.9 ? "lower" : "shout";
    const emoji = rng() < 0.7 ? 0 : rng() < 0.85 ? 1 : 2;
    const late = archetype === "late";
    return {
      name: pickUniqueName(rng, used),
      location: US_LOCATIONS[Math.floor(rng() * US_LOCATIONS.length)],
      archetype,
      style: { caps, emoji, typos: rng() < 0.25 },
      arc: {
        // most personas are already in the room at 0:00 (real rooms fill
        // before start); some trickle in, ~10% are true late arrivers
        arriveOffset: late ? 600 + Math.floor(rng() * 1800) : rng() < 0.6 ? 0 : Math.floor(rng() * 300),
        windowSec: 600 + Math.floor(rng() * 3000),
        reappearAtOffer: rng() < 0.25,
        oneShot: rng() < 0.1,
      },
    };
  });
}

/** §7.3/§7.5: no persona may exceed capPct of total lines. */
export function personaCapViolations(lines: { persona: string }[], capPct = 0.08): string[] {
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l.persona, (counts.get(l.persona) ?? 0) + 1);
  const total = lines.length;
  return [...counts.entries()].filter(([, c]) => c / total > capPct).map(([p]) => p);
}
