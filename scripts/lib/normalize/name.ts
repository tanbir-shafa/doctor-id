/**
 * Name normalization for the ingest pipeline.
 *
 * - `parseDoctorName` (re-exported): produces the structured {prefix, first,
 *   last, displayName} shape stored on Doctor.name. Already battle-tested in
 *   src/lib/utils/name-parser.ts — single source of truth.
 *
 * - `normalizeNameForMatch`: produces a lowercase, diacritic-free,
 *   prefix-stripped, Md.-collapsed key used by the dedupe layer to match
 *   "Md. Karim Rahman" with "Mohammad Karim Rahman" with "MD KARIM RAHMAN".
 *   This is NOT for display — only for cross-source dedup keys.
 */

export {parseDoctorName, type ParsedName} from "../../../src/lib/utils/name-parser";

const PREFIX_STRIP_RE =
    /^(?:asst\.?|assistant|assoc\.?|associate)?\s*prof(?:essor)?\.?\s+dr\.?\s+|^(?:asst\.?|assistant|assoc\.?|associate)\s*prof(?:essor)?\.?\s+|^dr\.?\s+|^mr\.?\s+|^mrs\.?\s+|^ms\.?\s+|^prof(?:essor)?\.?\s+/i;

const MOHAMMAD_RE = /\b(?:mohammad|mohammed|muhammad|md|m)\b\.?/g;

/**
 * Normalize a name to a stable matching key.
 *
 * The output is intentionally non-reversible — it strips honorifics,
 * collapses Md./Mohammad variants, removes punctuation, and lowercases. Two
 * strings that produce the same key are considered the same person *for
 * dedup purposes only* (combined with phone / BMDC / chamber-address to
 * triangulate; never use this alone as a merge key).
 *
 * Examples:
 *   "Prof. Dr. Mohammad Karim Rahman" → "md karim rahman"
 *   "Dr. Md. Karim Rahman"           → "md karim rahman"
 *   "MD. KARIM RAHMAN"               → "md karim rahman"
 *   "Dr. M Karim Rahman"             → "md karim rahman"
 *   ""                               → null
 */
export function normalizeNameForMatch(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    let s = raw.trim();
    if (!s) return null;

    // Insert a space after `.` followed by a letter so "Dr.Md.Karim" splits.
    s = s.replace(/\.(?=[A-Za-z])/g, ". ");

    // Lowercase + strip punctuation (keep letters, digits, spaces).
    s = s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

    // Strip honorific prefix(es) iteratively — handles "Prof Dr".
    let prev = "";
    while (prev !== s) {
        prev = s;
        s = s.replace(PREFIX_STRIP_RE, "").trim();
    }

    // Collapse Mohammad / Mohammed / Muhammad / Md / M (standalone) → "md".
    // The replace runs once over the whole string, then dedupes consecutive
    // "md md" that may arise from "Mohammad Md.".
    s = s.replace(MOHAMMAD_RE, "md").replace(/\bmd(?:\s+md)+\b/g, "md");

    return s.replace(/\s+/g, " ").trim() || null;
}
