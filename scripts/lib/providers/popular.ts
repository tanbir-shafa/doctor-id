/**
 * Popular Diagnostic provider normalizer.
 *
 * Reads the on-disk JSON dump at `data/popular-diagnostic/` (downloaded by
 * `scripts/fetch-popular-diagnostic.ts`) and maps it into the canonical
 * shape we feed to the Doctor model's idempotent upsert.
 *
 * The pure mapping logic lives in `normalizePopularDoctor` for testability.
 * Photo upload is `uploadPopularPhoto` — it touches S3 + the File collection
 * so it lives outside the pure mapper.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Types } from "mongoose";
import { File, FILE_LINKED_ENTITY_TYPE, FILE_VISIBILITY, FILE_SECURITY_CLASS } from "@/lib/db/models";
import { uploadBufferToS3 } from "@/lib/s3/s3-service";
import { bucketFor, publicObjectUrl } from "@/lib/s3/buckets";
import { normalizeBdPhone } from "../normalize/phone";
import { parseDoctorName, normalizeNameForMatch } from "../normalize/name";
import {
  buildSpecialtyLookup as buildSpecialtyLookupFromCanon,
  resolveSpecialty as resolveSpecialtyShared,
  type SpecialtyLookup as SharedSpecialtyLookup,
  type CanonicalSpecialty,
} from "../normalize/specialty";
import { to24h, normalizeDay } from "../normalize/schedule";
import type { CanonicalCandidate } from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "popular-diagnostic");
const DETAIL_DIR = path.join(DATA_DIR, "details");
const PHOTO_DIR = path.join(DATA_DIR, "photos");

export const POPULAR_PROVIDER = "popular-diagnostic";

// --- Raw shapes (loosely typed; data on disk is the source of truth) ---

interface PopularBranch {
  branch_id: number;
  name: string;
  map: string;
  phone: string;
  telephones?: unknown[];
}

interface PopularScheduleSlot {
  key?: number;
  day: string;
  start_time: string;
  end_time: string;
  appointment_type?: string;
}

interface PopularSpecialist {
  specialist_id: number;
  specialist_name: string;
}

export interface PopularDetail {
  name: string;
  mobile: string | null;
  email: string | null;
  image: string | null;
  degree: string | null;
  gender: string | null;
  education?: string | null;
  experience_summery?: string | null;
  practicing_branches?: string | null;
  schedule?: PopularScheduleSlot[];
  branches?: PopularBranch[];
  specialists?: PopularSpecialist[];
}

// --- Specialty lookup context ---
//
// As of T3 the alias table and resolver moved to scripts/lib/normalize/
// specialty.ts so all providers share one source of truth. The exports
// below are compat shims for seed.ts + the existing popular.test.ts.

export type SpecialtyLookup = SharedSpecialtyLookup;

export function buildSpecialtyLookup(
  specialties: Array<{ name: string; fhirCode?: string | null }>,
): SpecialtyLookup {
  const canon: CanonicalSpecialty[] = specialties.map((s) => ({
    name: s.name,
    fhirCode: s.fhirCode ?? null,
  }));
  return buildSpecialtyLookupFromCanon(canon);
}

function resolveSpecialty(
  rawName: string,
  lookup: SpecialtyLookup,
): { name: string; fhirCode: string | null } | null {
  const r = resolveSpecialtyShared(rawName, lookup);
  return r ? { name: r.name, fhirCode: r.fhirCode } : null;
}

// `parseClockTime` is kept as a re-export of the shared `to24h` so existing
// imports (tests + future callers) keep working. New code should import
// from `scripts/lib/normalize/schedule.ts` directly.
export const parseClockTime = to24h;

export function popularSourceUrl(id: number | string): string {
  return `https://populardiagnostic.com/doctor/${id}`;
}

// --- I/O ---

export async function loadPopularIndex(): Promise<number[]> {
  const buf = await fs.readFile(path.join(DATA_DIR, "doctor-ids.json"), "utf8");
  const ids = JSON.parse(buf);
  if (!Array.isArray(ids)) throw new Error("doctor-ids.json is not an array");
  return ids;
}

export async function loadPopularDetail(id: number): Promise<PopularDetail> {
  const buf = await fs.readFile(path.join(DETAIL_DIR, `${id}.json`), "utf8");
  return JSON.parse(buf);
}

// --- Pure mapping ---

export interface NormalizedDoctor {
  id: number;
  parsedName: ReturnType<typeof parseDoctorName>;
  gender: "male" | "female" | "other" | "prefer_not_to_say";
  bio: string;
  contact: { publicPhone: string | null; publicEmail: string | null };
  qualifications: Array<{ degree: string; institution: string; year: number; country: string }>;
  specialties: Array<{ name: string; isPrimary: boolean; fhirCode: string | null }>;
  subSpecialties: string[];
  chambers: Array<{
    name: string;
    address: string;
    area: string;
    city: string;
    division: string;
    coordinates: { lat: number | null; lng: number | null };
    phone: string | null;
    schedule: Array<{ day: string; startTime: string; endTime: string; available: boolean }>;
    consultationFee: { amount: number; currency: "BDT" };
    isPrimary: boolean;
  }>;
  externalImageUrl: string | null;
  sourceUrl: string;
  warnings: string[];
}

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Pure JSON → normalized shape. No DB writes, no I/O. Tests run against
 * fixtures in `data/popular-diagnostic/details/`.
 *
 * The returned `warnings` array carries non-fatal issues (e.g. unmatched
 * specialty, malformed schedule slot). The seed loop logs them.
 */
export function normalizePopularDoctor(
  detail: PopularDetail,
  id: number,
  specialtyLookup: SpecialtyLookup,
): NormalizedDoctor {
  const warnings: string[] = [];
  const parsedName = parseDoctorName(detail.name);
  if (!parsedName) warnings.push(`name unparseable: ${JSON.stringify(detail.name)}`);

  const publicPhone = normalizeBdPhone(detail.mobile);
  if (detail.mobile && !publicPhone) warnings.push(`phone invalid: ${detail.mobile}`);

  const gender = mapGender(detail.gender);
  const bio = (detail.experience_summery ?? "").slice(0, 2000);

  // Qualifications: split the degree string on commas; we don't have
  // institution or year from Popular, so fall back to placeholders that
  // satisfy the schema. These can be edited by the doctor post-claim.
  const qualifications: NormalizedDoctor["qualifications"] = [];
  if (detail.degree) {
    const parts = detail.degree
      .split(/[,;]/)
      .map((p) => p.trim().replace(/\.$/, ""))
      .filter(Boolean);
    for (const part of parts) {
      qualifications.push({
        degree: part,
        institution: "Unknown",
        year: CURRENT_YEAR,
        country: "Bangladesh",
      });
    }
  }

  // Specialties: case-insensitive lookup. Misses go into subSpecialties so
  // the data isn't lost.
  const specialties: NormalizedDoctor["specialties"] = [];
  const subSpecialties: string[] = [];
  const seenSpec = new Set<string>();
  for (const s of detail.specialists ?? []) {
    const key = s.specialist_name.toLowerCase();
    if (seenSpec.has(key)) continue;
    seenSpec.add(key);
    const match = resolveSpecialty(s.specialist_name, specialtyLookup);
    if (match) {
      // De-dup against earlier alias collisions (e.g. "Liver Medicine" +
      // "Gastroenterology" both mapping to Gastroenterology).
      if (!specialties.some((x) => x.name === match.name)) {
        specialties.push({
          name: match.name,
          isPrimary: specialties.length === 0,
          fhirCode: match.fhirCode,
        });
      }
    } else {
      subSpecialties.push(s.specialist_name);
      warnings.push(`specialty unmatched: ${s.specialist_name}`);
    }
  }

  // Chambers: one per branch. Schedule from `detail.schedule` is not branch-
  // keyed in Popular's API, so the entire schedule attaches to the FIRST
  // (primary) branch. Other branches get an empty schedule.
  const branches = detail.branches ?? [];
  type ScheduleSlot = { day: string; startTime: string; endTime: string; available: boolean };
  const schedule: ScheduleSlot[] = [];
  for (const slot of detail.schedule ?? []) {
    const day = normalizeDay(slot.day);
    const startTime = to24h(slot.start_time);
    const endTime = to24h(slot.end_time);
    if (!day || !startTime || !endTime) {
      warnings.push(
        `schedule slot dropped: ${JSON.stringify({ day: slot.day, start: slot.start_time, end: slot.end_time })}`,
      );
      continue;
    }
    schedule.push({ day, startTime, endTime, available: true });
  }

  const chambers: NormalizedDoctor["chambers"] = branches.map((b, idx) => ({
    name: `Popular Diagnostic — ${titleCase(b.name)}`,
    address: b.map || titleCase(b.name),
    area: titleCase(b.name),
    city: "Dhaka",
    division: "Dhaka",
    coordinates: { lat: null, lng: null },
    phone: b.phone ? b.phone.trim() : null,
    schedule: idx === 0 ? schedule : [],
    consultationFee: { amount: 0, currency: "BDT" },
    isPrimary: idx === 0,
  }));

  return {
    id,
    parsedName,
    gender,
    bio,
    contact: { publicPhone, publicEmail: detail.email },
    qualifications,
    specialties,
    subSpecialties,
    chambers,
    externalImageUrl: detail.image ?? null,
    sourceUrl: popularSourceUrl(id),
    warnings,
  };
}

function mapGender(raw: unknown): NormalizedDoctor["gender"] {
  if (typeof raw !== "string") return "prefer_not_to_say";
  const v = raw.trim().toLowerCase();
  if (v === "male" || v === "m") return "male";
  if (v === "female" || v === "f") return "female";
  return "prefer_not_to_say";
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// --- T4: CanonicalCandidate stream ---
//
// Used by the unified ingest pipeline (T8/T9). seed.ts still consumes the
// legacy `normalizePopularDoctor` shape directly; both layers coexist until
// T9 swaps the CLI over.

const SCRAPED_AT_FALLBACK = "1970-01-01T00:00:00.000Z";

async function loadPopularScrapedAt(): Promise<string> {
  try {
    const meta = JSON.parse(await fs.readFile(path.join(DATA_DIR, "meta.json"), "utf8"));
    if (typeof meta.finishedAt === "string") return meta.finishedAt;
  } catch {
    // meta.json missing — non-fatal.
  }
  return SCRAPED_AT_FALLBACK;
}

/**
 * Convert a NormalizedDoctor into a CanonicalCandidate. Pure — given the
 * same input, always returns the same output.
 */
export function toCanonicalCandidate(
  norm: NormalizedDoctor,
  scrapedAt: string,
): CanonicalCandidate | null {
  if (!norm.parsedName) return null;
  const phone = norm.contact.publicPhone ?? undefined;
  const nameKey = normalizeNameForMatch(norm.parsedName.displayName) ?? undefined;

  const primary = norm.specialties[0]?.name?.toLowerCase();
  const district = norm.chambers[0]?.city?.toLowerCase();
  const specialtyDistrictKey = primary && district ? `${primary}|${district}` : undefined;

  const chamberAddressKeys = norm.chambers
    .map((c) => `${c.area}|${c.city}`.toLowerCase())
    .filter(Boolean);

  return {
    dedupKeys: {
      phone,
      nameKey,
      chamberAddressKeys,
      specialtyDistrictKey,
    },
    fields: {
      name: norm.parsedName,
      gender: norm.gender,
      bio: norm.bio,
      contact: {
        publicPhone: norm.contact.publicPhone ?? undefined,
        publicEmail: norm.contact.publicEmail ?? undefined,
      },
      qualifications: norm.qualifications,
      specialties: norm.specialties.map((s) => ({
        name: s.name,
        isPrimary: s.isPrimary,
        fhirCode: s.fhirCode ?? undefined,
      })),
      subSpecialties: norm.subSpecialties,
      chambers: norm.chambers.map((c) => ({
        name: c.name,
        address: c.address,
        area: c.area,
        district: c.city,
        division: c.division,
        coordinates:
          c.coordinates.lat != null && c.coordinates.lng != null
            ? {lat: c.coordinates.lat, lng: c.coordinates.lng}
            : undefined,
        phone: c.phone ?? undefined,
        schedule: c.schedule.map((s) => ({
          day: s.day as "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat",
          startTime: s.startTime,
          endTime: s.endTime,
          available: s.available,
        })),
        consultationFee: c.consultationFee,
        isPrimary: c.isPrimary,
      })),
      externalImageUrl: norm.externalImageUrl ?? undefined,
    },
    sourceMeta: {
      source: "popular-diagnostic",
      sourceId: String(norm.id),
      sourceUrl: norm.sourceUrl,
      scrapedAt,
      confidence: "high",
    },
    warnings: norm.warnings,
  };
}

/**
 * Async iterator over every doctor in data/popular-diagnostic/. Yields
 * CanonicalCandidates ready for the dedupe/merge engine.
 *
 * `specialtyLookup` is injected so the caller controls which canonical
 * specialties to match against (typically built from the seeded Specialty
 * collection).
 */
export async function* loadPopular(opts: {
  specialtyLookup: SpecialtyLookup;
  limit?: number;
}): AsyncIterable<CanonicalCandidate> {
  const ids = await loadPopularIndex();
  const scrapedAt = await loadPopularScrapedAt();
  const take = opts.limit ?? ids.length;
  let emitted = 0;
  for (const id of ids) {
    if (emitted >= take) return;
    let detail: PopularDetail;
    try {
      detail = await loadPopularDetail(id);
    } catch {
      continue;
    }
    const norm = normalizePopularDoctor(detail, id, opts.specialtyLookup);
    const candidate = toCanonicalCandidate(norm, scrapedAt);
    if (candidate) {
      emitted++;
      yield candidate;
    }
  }
}

// --- Photo upload (touches S3 + File collection) ---

export interface PhotoUploadResult {
  /** Set when an actual S3 upload + File doc creation succeeded. */
  fileId: Types.ObjectId | null;
  url: string | null;
  s3Bucket: string;
  s3Key: string;
}

const PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

/**
 * Locate the local photo file for a Popular doctor, upload it to S3, and
 * create a File document linking it to the Doctor.
 *
 * If S3 is not configured, returns a legacy fallback that points the
 * PhotoSchema at the external Popular URL with sentinel `s3Bucket` and
 * `s3Key` values. The File document is not created in that case.
 *
 * Returns `null` if no local photo file exists for this id (5 known cases
 * per `meta.json`).
 */
export async function uploadPopularPhoto(opts: {
  id: number;
  doctorId: Types.ObjectId;
  adminId: Types.ObjectId;
  externalImageUrl: string | null;
}): Promise<PhotoUploadResult | null> {
  let localPath: string | null = null;
  let ext = "";
  for (const e of PHOTO_EXTENSIONS) {
    const candidate = path.join(PHOTO_DIR, `${opts.id}.${e}`);
    try {
      await fs.access(candidate);
      localPath = candidate;
      ext = e === "jpeg" ? "jpg" : e;
      break;
    } catch {
      // try next ext
    }
  }
  if (!localPath) return null;

  const body = await fs.readFile(localPath);
  const sha256 = crypto.createHash("sha256").update(body).digest("hex");
  const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const finalFileName = `${sha256.slice(0, 16)}.${ext}`;
  const key = `doctors/${opts.doctorId.toString()}/photo/${finalFileName}`;

  const bucket = bucketFor("public");
  const uploaded = bucket ? await uploadBufferToS3({ buffer: body, bucket, key, mimeType }) : null;

  if (bucket && uploaded) {
    const fileDoc = await File.create({
      linkedEntityType: FILE_LINKED_ENTITY_TYPE.DOCTOR,
      linkedEntityId: opts.doctorId,
      title: "Doctor profile photo",
      description: null,
      category: "doctor_profile_photo",
      visibility: FILE_VISIBILITY.PUBLIC,
      securityClass: FILE_SECURITY_CLASS.PUBLIC_ASSET,
      originalFileName: `${opts.id}.${ext}`,
      finalFileName,
      mimeType,
      ext,
      sizeBytes: body.length,
      sha256,
      s3Bucket: bucket,
      s3Key: uploaded.key,
      s3VersionId: null,
      uploadedBy: opts.adminId,
    });
    return {
      fileId: fileDoc._id as unknown as Types.ObjectId,
      url: publicObjectUrl(bucket, uploaded.key),
      s3Bucket: bucket,
      s3Key: uploaded.key,
    };
  }

  // No S3 creds — fall back to the external Popular URL with sentinel
  // bucket/key values so the required PhotoSchema fields still pass
  // validation. Document this in CLAUDE.md if it ever turns into real prod
  // behavior; for dev, it's the expected path.
  return {
    fileId: null,
    url: opts.externalImageUrl,
    s3Bucket: "legacy-external",
    s3Key: `pd-${opts.id}`,
  };
}
