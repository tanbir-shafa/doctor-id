/**
 * Parse a Bangladeshi doctor's display string into prefix + first + last.
 *
 * Inputs typically come from third-party directories with arbitrary
 * punctuation:
 *   "Prof. Dr. M. Nazrul Islam"
 *   "Dr. Karim Rahman"
 *   "Asst. Prof. Dr. Sadia Akter"
 *   "Brig. Gen. (Retd.) Dr. Anwarul Haque"
 *   "Major (Retd.) Dr. Saleh Ahmed"
 *
 * Returns `null` when no recognizable name remains after stripping the
 * prefix (e.g. an empty string). The `prefix` field matches the
 * `NameSchema.prefix` enum on the Doctor model; anything more exotic is
 * collapsed to `"Dr."` and the extra title is dropped (we do not invent
 * new enum values from data — the model owner picks the enum).
 *
 * The Doctor schema's NameSchema enum is:
 *   ["Dr.", "Prof. Dr.", "Asst. Prof. Dr.", "Assoc. Prof. Dr."]
 */

type Prefix = "Dr." | "Prof. Dr." | "Asst. Prof. Dr." | "Assoc. Prof. Dr.";

export interface ParsedName {
  prefix: Prefix;
  first: string;
  last: string;
  displayName: string;
}

// Patterns are anchored and ordered most-specific first. Each captures the
// remainder of the name after the prefix.
const PATTERNS: Array<{ re: RegExp; prefix: Prefix }> = [
  { re: /^(?:Asst\.?|Assistant)\s+Prof(?:essor)?\.?\s+Dr\.?\s+(.+)$/i, prefix: "Asst. Prof. Dr." },
  { re: /^(?:Assoc\.?|Associate)\s+Prof(?:essor)?\.?\s+Dr\.?\s+(.+)$/i, prefix: "Assoc. Prof. Dr." },
  { re: /^Prof(?:essor)?\.?\s+Dr\.?\s+(.+)$/i, prefix: "Prof. Dr." },
  { re: /^Dr\.?\s+(.+)$/i, prefix: "Dr." },
];

// Military / honorific titles we strip but don't map to a prefix enum.
const STRIP_PREFIX_TOKENS = [
  /^Brig\.?\s+Gen\.?\s+(?:\(Retd\.?\)\s+)?/i,
  /^Maj(?:or)?\.?\s+(?:Gen\.?\s+)?(?:\(Retd\.?\)\s+)?/i,
  /^Lt\.?\s+Col\.?\s+(?:\(Retd\.?\)\s+)?/i,
  /^Col(?:onel)?\.?\s+(?:\(Retd\.?\)\s+)?/i,
  /^Capt(?:ain)?\.?\s+(?:\(Retd\.?\)\s+)?/i,
];

export function parseDoctorName(raw: unknown): ParsedName | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().replace(/\s+/g, " ");
  if (!s) return null;

  // Some upstream rows omit the space between honorific tokens, e.g.
  // "Dr.M.A.Sayem" or "Asst.Prof.Dr.Rooh-E-Zakaria". Insert a space after
  // a `.` followed by a letter so the prefix patterns below can match.
  s = s.replace(/\.(?=[A-Za-z])/g, ". ").replace(/\s+/g, " ").trim();

  // Strip military titles before applying the prefix match. They're not
  // captured in the schema enum; the doctor still gets `Prof. Dr.` or `Dr.`
  // as appropriate.
  for (const re of STRIP_PREFIX_TOKENS) {
    s = s.replace(re, "");
  }
  s = s.trim();
  if (!s) return null;

  let prefix: Prefix = "Dr.";
  let remainder = s;
  for (const { re, prefix: p } of PATTERNS) {
    const m = s.match(re);
    if (m) {
      prefix = p;
      remainder = m[1].trim();
      break;
    }
  }
  if (!remainder) return null;

  // Some source rows duplicate the honorific in the remainder, e.g.
  // "Asst. Prof. Dr. Dr. Md. Asaduzzaman" → after the first pattern strip,
  // remainder is "Dr. Md. Asaduzzaman". Collapse a redundant leading
  // "Dr." (or "Mr.", etc.) since the official prefix is already captured.
  remainder = remainder.replace(/^(?:Dr|Prof|Mr|Mrs|Ms|Miss)\.?\s+/i, "").trim();
  if (!remainder) return null;

  // Split first/last on the last whitespace. Middle initials stay with the
  // first name. The Doctor schema requires both `first` and `last`; for a
  // single-token mononym, use the token for both so validation passes —
  // `displayName` still renders as expected ("Dr. Mahbub").
  const parts = remainder.split(" ").filter(Boolean);
  let first: string;
  let last: string;
  if (parts.length === 1) {
    first = parts[0]!;
    last = parts[0]!;
  } else {
    last = parts[parts.length - 1]!;
    first = parts.slice(0, -1).join(" ");
  }

  return {
    prefix,
    first,
    last,
    displayName: `${prefix} ${remainder}`,
  };
}
