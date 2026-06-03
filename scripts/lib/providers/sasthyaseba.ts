/**
 * Sasthyaseba provider normalizer.
 *
 * Source: data/sasthyaseba/details/doctors/<slug>.json (one file per doctor;
 * 2,332 files total). This is the richest of our four sources — lat/lng,
 * structured fees, awards, memberships, concentrations, social links — so
 * sasthyaseba is the source-tier *winner* for most field merges in T8.
 *
 * Caveats observed in the raw data:
 *   - `awards[]`, `educations[]`, `experiences[]`, `memberships[]` typically
 *     carry semi-structured rows where the meaningful content sits inside
 *     a free-text `plain_text` field (the structured fields are null).
 *   - `registration_number` is usually null — sasthyaseba doesn't have BMDC
 *     for most doctors. The few it does are gold.
 *   - `concentrations[]` contains duplicates with different ids (the dump
 *     does NOT pre-dedupe). We dedupe here.
 *   - `primary_chamber.area` is often just a numeric string (e.g. "39") —
 *     useless on its own. We prefer `thana` and fall back to parseBdAddress.
 */

import {promises as fs} from "node:fs";
import path from "node:path";
import {normalizeBdPhone} from "../normalize/phone";
import {parseDoctorName, normalizeNameForMatch} from "../normalize/name";
import {parseBdAddress, resolveCity} from "../normalize/address";
import {
    buildSpecialtyLookup,
    resolveSpecialty,
    type SpecialtyLookup,
} from "../normalize/specialty";
import type {CanonicalCandidate} from "./types";
import type {
    DoctorAward,
    DoctorChamber,
    DoctorMembership,
    DoctorPublication,
    DoctorQualification,
    DoctorSpecialty,
    Gender,
    TitlePrefix,
} from "../../../src/types/doctor";

const DATA_DIR = path.join(process.cwd(), "data", "sasthyaseba");
const DETAIL_DIR = path.join(DATA_DIR, "details", "doctors");

export const SASTHYASEBA_PROVIDER = "sasthyaseba" as const;

// --- Raw shapes (loosely typed — file on disk is the source of truth) ---

interface SasNamedEntity {
    id?: number;
    name: string;
}

interface SasAddress {
    country?: {id?: number; name?: string};
    city?: {id?: number; name?: string};
    thana?: string | null;
    area?: string | null;
    street_address?: string | null;
    postal_code?: string | null;
    map_url?: string | null;
    lat?: number | null;
    lng?: number | null;
}

interface SasChamber {
    id: number;
    name: string;
    chamber_type?: {id?: number; name?: string};
    address?: SasAddress;
    currency?: string | null;
    on_premises_new_fee?: number | null;
    on_premises_follow_up_fee?: number | null;
    on_premises_report_show_fee?: number | null;
    virtual_new_fee?: number | null;
    is_active?: boolean;
}

interface SasPlainTextRow {
    id?: number;
    name?: string | null;
    designation?: string | null;
    department?: string | null;
    from_date?: string | null;
    to_date?: string | null;
    is_currently_working?: boolean;
    plain_text?: string | null;
}

export interface SasthyasebaDoctor {
    id: number;
    uid?: string;
    slug: string;
    name: string;
    subtitle?: string | null;
    photo_uri?: string | null;
    starting_fee?: number;
    currency?: string | null;
    years_of_experience?: number | null;
    registration_number?: string | null;
    is_virtual_available?: boolean;
    is_telemedicine_available?: boolean;
    specialities?: SasNamedEntity[];
    specializations?: SasNamedEntity[];
    primary_chamber?: SasChamber | null;
    telemedicine_chamber?: SasChamber | null;
    total_chambers?: number;
    about?: string | null;
    gender_id?: number | null;
    concentrations?: SasNamedEntity[];
    educations?: SasPlainTextRow[];
    awards?: SasPlainTextRow[];
    experiences?: SasPlainTextRow[];
    memberships?: SasPlainTextRow[];
    courses_trainings?: SasPlainTextRow[];
    review?: {total_reviews?: number; average_rating?: number | null};
    facebook_url?: string | null;
    linkedin_url?: string | null;
    youtube_url?: string | null;
    website_url?: string | null;
}

export function sasthyasebaSourceUrl(slug: string): string {
    return `https://sasthyaseba.com/doctor/${slug}`;
}

function mapGender(raw: number | null | undefined): Gender | undefined {
    if (raw === 1) return "male";
    if (raw === 2) return "female";
    return undefined;
}

function dedupeNames(items: SasNamedEntity[] | undefined): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of items ?? []) {
        if (!x?.name) continue;
        const key = x.name.trim().toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            out.push(x.name.trim());
        }
    }
    return out;
}

function parseSubtitleQualifications(subtitle: string | null | undefined): DoctorQualification[] {
    if (!subtitle) return [];
    return subtitle
        .split(/[,;]/)
        .map((p) => p.trim().replace(/\.$/, ""))
        .filter(Boolean)
        .map((degree) => ({
            degree,
            institution: "Unknown",
            year: new Date().getFullYear(),
            country: "Bangladesh",
        }));
}

function parseAwards(rows: SasPlainTextRow[] | undefined): DoctorAward[] {
    return (rows ?? [])
        .map((r) => {
            const title = (r.plain_text || r.name || "").trim();
            if (!title) return null;
            return {title} as DoctorAward;
        })
        .filter((x): x is DoctorAward => x !== null);
}

function parseMemberships(rows: SasPlainTextRow[] | undefined): DoctorMembership[] {
    return (rows ?? [])
        .map((r) => {
            const body = (r.plain_text || r.name || "").trim();
            if (!body) return null;
            return {body} as DoctorMembership;
        })
        .filter((x): x is DoctorMembership => x !== null);
}

function parseEducations(rows: SasPlainTextRow[] | undefined): DoctorQualification[] {
    return (rows ?? [])
        .map((r) => {
            const text = (r.plain_text || r.name || "").trim();
            if (!text) return null;
            // The text is usually "MBBS - Bachelor of Medicine ...".
            const degree = text.split(/[-–]/)[0]!.trim();
            return {
                degree: degree || text.slice(0, 40),
                institution: "Unknown",
                year: new Date().getFullYear(),
                country: "Bangladesh",
            } as DoctorQualification;
        })
        .filter((x): x is DoctorQualification => x !== null);
}

function parseExperiences(rows: SasPlainTextRow[] | undefined) {
    return (rows ?? [])
        .map((r) => {
            const text = (r.plain_text || r.name || "").trim();
            if (!text) return null;
            return {
                role: r.designation?.trim() || text.slice(0, 80),
                organization: r.department?.trim() || text,
                from: r.from_date ? new Date(r.from_date) : new Date(),
                current: r.is_currently_working ?? false,
            };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
}

function buildSpecialties(
    doc: SasthyasebaDoctor,
    lookup: SpecialtyLookup,
): {specialties: DoctorSpecialty[]; subSpecialties: string[]; warnings: string[]} {
    const specialties: DoctorSpecialty[] = [];
    const subSpecialties: string[] = [];
    const warnings: string[] = [];
    const seen = new Set<string>();

    const candidates: string[] = [
        ...dedupeNames(doc.specialities),
        ...dedupeNames(doc.specializations),
    ];

    for (const raw of candidates) {
        const key = raw.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const match = resolveSpecialty(raw, lookup);
        if (match) {
            if (!specialties.some((x) => x.name === match.name)) {
                specialties.push({
                    name: match.name,
                    isPrimary: specialties.length === 0,
                    fhirCode: match.fhirCode ?? undefined,
                });
            }
        } else {
            subSpecialties.push(raw);
            warnings.push(`specialty unmatched: ${raw}`);
        }
    }
    return {specialties, subSpecialties, warnings};
}

function buildChambers(doc: SasthyasebaDoctor): DoctorChamber[] {
    const out: DoctorChamber[] = [];
    if (doc.primary_chamber) {
        const c = buildChamber(doc.primary_chamber, true);
        if (c) out.push(c);
    }
    if (doc.telemedicine_chamber) {
        const c = buildChamber(doc.telemedicine_chamber, out.length === 0);
        if (c) out.push(c);
    }
    return out;
}

function buildChamber(c: SasChamber, isPrimary: boolean): DoctorChamber | null {
    const addr = c.address ?? {};
    const street = (addr.street_address ?? "").trim();
    const cityName = addr.city?.name?.trim();
    const thana = (addr.thana ?? "").trim();
    const fullAddress = [street, addr.area, thana, cityName].filter(Boolean).join(", ").trim();

    const cityResolved = resolveCity(cityName ?? "");
    // Prefer the thana when available; fall back to parseBdAddress on the
    // chamber NAME + full address combined. The chamber name often carries
    // the thana hint (e.g. "Islami Bank Central Hospital | Mirpur") that
    // the structured `thana` / `area` fields omit.
    const scanText = `${c.name ?? ""} ${fullAddress}`.trim();
    const area = thana || parseBdAddress(scanText).area || cityName || "Dhaka";

    const city = cityResolved?.district ?? cityName ?? "Dhaka";
    const division = cityResolved?.division ?? "Dhaka";

    return {
        name: c.name,
        address: fullAddress || c.name,
        area,
        city,
        division,
        coordinates:
            typeof addr.lat === "number" && typeof addr.lng === "number"
                ? {lat: addr.lat, lng: addr.lng}
                : undefined,
        phone: undefined,
        schedule: [],
        consultationFee: {
            amount: c.on_premises_new_fee ?? 0,
            currency: ((c.currency ?? "BDT").toUpperCase() === "USD" ? "USD" : "BDT") as "BDT" | "USD",
        },
        isPrimary,
    };
}

/**
 * Pure JSON → CanonicalCandidate. No I/O.
 */
export function normalizeSasthyasebaDoctor(
    doc: SasthyasebaDoctor,
    lookup: SpecialtyLookup,
    scrapedAt: string,
): CanonicalCandidate | null {
    const warnings: string[] = [];

    // Some sasthyaseba names lack honorific prefixes (e.g. "Akhi Akter").
    // parseDoctorName works without a prefix; defaults to "Dr.".
    const parsedName = parseDoctorName(doc.name) ?? buildBareNameFallback(doc.name);
    if (!parsedName) return null;

    const bmdcNumber = doc.registration_number?.trim() || undefined;
    const gender = mapGender(doc.gender_id);
    const {specialties, subSpecialties, warnings: specWarn} = buildSpecialties(doc, lookup);
    warnings.push(...specWarn);

    const subtitleQualifs = parseSubtitleQualifications(doc.subtitle);
    const educationQualifs = parseEducations(doc.educations);
    const qualifications = subtitleQualifs.length > 0 ? subtitleQualifs : educationQualifs;
    const experiences = parseExperiences(doc.experiences);
    const awards = parseAwards(doc.awards);
    const memberships = parseMemberships(doc.memberships);
    const publications: DoctorPublication[] = []; // not present in sasthyaseba

    const chambers = buildChambers(doc);
    const concentrations = dedupeNames(doc.concentrations);

    const socialLinks: NonNullable<CanonicalCandidate["fields"]["socialLinks"]> = {};
    if (doc.facebook_url) socialLinks.facebook = doc.facebook_url;
    if (doc.linkedin_url) socialLinks.linkedin = doc.linkedin_url;
    if (doc.youtube_url) socialLinks.youtube = doc.youtube_url;
    const website = doc.website_url ?? undefined;

    const phone: string | undefined = undefined; // sasthyaseba doesn't expose
    const nameKey = normalizeNameForMatch(parsedName.displayName) ?? undefined;
    const primary = specialties[0]?.name?.toLowerCase();
    const district = chambers[0]?.city?.toLowerCase();
    const specialtyDistrictKey = primary && district ? `${primary}|${district}` : undefined;
    const chamberAddressKeys = chambers
        .map((c) => `${c.area}|${c.city}`.toLowerCase())
        .filter(Boolean);

    return {
        dedupKeys: {phone, bmdc: bmdcNumber, nameKey, chamberAddressKeys, specialtyDistrictKey},
        fields: {
            name: parsedName,
            gender,
            bio: doc.about ?? undefined,
            bmdcNumber,
            contact: website ? {website} : undefined,
            socialLinks: Object.keys(socialLinks).length ? socialLinks : undefined,
            qualifications: qualifications.length ? qualifications : undefined,
            experience: experiences.length ? experiences : undefined,
            specialties: specialties.length ? specialties : undefined,
            subSpecialties: subSpecialties.length ? subSpecialties : undefined,
            chambers: chambers.length ? chambers : undefined,
            awards: awards.length ? awards : undefined,
            memberships: memberships.length ? memberships : undefined,
            publications: publications.length ? publications : undefined,
            concentrations: concentrations.length ? concentrations : undefined,
            yearsOfExperience:
                typeof doc.years_of_experience === "number" ? doc.years_of_experience : undefined,
            externalImageUrl: doc.photo_uri ?? undefined,
        },
        sourceMeta: {
            source: SASTHYASEBA_PROVIDER,
            sourceId: String(doc.id),
            sourceUrl: sasthyasebaSourceUrl(doc.slug),
            scrapedAt,
            confidence: "high",
        },
        warnings,
    };
}

// Fallback for sasthyaseba names that don't survive parseDoctorName (rare —
// "Antara rani pal" works; just preserves it as Dr. <name>).
function buildBareNameFallback(raw: string): {
    prefix: TitlePrefix;
    first: string;
    last: string;
    displayName: string;
} | null {
    const s = raw.trim();
    if (!s) return null;
    const parts = s.split(/\s+/);
    if (parts.length === 1) {
        return {prefix: "Dr.", first: parts[0]!, last: parts[0]!, displayName: `Dr. ${s}`};
    }
    return {
        prefix: "Dr.",
        first: parts.slice(0, -1).join(" "),
        last: parts[parts.length - 1]!,
        displayName: `Dr. ${s}`,
    };
}

async function loadScrapedAt(): Promise<string> {
    try {
        const meta = JSON.parse(await fs.readFile(path.join(DATA_DIR, "meta.json"), "utf8"));
        if (typeof meta.finishedAt === "string") return meta.finishedAt;
    } catch {
        // no meta — non-fatal
    }
    return "1970-01-01T00:00:00.000Z";
}

async function listDetailFiles(): Promise<string[]> {
    return (await fs.readdir(DETAIL_DIR)).filter((f) => f.endsWith(".json"));
}

export async function* loadSasthyaseba(opts: {
    specialtyLookup: SpecialtyLookup;
    limit?: number;
}): AsyncIterable<CanonicalCandidate> {
    const files = await listDetailFiles();
    const scrapedAt = await loadScrapedAt();
    const take = opts.limit ?? files.length;
    let emitted = 0;
    for (const file of files) {
        if (emitted >= take) return;
        let doc: SasthyasebaDoctor;
        try {
            doc = JSON.parse(await fs.readFile(path.join(DETAIL_DIR, file), "utf8"));
        } catch {
            continue;
        }
        const candidate = normalizeSasthyasebaDoctor(doc, opts.specialtyLookup, scrapedAt);
        if (candidate) {
            emitted++;
            yield candidate;
        }
    }
}

// Re-export normalizeBdPhone for symmetry with other providers (some
// sasthyaseba-only utilities may need it later for the contact pipeline).
export {buildSpecialtyLookup, normalizeBdPhone};
