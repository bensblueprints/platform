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

// content-free sentiment ("this is amazing!", "love it 🔥") — real chat is
// full of these; they make no transcript claim so grounding can't fail them
const HYPE = new Set([
  "great", "amazing", "awesome", "love", "loved", "loving", "excited", "exciting",
  "wow", "best", "good", "nice", "cool", "brilliant", "fantastic", "incredible",
  "thanks", "thank", "thx", "yes", "yep", "yup", "nope", "lol", "haha", "lmao",
  "fire", "lit", "huge", "big", "perfect", "exactly", "true", "truth", "facts",
  "impressed", "impressive", "solid", "smart", "genius", "interesting", "hype",
]);
const SENTIMENT_FILLER = new Set([
  "this", "that", "these", "those", "such", "really", "very", "super", "totally",
  "absolutely", "definitely", "honestly", "literally", "actually", "just", "also",
  "here", "there", "thing", "things", "stuff", "something", "anything", "everything",
  "everyone", "everybody", "guys", "people", "folks", "man", "bro", "dude",
  "watching", "listening", "looking", "forward", "cant", "cant", "cannot", "wait",
  "ready", "hyped", "pumped", "stoked", "glad", "happy", "sure", "okay", "ok", "continue", "keep", "going", "support", "team", "dev", "feedback", "expect", "expected", "expecting", "projects", "project", "similar", "compare", "other", "others", "question", "answer", "answers", "ask", "asked", "asking", "know", "knew", "think", "thinking", "thought", "mean", "meant", "see", "saw", "hear", "heard", "get", "gets", "got", "getting", "work", "works", "working", "process", "use", "used", "using", "make", "makes", "making", "need", "needs", "help", "helps", "explain", "understand", "understanding", "repeat", "clarify", "clear", "include", "included", "including", "increase", "increasing", "regular", "updates", "update", "features", "feature", "invoices",
  "omg", "oh", "wow", "woah", "ay", "ayyy", "yess", "yessir", "lets", "let",
  "go", "goo", "gogo", "come", "cmon", "please", "plz", "pls", "appreciate",
  "much", "needed", "need", "wanted", "want", "like", "likes", "dis",
]);

export function isAtmospheric(text: string): boolean {
  if (ATMOSPHERIC.test(text)) return true;
  // sentiment-only: every content word is hype or filler (nothing referenced)
  const words = contentWords(text);
  if (words.size === 0) return true;
  for (const w of words) {
    if (!HYPE.has(w) && !SENTIMENT_FILLER.has(w)) return false;
  }
  return true;
}

/**
 * A line is grounded when it is atmospheric (logistics/greetings need no
 * anchor), too short to judge, anchors on any content word (5+ chars) the
 * presenter actually said, or shares a third of its content words with the
 * transcript (backstop for short-worded lines).
 */
export function grounded(lineText: string, transcript: string): boolean {
  if (isAtmospheric(lineText)) return true;
  const line = contentWords(lineText);
  if (line.size < 3) return true;
  const transcriptWords = contentWords(transcript);
  for (const w of line) {
    if (w.length >= 5 && transcriptWords.has(w)) return true;
  }
  return overlapRatio(line, transcriptWords) >= 1 / 3;
}
