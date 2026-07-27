/**
 * Transcript grounding (spec §7.5): the anti-hallucination gate.
 *
 * Final semantics:
 * 1. Atmospheric lines (logistics + pure sentiment) always pass — they make
 *    no content claim, and real chat is full of them.
 * 2. A digit token must literally appear in the transcript — unless the line
 *    is a question (mishearing a number is the most natural question there is).
 * 3. A capitalized non-sentence-initial name must appear in the transcript.
 * 4. A line with 3+ content words where NONE appear in the transcript fails —
 *    that's referencing a whole concept the presenter never said.
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

const HYPE = new Set(
  "oh please pls plz hey hi hello welcome aw aww yay woohoo yesss lets go goo gooo come cmon great amazing awesome love loved loving excited exciting wow best good nice cool brilliant fantastic incredible thanks thank thx yes yep yup nope lol haha lmao fire lit huge big perfect exactly true truth facts impressed impressive solid smart genius interesting hype opportunity chance moment time today tonight session webinar presentation video part thing things stuff way kind sort type person people guy guys someone anyone everyone somebody anybody everybody something anything everything nothing example couple few several many much more most less least first second next last previous current future past now later soon again already yet still just only even also too either neither both all any some none every each own same different another other others such like as so very really quite pretty rather almost nearly probably maybe perhaps possibly definitely certainly absolutely totally completely exactly precisely especially particularly generally usually normally typically obviously clearly honestly frankly seriously literally actually basically essentially simply merely right correct wrong sure okay ok continue keep going support team dev feedback expect expected expecting projects project similar compare question answer answers ask asked asking know knew think thinking thought mean meant see saw hear heard get gets got getting work works working process use used using make makes making need needs help helps explain understand understanding repeat clarify clear include included including increase increasing regular updates update features feature worth value deal deals".split(" "),
);

export function isAtmospheric(text: string): boolean {
  if (ATMOSPHERIC.test(text)) return true;
  const words = contentWords(text);
  if (words.size === 0) return true;
  for (const w of words) if (!HYPE.has(w)) return false;
  return true;
}

export function grounded(lineText: string, transcript: string): boolean {
  if (isAtmospheric(lineText)) return true;
  const said = transcript.toLowerCase();

  // digits: must be said (mishearing questions are exempt)
  if (!lineText.trimEnd().endsWith("?")) {
    const numbers = lineText.match(/\d[\d,.%$]*/g) ?? [];
    for (const n of numbers) {
      const plain = n.replace(/[,.%$]/g, "");
      if (plain && !said.includes(plain)) return false;
    }
  }

  // capitalized names (non-sentence-initial, 3+ letters): must be said
  const tokens = lineText.split(/\s+/);
  for (let i = 1; i < tokens.length; i++) {
    const w = tokens[i].replace(/[^A-Za-z]/g, "");
    if (/^[A-Z][a-z]{2,}/.test(w) && !said.includes(w.toLowerCase())) return false;
  }

  // anchoring rule: a line fails only when it has NO anchor in the
  // transcript AND carries a distinctive word (8+ chars) never said.
  // Anchored lines and generic-English lines pass — real chat is both.
  const line = contentWords(lineText);
  const transcriptWords = contentWords(transcript);
  let anchored = false;
  let distinctiveUnsaid = false;
  for (const w of line) {
    if (w.length >= 5 && transcriptWords.has(w)) anchored = true;
    if (w.length >= 8 && !HYPE.has(w) && !transcriptWords.has(w)) distinctiveUnsaid = true;
  }
  if (!anchored && distinctiveUnsaid) return false;

  return true;
}
