/**
 * Doctor Bangladesh provider normalizer.
 *
 * Source: data/doctor-bangladesh/details/<id>.json (7,206 WordPress post
 * dumps). This is the LOWEST-quality source: clinical metadata is buried in
 * 2-4 sentences of narrative English prose. We extract it with anchored
 * regex passes and track confidence so the merge engine (T8) can downgrade
 * conflicting fields.
 *
 * Strategy (per task T7):
 *   1. Yoast `og_title` = "Dr. X - Specialty in City". Highest-signal source
 *      for {name, specialty, district}. If present, confidence starts "high".
 *   2. Strip HTML from `content.rendered` and run anchored regex extractors:
 *        "is a (.+?) in (.+?)\\."             specialty + district
 *        "(?:His|Her) qualification is (.+?)\\."   degree list
 *        "(?:He|She) is (?:a|an|the) (.+?) at (.+?)\\."
 *           → designation + institute (when distinct from primary chamber)
 *        "regularly provides treatment to (?:his|her) patients at (.+?)\\."
 *           → primary chamber name
 *        "Practicing hour of .+? at .+? is (.+?)\\.?$"
 *           → schedule text → parseScheduleText()
 *   3. Final confidence:
 *        - "high"   if Yoast gave us name+specialty+district AND we extracted
 *          a primary chamber.
 *        - "medium" if we got name + (specialty OR chamber).
 *        - "low"    if only the name parses.
 *
 * Pure module: no I/O in the mapper; only the iterator touches the disk.
 */

import {promises as fs} from "node:fs";
import path from "node:path";
import {parseDoctorName, normalizeNameForMatch} from "../normalize/name";
import {parseBdAddress, resolveCity} from "../normalize/address";
import {parseScheduleText} from "../normalize/schedule";
import {
    buildSpecialtyLookup,
    resolveSpecialty,
    type SpecialtyLookup,
} from "../normalize/specialty";
import type {CanonicalCandidate} from "./types";
import type {
    DoctorChamber,
    DoctorQualification,
    DoctorSpecialty,
} from "../../../src/types/doctor";

const DATA_DIR = path.join(process.cwd(), "data", "doctor-bangladesh");
const DETAIL_DIR = path.join(DATA_DIR, "details");

export const DOCTOR_BANGLADESH_PROVIDER = "doctor-bangladesh" as const;

// --- Raw shapes ---

export interface DoctorBangladeshPost {
    id: number;
    slug: string;
    link?: string;
    title?: {rendered?: string};
    content?: {rendered?: string};
    featured_media?: number;
    yoast_head_json?: {
        title?: string;
        description?: string;
        og_title?: string;
        og_description?: string;
        og_image?: Array<{url?: string; width?: number; height?: number}>;
    };
}

const CURRENT_YEAR = new Date().getFullYear();

// --- HTML scrubber ---

function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
    return decodeEntities(
        html
            .replace(/<\/?(?:p|h[1-6]|br|div|span|ul|li|ol|strong|em)[^>]*>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
    );
}

// --- Extractors (each returns null if no hit) ---

export interface YoastShape {
    name?: string;
    specialty?: string;
    district?: string;
    chamber?: string; // "now at X"
}

/**
 * Parse the canonical Yoast og_title shape:
 *   "Dr. Karim Rahman - Cardiologist in Dhaka"
 * Also extracts the "now at X" chamber hint from og_description when present.
 */
export function parseYoast(yoast: DoctorBangladeshPost["yoast_head_json"]): YoastShape {
    const out: YoastShape = {};
    const title = yoast?.og_title || yoast?.title;
    if (typeof title === "string") {
        const m = title.match(/^(.+?)\s*-\s*(.+?)\s+in\s+(.+?)\s*$/);
        if (m) {
            out.name = m[1]!.trim();
            out.specialty = m[2]!.trim();
            out.district = m[3]!.trim();
        }
    }
    const desc = yoast?.og_description || yoast?.description;
    if (typeof desc === "string") {
        const m = desc.match(/now at (.+?)\.\s/);
        if (m) out.chamber = m[1]!.trim();
    }
    return out;
}

export interface ProseExtraction {
    specialty?: string;
    district?: string;
    qualification?: string;
    designation?: string;
    institute?: string;
    primaryChamber?: string;
    practicingHourText?: string;
}

export function extractFromProse(content: string): ProseExtraction {
    const text = stripHtml(content);
    const out: ProseExtraction = {};

    // "is a X in Y."  →  specialty + district
    const m1 = text.match(/\bis (?:a|an|the) ([^.]+?)\s+in\s+([^.,]+?)[.,]/i);
    if (m1) {
        out.specialty = m1[1]!.trim();
        out.district = m1[2]!.trim();
    }

    // "His/Her qualification is X."  →  qualification
    const m2 = text.match(/\b(?:His|Her) qualification is ([^.]+)\./i);
    if (m2) out.qualification = m2[1]!.trim();

    // "He is a/an/the X at Y."  →  designation + institute
    // Conservative: "X" may itself contain commas; cut on " at " then sentence end.
    const m3 = text.match(/\b(?:He|She) is (?:a|an|the) (.+?) at ([^.]+?)\./i);
    if (m3) {
        out.designation = m3[1]!.trim();
        out.institute = m3[2]!.trim();
    } else {
        const m3b = text.match(/\b(?:He|She) is working as (?:a|an|the) (.+?) (?:doctor )?in ([^.]+?)\./i);
        if (m3b) {
            out.designation = m3b[1]!.trim();
            out.institute = m3b[2]!.trim();
        }
    }

    // "regularly provides treatment to his/her patients at X."  →  primary chamber
    const m4 = text.match(/regularly provides treatment to (?:his|her) patients at ([^.]+?)\./i);
    if (m4) out.primaryChamber = m4[1]!.trim();

    // "Practicing hour of <name> at <chamber> is <hours>."  →  raw hours string
    const m5 = text.match(/Practicing hour of .+? at .+? is ([^.]+)\.?/i);
    if (m5) out.practicingHourText = m5[1]!.trim();

    return out;
}

// --- Pure mapping ---

function parseQualificationsString(raw: string | undefined): DoctorQualification[] {
    if (!raw) return [];
    return raw
        .split(/[,;]/)
        .map((p) => p.trim().replace(/\.$/, ""))
        .filter(Boolean)
        .map((degree) => ({
            degree,
            institution: "Unknown",
            year: CURRENT_YEAR,
            country: "Bangladesh",
        }));
}

function resolveDistrictAndDivision(district: string | undefined): {
    city: string;
    division: string;
    district: string | null;
    area: string | null;
} {
    if (!district) {
        return {city: "Unknown", division: "Unknown", district: null, area: null};
    }
    const cityResolved = resolveCity(district);
    if (cityResolved) {
        return {
            city: cityResolved.district,
            division: cityResolved.division,
            district: cityResolved.district,
            area: null,
        };
    }
    // Free text — could be an upazila or town we don't have in bd-admin.
    const addr = parseBdAddress(district);
    return {
        city: addr.district ?? district,
        division: addr.division ?? "Unknown",
        district: addr.district,
        area: addr.area,
    };
}

export function normalizeDoctorBangladeshPost(
    post: DoctorBangladeshPost,
    lookup: SpecialtyLookup,
    scrapedAt: string,
): CanonicalCandidate | null {
    const warnings: string[] = [];

    const yoast = parseYoast(post.yoast_head_json);
    const sourceName = yoast.name || post.title?.rendered || "";
    const parsedName = parseDoctorName(sourceName);
    if (!parsedName) return null;

    const prose = extractFromProse(post.content?.rendered ?? "");

    // Specialty: prefer Yoast, fall back to prose.
    const specialtyRaw = yoast.specialty ?? prose.specialty;
    const specialties: DoctorSpecialty[] = [];
    const subSpecialties: string[] = [];
    if (specialtyRaw) {
        const match = resolveSpecialty(specialtyRaw, lookup);
        if (match) {
            specialties.push({
                name: match.name,
                isPrimary: true,
                fhirCode: match.fhirCode ?? undefined,
            });
        } else {
            subSpecialties.push(specialtyRaw);
            warnings.push(`specialty unmatched: ${specialtyRaw}`);
        }
    }

    // District: prefer Yoast, fall back to prose.
    const districtRaw = yoast.district ?? prose.district;
    const geo = resolveDistrictAndDivision(districtRaw);

    // Primary chamber: prefer Yoast `now at X`, fall back to prose. Cap to
    // 120 chars so adversarial input doesn't bust the schema maxlength.
    const chamberName = (yoast.chamber ?? prose.primaryChamber ?? "").slice(0, 120);
    const schedule = parseScheduleText(prose.practicingHourText);

    const chambers: DoctorChamber[] = chamberName
        ? [
              {
                  name: chamberName,
                  address: chamberName,
                  area: geo.area ?? geo.city,
                  district: geo.city,
                  division: geo.division,
                  coordinates: undefined,
                  phone: undefined,
                  schedule,
                  consultationFee: {amount: 0, currency: "BDT"},
                  isPrimary: true,
              },
          ]
        : [];

    const qualifications = parseQualificationsString(prose.qualification);
    const externalImageUrl =
        post.yoast_head_json?.og_image?.find((i) => typeof i?.url === "string")?.url ?? undefined;

    // Confidence ladder.
    let confidence: "high" | "medium" | "low" = "low";
    if (yoast.name && yoast.specialty && yoast.district && chambers.length > 0) confidence = "high";
    else if (specialties.length > 0 || chambers.length > 0) confidence = "medium";

    const nameKey = normalizeNameForMatch(parsedName.displayName) ?? undefined;
    const primary = specialties[0]?.name?.toLowerCase();
    const district = chambers[0]?.district?.toLowerCase();
    const specialtyDistrictKey = primary && district ? `${primary}|${district}` : undefined;
    const chamberAddressKeys = chambers
        .map((c) => `${c.area}|${c.district}`.toLowerCase())
        .filter(Boolean);

    return {
        dedupKeys: {nameKey, chamberAddressKeys, specialtyDistrictKey},
        fields: {
            name: parsedName,
            qualifications: qualifications.length ? qualifications : undefined,
            specialties: specialties.length ? specialties : undefined,
            subSpecialties: subSpecialties.length ? subSpecialties : undefined,
            chambers: chambers.length ? chambers : undefined,
            designation: prose.designation,
            institute: prose.institute,
            externalImageUrl,
        },
        sourceMeta: {
            source: DOCTOR_BANGLADESH_PROVIDER,
            sourceId: String(post.id),
            sourceUrl: post.link ?? `https://www.doctorbangladesh.com/${post.slug}/`,
            scrapedAt,
            confidence,
        },
        warnings,
    };
}

async function loadScrapedAt(): Promise<string> {
    try {
        const meta = JSON.parse(await fs.readFile(path.join(DATA_DIR, "meta.json"), "utf8"));
        if (typeof meta.finishedAt === "string") return meta.finishedAt;
    } catch {
        // missing — non-fatal
    }
    return "1970-01-01T00:00:00.000Z";
}

async function loadIds(): Promise<number[]> {
    const buf = await fs.readFile(path.join(DATA_DIR, "doctor-ids.json"), "utf8");
    const ids = JSON.parse(buf);
    if (!Array.isArray(ids)) throw new Error("doctor-ids.json is not an array");
    return ids;
}

export async function* loadDoctorBangladesh(opts: {
    specialtyLookup: SpecialtyLookup;
    limit?: number;
}): AsyncIterable<CanonicalCandidate> {
    const ids = await loadIds();
    const scrapedAt = await loadScrapedAt();
    const take = opts.limit ?? ids.length;
    let emitted = 0;
    for (const id of ids) {
        if (emitted >= take) return;
        let post: DoctorBangladeshPost;
        try {
            post = JSON.parse(await fs.readFile(path.join(DETAIL_DIR, `${id}.json`), "utf8"));
        } catch {
            continue;
        }
        const candidate = normalizeDoctorBangladeshPost(post, opts.specialtyLookup, scrapedAt);
        if (candidate) {
            emitted++;
            yield candidate;
        }
    }
}

export {buildSpecialtyLookup};
