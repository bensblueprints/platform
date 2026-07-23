/**
 * EverWebinar/WebinarJam-compatible chat CSV parser (spec §6.4).
 * Seven columns: Hour,Minute,Second,Name,Role,Message,Mode.
 * Error strings match EverWebinar's vocabulary deliberately.
 */

export type ChatRole = "admin" | "attendee";
export type ChatMode = "chat" | "question" | "answer" | "highlighted" | "tip";

export interface ParsedChatRow {
  offset_seconds: number;
  display_name: string;
  role: ChatRole;
  message: string;
  mode: ChatMode;
  sort_order: number;
  /** 1-based physical line number in the source file (header counts). */
  rowNumber: number;
}

export interface CsvRowError {
  row: number;
  reason: string;
}

export interface CsvParseResult {
  rows: ParsedChatRow[];
  errors: CsvRowError[];
}

const MAX_ROWS = 5000;

/** RFC4180 field splitter for a single physical line. Null on unterminated quote. */
function parseCsvLine(line: string): string[] | null {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }
    if (ch === '"' && cur.length === 0) {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      fields.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (inQuotes) return null;
  fields.push(cur);
  return fields;
}

function parseIntInRange(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

export function parseChatCsv(text: string): CsvParseResult {
  const rows: ParsedChatRow[] = [];
  const errors: CsvRowError[] = [];
  const lines = text.split(/\r\n|\r|\n/);

  let firstDataSeen = false;
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const rowNumber = idx + 1;
    if (line.trim() === "") continue;

    if (!firstDataSeen) {
      firstDataSeen = true;
      const probe = parseCsvLine(line);
      if (probe && probe[0].trim().toLowerCase() === "hour") continue; // header row
    }

    const fields = parseCsvLine(line);
    if (!fields || fields.length !== 7) {
      errors.push({ row: rowNumber, reason: "Row column count is not 7" });
      continue;
    }
    const [hRaw, mRaw, sRaw, nameRaw, roleRaw, messageRaw, modeRaw] = fields.map((f) => f.trim());

    const h = parseIntInRange(hRaw, 0, 7);
    if (h === null) {
      errors.push({ row: rowNumber, reason: "Hour is invalid" });
      continue;
    }
    const m = parseIntInRange(mRaw, 0, 59);
    if (m === null) {
      errors.push({ row: rowNumber, reason: "Minute is invalid" });
      continue;
    }
    const s = parseIntInRange(sRaw, 0, 59);
    if (s === null) {
      errors.push({ row: rowNumber, reason: "Second is invalid" });
      continue;
    }
    if (nameRaw.length === 0) {
      errors.push({ row: rowNumber, reason: "Name issue" });
      continue;
    }
    const role = roleRaw.toLowerCase();
    if (role !== "admin" && role !== "attendee") {
      errors.push({ row: rowNumber, reason: "Role is invalid" });
      continue;
    }
    if (messageRaw.length === 0) {
      errors.push({ row: rowNumber, reason: "Message is empty" });
      continue;
    }
    const mode = modeRaw.toLowerCase() as ChatMode;
    const attendeeModes: ChatMode[] = ["chat", "question", "answer"];
    const adminModes: ChatMode[] = [...attendeeModes, "highlighted", "tip"];
    const allowed = role === "admin" ? adminModes : attendeeModes;
    if (!allowed.includes(mode)) {
      errors.push({ row: rowNumber, reason: "Type is invalid" });
      continue;
    }

    rows.push({
      offset_seconds: h * 3600 + m * 60 + s,
      display_name: nameRaw,
      role,
      message: messageRaw,
      mode,
      sort_order: rows.length,
      rowNumber,
    });
  }

  if (rows.length > MAX_ROWS) {
    return {
      rows: [],
      errors: [{ row: 0, reason: "File exceeds the 5,000 rows per file limit" }],
    };
  }
  return { rows, errors };
}
