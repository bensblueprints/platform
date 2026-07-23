/**
 * Transcript grounding (spec §7.5): the anti-hallucination gate. Cheap
 * token-overlap similarity (the spec's "cheap embedding pass" stand-in —
 * real embeddings need an endpoint we don't have keys for; documented in
 * the slice 9 design doc).
 */

const STOPWORDS = new Set(
  "a an the and or but if then else for to of in on at is are was were be been being i you he she it we they me him her us them my your his their our this that these those what which who whom when where why how did does do can could should would will just so not no yes as by with from about into over after before".split(" "),
);

export function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9%$]+/g) ?? [];
  return new Set(words.filter((w) => w.length >= 2 && !STOPWORDS.has(w)));
}

/** Containment of a in b. Vacuous truth for empty a. */
export function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 1;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / a.size;
}

const ATMOSPHERIC =
  /(replay|audio|sound|hear(ing)?|link|slide|email|pdf|download|worksheet|late|join(ing)?|hello|hi from|hi,? everyone|mic|camera|freeze|frozen|where.?s the)/i;

export function isAtmospheric(text: string): boolean {
  return ATMOSPHERIC.test(text);
}

/**
 * A line is grounded when it is atmospheric (logistics/greetings need no
 * anchor), too short to judge, shares a third of its content words with the
 * transcript, or anchors on any distinctive word (6+ chars) the presenter
 * actually said. The distinctive-word pass exists so genuine references
 * ("the diagnose part…") aren't killed by stopword-heavy phrasing.
 */
export function grounded(lineText: string, transcript: string): boolean {
  if (isAtmospheric(lineText)) return true;
  const line = contentWords(lineText);
  if (line.size < 3) return true;
  const transcriptWords = contentWords(transcript);
  if (overlapRatio(line, transcriptWords) >= 1 / 3) return true;
  for (const w of line) {
    if (w.length >= 6 && transcriptWords.has(w)) return true;
  }
  return false;
}
