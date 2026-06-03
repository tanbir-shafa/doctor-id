/**
 * Shared types for ingest providers.
 *
 * `CanonicalCandidate` is the merge-input shape. Every provider (popular,
 * ibn-sina, sasthyaseba, doctor-bangladesh) yields a stream of these,
 * regardless of source format. The dedupe + merge engine (T8) only sees
 * candidates — it never touches provider-specific JSON shapes.
 *
 * NOTE: this file intentionally lives under `scripts/` rather than `src/`
 * because ingest is a one-shot CLI; it shouldn't be reachable from the
 * Next.js server bundle.
 */

import type {
    DoctorAward,
    DoctorChamber,
    DoctorExperience,
    DoctorMembership,
    DoctorPublication,
    DoctorQualification,
    DoctorSocialLinks,
    DoctorSpecialty,
    Gender,
    TitlePrefix,
} from "../../../src/types/doctor";

/** Where a candidate came from. Surfaces in the audit log but not on the DB. */
export interface SourceMeta {
    source: "popular-diagnostic" | "ibn-sina" | "sasthyaseba" | "doctor-bangladesh";
    /** The id used inside that source (matches the on-disk fixture filename). */
    sourceId: string;
    /** Canonical URL on the source's own site. */
    sourceUrl: string;
    /** When the dump under data/ was created. From the source's meta.json. */
    scrapedAt: string;
    /**
     * Overall confidence in the extracted record. Structured sources
     * (popular/ibn-sina/sasthyaseba) default to "high"; doctor-bangladesh
     * sets per-record based on regex extraction success.
     */
    confidence: "high" | "medium" | "low";
}

/**
 * Keys the dedupe engine compares across candidates to cluster them. Set
 * what you know; leave undefined what you don't.
 *
 *  - `phone`           — canonical +8801XXXXXXXXX (hardest dedupe signal)
 *  - `bmdc`            — BMDC# (only sasthyaseba reliably has it)
 *  - `nameKey`         — normalizeNameForMatch(doctor.name)
 *  - `chamberAddressKey` — for each chamber, e.g. "popular-dhanmondi"
 *  - `specialtyDistrictKey` — fallback: "cardiology|dhaka"
 */
export interface DedupKeys {
    phone?: string;
    bmdc?: string;
    nameKey?: string;
    chamberAddressKeys?: string[];
    specialtyDistrictKey?: string;
}

/**
 * The structured fields a provider extracted. Maps directly onto Doctor
 * model fields — the merge engine writes these directly (after picking
 * winners across sources).
 */
export interface CandidateFields {
    name: {
        prefix: TitlePrefix;
        first: string;
        last: string;
        displayName: string;
    };
    gender?: Gender;
    bio?: string;
    bmdcNumber?: string;
    languages?: string[];

    contact?: {
        publicPhone?: string;
        publicEmail?: string;
        whatsapp?: string;
        website?: string;
    };
    socialLinks?: DoctorSocialLinks;

    qualifications?: DoctorQualification[];
    experience?: DoctorExperience[];
    chambers?: DoctorChamber[];
    specialties?: DoctorSpecialty[];
    subSpecialties?: string[];

    // Loop A
    designation?: string;
    institute?: string;
    yearsOfExperience?: number;
    awards?: DoctorAward[];
    memberships?: DoctorMembership[];
    publications?: DoctorPublication[];
    concentrations?: string[];

    /** External URL the merge engine downloads + uploads to S3. */
    externalImageUrl?: string;
}

export interface CanonicalCandidate {
    dedupKeys: DedupKeys;
    fields: CandidateFields;
    sourceMeta: SourceMeta;
    warnings: string[];
}
