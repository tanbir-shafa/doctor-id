/**
 * Address normalization for the ingest pipeline.
 *
 * Inputs are free-text Bangladeshi addresses with no consistent shape:
 *   "HOUSE # 16 বীর উত্তম এম এ রব সড়ক, ঢাকা 1205"            (popular)
 *   "28, Doyagonj (Hut lane), Gandaria, Dhaka-1204"               (ibn-sina)
 *   "House # 67, Avenue # 5, Block # C, Section-6 Mirpur, Dhaka"  (sasthyaseba)
 *   "Mid Town Diagnostic Center, Pabna"                           (doctor-bd)
 *
 * Output:
 *   { division?, district?, area?, raw: string }
 *
 * Strategy: substring-scan the AREAS + DISTRICTS tables (in that order so a
 * specific Dhaka area like "Mirpur" wins over the district "Dhaka"). Anything
 * unresolved stays in the raw string — the Mongoose Doctor schema still has
 * the free-text `area`/`city`/`division` fields for fallback.
 *
 * Pure module: no I/O, no Date.now.
 */

import {AREAS, DISTRICTS, type Division, resolveDistrict} from "./bd-admin";

export interface ParsedAddress {
    division: Division | null;
    district: string | null;
    area: string | null;
    raw: string;
}

export function parseBdAddress(raw: unknown): ParsedAddress {
    const empty: ParsedAddress = {division: null, district: null, area: null, raw: ""};
    if (typeof raw !== "string") return empty;
    const text = raw.trim();
    if (!text) return empty;
    const lower = text.toLowerCase();

    let division: Division | null = null;
    let district: string | null = null;
    let area: string | null = null;

    // 1. Area scan — most specific first. "Mirpur" before "Dhaka".
    for (const [needle, entry] of Object.entries(AREAS)) {
        if (lower.includes(needle)) {
            area = entry.canonical;
            district = entry.district;
            const d = DISTRICTS[entry.district];
            if (d) division = d.division;
            break;
        }
    }

    // 2. District scan — if no area matched, find a district name in the text.
    if (!district) {
        for (const [name, entry] of Object.entries(DISTRICTS)) {
            if (lower.includes(name.toLowerCase())) {
                district = name;
                division = entry.division;
                break;
            }
            for (const alias of entry.aliases ?? []) {
                if (lower.includes(alias.toLowerCase())) {
                    district = name;
                    division = entry.division;
                    break;
                }
            }
            if (district) break;
        }
    }

    return {division, district, area, raw: text};
}

/**
 * Resolve a single token that's already been pulled out of a structured
 * field (e.g. sasthyaseba's `address.city.name`). Faster path that avoids
 * full text scan.
 */
export function resolveCity(raw: unknown): {district: string; division: Division} | null {
    if (typeof raw !== "string") return null;
    return resolveDistrict(raw);
}
