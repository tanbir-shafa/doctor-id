/**
 * Ibn Sina Trust provider normalizer.
 *
 * Source: data/ibn-sina/doctors.json (1,932 rows). All doctors are
 * affiliated with the Ibn Sina Trust chain; many also list an external
 * `institute` (e.g. "Dhaka National Medical College"). We surface the
 * external institute on the canonical row — the chain affiliation appears
 * implicitly via the chamber name.
 *
 * High-confidence source: every row is structured JSON. The per-branch
 * `schedule[]` array is preferred over `chamber_time` + `off_day` because
 * it's already day-keyed. Falls back to expandChamberTime() when missing.
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
import {
    expandChamberTime,
    normalizeStructuredSchedule,
    type ChamberScheduleSlot,
} from "../normalize/schedule";
import type {CanonicalCandidate} from "./types";
import type {DoctorChamber, DoctorSpecialty, Gender} from "../../../src/types/doctor";

const DATA_DIR = path.join(process.cwd(), "data", "ibn-sina");

export const IBN_SINA_PROVIDER = "ibn-sina" as const;

interface IbnSinaBranch {
    branch_id: number;
    name: string;
    map: string;
    phone: string;
    telephones?: unknown[];
    chamber_time?: string;
    off_day?: string;
    floor_number?: string;
    room_number?: string;
    schedule?: Array<{day?: string; start_time?: string; end_time?: string}>;
}

interface IbnSinaSpecialist {
    specialist_id: number | null;
    specialist_name: string;
}

export interface IbnSinaDoctor {
    id: number;
    name: string;
    mobile: string | null;
    email: string | null;
    image: string | null;
    degree: string | null;
    gender: string | null;
    education?: string | null;
    designation?: string | null;
    institute?: string | null;
    language_spoken?: string | null;
    specialty?: string | null;
    previous_experience?: string | null;
    experience_summery?: string | null;
    profile_url?: string;
    practicing_branches?: string | null;
    branches?: IbnSinaBranch[];
    specialists?: IbnSinaSpecialist[];
    fetchedAt?: string;
}

const CURRENT_YEAR = new Date().getFullYear();

export function ibnSinaSourceUrl(id: number | string): string {
    return `https://www.ibnsinatrust.com/view_doctor_profile_up.php?id=${id}`;
}

function mapGender(raw: unknown): Gender | undefined {
    if (typeof raw !== "string") return undefined;
    const v = raw.trim().toLowerCase();
    if (v === "male" || v === "m") return "male";
    if (v === "female" || v === "f") return "female";
    return undefined;
}

function parseLanguages(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return raw
        .split(/[,;/]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function parseQualifications(degree: string | null | undefined) {
    if (!degree) return [];
    return degree
        .split(/[,;]/)
        .map((p) => p.trim().replace(/\.$/, ""))
        .filter(Boolean)
        .map((d) => ({
            degree: d,
            institution: "Unknown",
            year: CURRENT_YEAR,
            country: "Bangladesh",
        }));
}

function buildChamberSchedule(branch: IbnSinaBranch): ChamberScheduleSlot[] {
    const fromStructured = normalizeStructuredSchedule(branch.schedule ?? []);
    if (fromStructured.length > 0) return fromStructured;
    return expandChamberTime(branch.chamber_time, branch.off_day);
}

function buildChambers(doc: IbnSinaDoctor): DoctorChamber[] {
    const branches = doc.branches ?? [];
    return branches.map((b, idx) => {
        // Scan both b.map AND b.name so chamber-name hints like
        // "Ibn Sina Doyagonj" resolve when b.map is sparse.
        const addr = parseBdAddress(`${b.name ?? ""} ${b.map ?? ""}`.trim());
        const schedule = buildChamberSchedule(b);
        const floor = b.floor_number ? `Floor ${b.floor_number}` : "";
        const room = b.room_number ? `Room ${b.room_number}` : "";
        const tail = [floor, room].filter(Boolean).join(", ");
        const fullName = tail ? `${b.name} (${tail})` : b.name;
        return {
            name: fullName,
            address: b.map || b.name,
            area: addr.area ?? (addr.district ?? "Dhaka"),
            district: addr.district ?? "Dhaka",
            division: addr.division ?? "Dhaka",
            coordinates: undefined,
            phone: b.phone ? b.phone.trim() : undefined,
            schedule,
            consultationFee: {amount: 0, currency: "BDT"},
            isPrimary: idx === 0,
        };
    });
}

function buildSpecialties(
    doc: IbnSinaDoctor,
    lookup: SpecialtyLookup,
): {specialties: DoctorSpecialty[]; subSpecialties: string[]; warnings: string[]} {
    const specialties: DoctorSpecialty[] = [];
    const subSpecialties: string[] = [];
    const warnings: string[] = [];
    const seen = new Set<string>();

    const candidates: string[] = [];
    if (doc.specialty) candidates.push(doc.specialty);
    for (const s of doc.specialists ?? []) {
        if (s.specialist_name) candidates.push(s.specialist_name);
    }

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

/**
 * Pure JSON → CanonicalCandidate. No I/O. Returns null when name is
 * unparseable (the only mandatory field on Doctor).
 */
export function normalizeIbnSinaDoctor(
    doc: IbnSinaDoctor,
    lookup: SpecialtyLookup,
    scrapedAt: string,
): CanonicalCandidate | null {
    const warnings: string[] = [];
    const parsedName = parseDoctorName(doc.name);
    if (!parsedName) return null;

    const publicPhone = normalizeBdPhone(doc.mobile) ?? undefined;
    if (doc.mobile && !publicPhone) warnings.push(`phone invalid: ${doc.mobile}`);
    const gender = mapGender(doc.gender);
    const languages = parseLanguages(doc.language_spoken);
    const qualifications = parseQualifications(doc.degree);
    const {specialties, subSpecialties, warnings: specWarn} = buildSpecialties(doc, lookup);
    warnings.push(...specWarn);
    const chambers = buildChambers(doc);

    const phone = publicPhone;
    const nameKey = normalizeNameForMatch(parsedName.displayName) ?? undefined;
    const primary = specialties[0]?.name?.toLowerCase();
    const district = chambers[0]?.district?.toLowerCase();
    const specialtyDistrictKey = primary && district ? `${primary}|${district}` : undefined;
    const chamberAddressKeys = chambers
        .map((c) => `${c.area}|${c.district}`.toLowerCase())
        .filter(Boolean);

    return {
        dedupKeys: {phone, nameKey, chamberAddressKeys, specialtyDistrictKey},
        fields: {
            name: parsedName,
            gender,
            bio: doc.experience_summery ?? undefined,
            languages: languages.length ? languages : undefined,
            contact: {
                publicPhone,
                publicEmail: doc.email ?? undefined,
            },
            qualifications: qualifications.length ? qualifications : undefined,
            specialties: specialties.length ? specialties : undefined,
            subSpecialties: subSpecialties.length ? subSpecialties : undefined,
            chambers: chambers.length ? chambers : undefined,
            designation: doc.designation?.trim() || undefined,
            institute: doc.institute?.trim() || undefined,
            externalImageUrl: doc.image ?? undefined,
        },
        sourceMeta: {
            source: IBN_SINA_PROVIDER,
            sourceId: String(doc.id),
            sourceUrl: doc.profile_url ?? ibnSinaSourceUrl(doc.id),
            scrapedAt,
            confidence: "high",
        },
        warnings,
    };
}

async function loadScrapedAt(): Promise<string> {
    try {
        const meta = JSON.parse(await fs.readFile(path.join(DATA_DIR, "meta.json"), "utf8"));
        if (typeof meta.finishedAt === "string") return meta.finishedAt;
    } catch {
        // missing meta.json — non-fatal
    }
    return "1970-01-01T00:00:00.000Z";
}

async function loadAllDocs(): Promise<IbnSinaDoctor[]> {
    const buf = await fs.readFile(path.join(DATA_DIR, "doctors.json"), "utf8");
    const arr = JSON.parse(buf);
    if (!Array.isArray(arr)) throw new Error("ibn-sina doctors.json is not an array");
    return arr;
}

/**
 * Async iterator over every doctor in data/ibn-sina/. Yields
 * CanonicalCandidates ready for the dedupe/merge engine.
 */
export async function* loadIbnSina(opts: {
    specialtyLookup: SpecialtyLookup;
    limit?: number;
}): AsyncIterable<CanonicalCandidate> {
    const all = await loadAllDocs();
    const scrapedAt = await loadScrapedAt();
    const take = opts.limit ?? all.length;
    let emitted = 0;
    for (const doc of all) {
        if (emitted >= take) return;
        const candidate = normalizeIbnSinaDoctor(doc, opts.specialtyLookup, scrapedAt);
        if (candidate) {
            emitted++;
            yield candidate;
        }
    }
}

// Re-export to keep ingest CLI imports flat.
export {buildSpecialtyLookup, resolveCity};
