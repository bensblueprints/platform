import type { ParsedChatRow } from "./csv";

export interface LintWarning {
  row: number;
  reason: string;
}

export const FTC_PATTERNS = {
  currency: /(\$\s?\d[\d,]*(\.\d+)?|\b\d[\d,]*\s?(dollars|usd)\b|\b\d+(\.\d+)?k\s?(a|per)\s?(month|year|week)\b)/i,
  percentage: /\b\d+(\.\d+)?\s?%/,
  outcome:
    /\b(i|i've|i have|my)\b[^.!?]{0,60}\b(made|make|earned|earn|doubled|tripled|replaced|quit)\b[^.!?]{0,40}(money|income|job|profit|sales?|clients?|revenue|\$|\d+k\b)/i,
} as const;

const CURRENCY = FTC_PATTERNS.currency;
const PERCENTAGE = FTC_PATTERNS.percentage;
const OUTCOME = FTC_PATTERNS.outcome;

/**
 * FTC 16 CFR Part 465 lint for imported scripts (spec §12): attendee-role
 * lines must not carry results/earnings claims. Warning, never a block.
 */
export function lintAttendeeLines(rows: ParsedChatRow[]): LintWarning[] {
  const warnings: LintWarning[] = [];
  for (const r of rows) {
    if (r.role !== "attendee") continue;
    if (CURRENCY.test(r.message)) {
      warnings.push({ row: r.rowNumber, reason: "attendee line contains a currency amount (FTC 16 CFR 465)" });
      continue;
    }
    if (OUTCOME.test(r.message)) {
      warnings.push({ row: r.rowNumber, reason: "attendee line looks like a first-person outcome claim (FTC 16 CFR 465)" });
      continue;
    }
    if (PERCENTAGE.test(r.message)) {
      warnings.push({ row: r.rowNumber, reason: "attendee line contains a percentage gain (FTC 16 CFR 465)" });
    }
  }
  return warnings;
}
