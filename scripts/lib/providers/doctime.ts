/**
 * DocTime provider normalizer.
 *
 * Source: data/doctime/doctors.json (1,558 rows). DocTime is a telemedicine
 * platform, and the data shape reflects that — with two consequences for the
 * merge engine that callers must understand:
 *
 *  - **Chamberless by design.** ~99% of DocTime doctors have NO physical clinic
 *    (`clinic: []`, virtual-only schedules) and NONE expose a phone number. The
 *    handful (21) of one-off clinic addresses are NOT a reusable branch network
 *    like Popular/Ibn-Sina's, so we drop them rather than pollute the chamber
 *    catalog. Every DocTime record is emitted with no chambers.
 *  - **No auto-merge into existing doctors.** With neither phone nor district,
 *    the cross-source same-doctor test (build-unified.ts `sameDoctor`) can never
 *    auto-merge a DocTime record into an existing Popular/Ibn-Sina doctor — a
 *    name collision goes to the review queue, exactly as the existing rules
 *    intend for cross-source pairs that can't be confirmed.
 *
 * DocTime is, however, the FIRST source carrying BMDC registration numbers at
 * scale (`reg_no`, ~1,510/1,558, 1,496 distinct). We surface it as
 * `dedupKeys.bmdc` — a strong intra-source identity signal — and on the
 * candidate's `bmdcNumber` field.
 *
 * High-confidence source: every row is structured JSON.
 */

import { normalizeNameForMatch, parseDoctorName } from "../normalize/name";
import { resolveSpecialty, type SpecialtyLookup } from "../normalize/specialty";
import { isValidBmdcFormat } from "../../../src/lib/utils/bmdc";
import type { CanonicalCandidate } from "./types";
import type { DoctorQualification, DoctorSpecialty, Gender } from "../../../src/types/doctor";

export const DOCTIME_PROVIDER = "doctime" as const;

const CURRENT_YEAR = new Date().getFullYear();

// ---- loose upstream shapes (preserved verbatim under the record's `raw`) ----

interface DoctimeCountry {
  name?: string | null;
  short_name?: string | null;
}
interface DoctimeDegree {
  degree?: string | null;
  passing_year?: number | null;
  institute?: string | null;
  institute_location?: string | null;
  country?: DoctimeCountry | null;
}
interface DoctimeSpeciality {
  id?: number | null;
  name?: string | null;
  typical_name?: string | null;
  profession_name?: string | null;
  is_specialist?: number | null;
}
interface DoctimeExperience {
  organization_name?: string | null;
  designation?: string | null;
  department?: string | null;
  is_current?: boolean;
}
interface DoctimeUser {
  id?: number;
  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  gender?: string | null;
  profile_photo?: string | null;
  search_code?: string | null;
}
export interface DoctimeData {
  user?: DoctimeUser;
  specialities?: DoctimeSpeciality[];
  degree_names?: string[];
  degrees?: DoctimeDegree[];
  experiences?: DoctimeExperience[];
  reg_no?: string | number | null;
  bio?: string | null;
}
/** A row of data/doctime/doctors.json. */
export interface DoctimeEntry {
  id?: number;
  data?: DoctimeData;
  localPhotoPath?: string | null;
  fetchedAt?: string;
}

/**
 * Provenance URL. DocTime's public consumer-site (doctime.com.bd) profile-URL
 * pattern is unconfirmed, so we store the API detail endpoint we actually
 * scraped. `sourceUrl` is a stored provenance field only — never rendered on
 * the public profile.
 */
export function doctimeSourceUrl(id: number | string): string {
  return `https://api.doctime.net/api/doctors/${id}`;
}

function mapGender(raw: unknown): Gender | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "male" || v === "m") return "male";
  if (v === "female" || v === "f") return "female";
  return undefined;
}

function cleanBio(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim();
  if (!v) return undefined;
  // DocTime stores empty bios as the literal strings "None" / "null".
  if (/^(none|null|n\/a|na)$/i.test(v)) return undefined;
  return v;
}

function countryName(c: DoctimeCountry | null | undefined): string {
  const n = (c?.name ?? "").trim();
  if (!n || n.toUpperCase() === "BD") return "Bangladesh";
  return n;
}

function parseQualifications(data: DoctimeData): DoctorQualification[] {
  const out: DoctorQualification[] = [];
  const seen = new Set<string>();
  const push = (degree: string, institution: string, year: number, country: string) => {
    const key = degree.toLowerCase();
    if (!degree || seen.has(key)) return;
    seen.add(key);
    out.push({ degree, institution, year, country });
  };
  for (const d of data.degrees ?? []) {
    const degree = String(d?.degree ?? "").trim();
    push(
      degree,
      (d?.institute && String(d.institute).trim()) || "Unknown",
      Number(d?.passing_year) || CURRENT_YEAR,
      countryName(d?.country),
    );
  }
  // Fallback: degree_names[] when the structured degrees[] array is empty.
  if (out.length === 0) {
    for (const name of data.degree_names ?? []) {
      push(String(name ?? "").trim(), "Unknown", CURRENT_YEAR, "Bangladesh");
    }
  }
  return out;
}

function buildSpecialties(
  data: DoctimeData,
  lookup: SpecialtyLookup,
): { specialties: DoctorSpecialty[]; subSpecialties: string[]; warnings: string[] } {
  const specialties: DoctorSpecialty[] = [];
  const subSpecialties: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const s of data.specialities ?? []) {
    const raw = String(s?.name ?? "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Resolve on the specialty name; fall back to the broader profession_name.
    const match =
      resolveSpecialty(raw, lookup) ?? resolveSpecialty(String(s?.profession_name ?? ""), lookup);
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
  return { specialties, subSpecialties, warnings };
}

/**
 * Pure JSON → CanonicalCandidate. No I/O. Returns null when the name is
 * unparseable (the only mandatory field on Doctor) or the user/id is missing.
 */
export function normalizeDoctimeDoctor(
  entry: DoctimeEntry,
  lookup: SpecialtyLookup,
  scrapedAt: string,
): CanonicalCandidate | null {
  const data = entry?.data;
  const user = data?.user;
  if (!data || !user) return null;

  const rawName =
    user.name && user.name.trim()
      ? user.name
      : [user.title, user.first_name, user.last_name].filter(Boolean).join(" ");
  const parsedName = parseDoctorName(rawName);
  if (!parsedName) return null;

  const id = user.id ?? entry.id;
  if (id == null) return null;

  const warnings: string[] = [];
  const gender = mapGender(user.gender);
  const qualifications = parseQualifications(data);
  const { specialties, subSpecialties, warnings: specWarn } = buildSpecialties(data, lookup);
  warnings.push(...specWarn);

  // BMDC = digits only, kept only when it's a plausible registration number
  // (4–7 digits, per isValidBmdcFormat). DocTime's reg_no arrives as "A-7676",
  // "A 7383", "A7676", "9908BDS", and junk like "N/A" / "0" / "88" — strip every
  // non-digit to one canonical numeric form, then validate so we never store a
  // malformed BMDC. (We avoid the shared `normalizeBmdc`, which keeps the dental
  // "A-" prefix for live registrations.)
  const regDigits = (data.reg_no == null ? "" : String(data.reg_no)).replace(/\D/g, "");
  const bmdc = isValidBmdcFormat(regDigits) ? regDigits : undefined;
  if (!bmdc) warnings.push("no valid reg_no (BMDC) on source record");

  // designation / institute from the current (else most-recent) experience.
  const exps = data.experiences ?? [];
  const cur = exps.find((e) => e?.is_current) ?? exps[0];
  const designation = cur?.designation?.trim() || undefined;
  const institute = cur?.organization_name?.trim() || undefined;

  const nameKey = normalizeNameForMatch(parsedName.displayName) ?? undefined;

  return {
    dedupKeys: { nameKey, bmdc },
    fields: {
      name: parsedName,
      gender,
      bio: cleanBio(data.bio),
      bmdcNumber: bmdc,
      qualifications: qualifications.length ? qualifications : undefined,
      specialties: specialties.length ? specialties : undefined,
      subSpecialties: subSpecialties.length ? subSpecialties : undefined,
      // chambers intentionally omitted — DocTime is telemedicine-only (see header).
      designation,
      institute,
      externalImageUrl: user.profile_photo ?? undefined,
    },
    sourceMeta: {
      source: DOCTIME_PROVIDER,
      sourceId: String(id),
      sourceUrl: doctimeSourceUrl(id),
      scrapedAt,
      confidence: "high",
    },
    warnings,
  };
}

// Re-export to keep ingest CLI + test imports flat (mirrors ibn-sina.ts).
export { buildSpecialtyLookup } from "../normalize/specialty";
