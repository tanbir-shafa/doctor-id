/**
 * Phase 0b — build the per-source normalized staging files the merge (PR2) consumes.
 *
 * For every source record it:
 *  - reuses the existing provider normalizer for the rich fields (name, gender,
 *    bio, qualifications, languages, schedule, …) and the dedupe keys;
 *  - reshapes the single branch into a **chamber reference** —
 *    `{ chamberLocationId, division, district, area, schedule, floor?, room? }` —
 *    by looking the facility up in the Step A catalog (location is NOT embedded;
 *    the 3 query keys are stamped from the catalog row);
 *  - pairs specialties (`{ canonical, sourceValue, matchConfidence, … }`) by
 *    re-resolving the raw source strings, preserving the original text;
 *  - keeps the verbatim source record under `raw`.
 *
 * Output: `data/normalized/<source>.json` = `{ meta, records[] }`, stamped with a
 * source hash so the merge can detect a stale staging file.
 *
 *   npx tsx scripts/build-normalized.ts                       # both sources
 *   npx tsx scripts/build-normalized.ts --source=ibn-sina
 *   npx tsx scripts/build-normalized.ts --limit=50 --dry-run
 *
 * Pure-functional core (`toNormalizedRecord`) + IO wrapper. No DB, no network.
 * Requires the chamber catalog (`npm run build:chambers`) to exist first.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSpecialtyLookup, resolveSpecialty, type SpecialtyLookup } from "./lib/normalize/specialty";
import { SPECIALTY_CATALOG } from "./lib/specialty-catalog";
import { normalizePopularDoctor, toCanonicalCandidate } from "./lib/providers/popular";
import { normalizeIbnSinaDoctor } from "./lib/providers/ibn-sina";
import { normalizeDoctimeDoctor, type DoctimeEntry } from "./lib/providers/doctime";
import type { CanonicalCandidate } from "./lib/providers/types";
import type { ChamberLocation } from "./build-chamber-catalog";

const ROOT = process.cwd();
const CATALOG_FILE = join(ROOT, "data/chambers/chamber-locations.json");
const OUT_DIR = join(ROOT, "data/normalized");
const SOURCE_FILES = {
  "popular-diagnostic": join(ROOT, "data/popular-diagnostic/doctors.json"),
  "ibn-sina": join(ROOT, "data/ibn-sina/doctors.json"),
  doctime: join(ROOT, "data/doctime/doctors.json"),
} as const;
type SourceName = keyof typeof SOURCE_FILES;

const lookup: SpecialtyLookup = buildSpecialtyLookup(
  SPECIALTY_CATALOG.map((s) => ({ name: s.name, fhirCode: s.fhirCode })),
);

// --- Output shapes (the merge's input contract) ----------------------------

export interface ChamberRef {
  chamberLocationId: string;
  /** Denormalized query keys, stamped from the catalog row (indexed on Doctor). */
  division: string;
  district: string;
  area: string;
  /** Per-doctor. */
  schedule: Array<{ day: string; startTime: string; endTime: string; available: boolean }>;
  floor?: string;
  room?: string;
  isPrimary: boolean;
}

export interface PairedSpecialty {
  canonical: string;
  fhirCode: string | null;
  sourceValue: string;
  sourceProvider: SourceName;
  isPrimary: boolean;
  matchConfidence: "high" | "medium" | "low" | "fallback";
}

export interface NormalizedRecord {
  source: SourceName;
  sourceId: string;
  sourceUrl: string;
  scrapedAt: string;
  dedupKeys: CanonicalCandidate["dedupKeys"];
  doctor: {
    name: CanonicalCandidate["fields"]["name"];
    gender?: CanonicalCandidate["fields"]["gender"];
    bio?: string;
    contact?: CanonicalCandidate["fields"]["contact"];
    languages?: string[];
    qualifications?: CanonicalCandidate["fields"]["qualifications"];
    designation?: string;
    institute?: string;
    externalImageUrl?: string;
    specialties: PairedSpecialty[];
    sourceSpecialties: string[];
    subSpecialties: string[];
    chambers: ChamberRef[];
  };
  raw: unknown;
  warnings: string[];
}

type CatalogIndex = Map<string, ChamberLocation>;

/** Re-resolve raw specialty strings into the paired shape (source + canonical).
 * One entry per distinct source string; the first becomes primary. */
function pairSpecialties(
  rawStrings: string[],
  provider: SourceName,
): { specialties: PairedSpecialty[]; sourceSpecialties: string[]; unmatched: string[] } {
  const specialties: PairedSpecialty[] = [];
  const sourceSpecialties: string[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawStrings) {
    const value = raw.trim();
    if (!value) continue;
    const dedupeKey = value.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    sourceSpecialties.push(value);
    const res = resolveSpecialty(value, lookup);
    if (!res) {
      unmatched.push(value);
      continue;
    }
    specialties.push({
      canonical: res.name,
      fhirCode: res.fhirCode,
      sourceValue: value,
      sourceProvider: provider,
      isPrimary: specialties.length === 0,
      matchConfidence: res.confidence,
    });
  }
  return { specialties, sourceSpecialties, unmatched };
}

/** Build the chamber reference for a record's single branch. Returns the ref, or
 * a missing-id marker the caller turns into a hard build error. */
function buildChamberRef(
  branchId: number | null,
  provider: SourceName,
  schedule: ChamberRef["schedule"],
  floor: string | undefined,
  room: string | undefined,
  catalog: CatalogIndex,
): { ref: ChamberRef } | { missing: string } | null {
  if (branchId == null) return null;
  const id = `${provider}:${branchId}`;
  const loc = catalog.get(id);
  if (!loc) return { missing: id };
  return {
    ref: {
      chamberLocationId: id,
      division: loc.division,
      district: loc.district,
      area: loc.area,
      schedule,
      floor: floor || undefined,
      room: room || undefined,
      isPrimary: true,
    },
  };
}

/** Pure assembler: a normalized candidate + its raw-derived bits → a staging record. */
export function toNormalizedRecord(
  candidate: CanonicalCandidate,
  raw: unknown,
  opts: {
    provider: SourceName;
    branchId: number | null;
    specialtyStrings: string[];
    floor?: string;
    room?: string;
    localPhotoPath?: string | null;
  },
  catalog: CatalogIndex,
): { record: NormalizedRecord; missingChamber?: string } {
  const f = candidate.fields;
  const warnings = [...candidate.warnings];
  const { specialties, sourceSpecialties, unmatched } = pairSpecialties(
    opts.specialtyStrings,
    opts.provider,
  );

  const chambers: ChamberRef[] = [];
  let missingChamber: string | undefined;
  const built = buildChamberRef(
    opts.branchId,
    opts.provider,
    f.chambers?.[0]?.schedule ?? [],
    opts.floor,
    opts.room,
    catalog,
  );
  if (built && "ref" in built) chambers.push(built.ref);
  else if (built && "missing" in built) missingChamber = built.missing;
  else warnings.push("no branch on source record");

  const record: NormalizedRecord = {
    source: opts.provider,
    sourceId: candidate.sourceMeta.sourceId,
    sourceUrl: candidate.sourceMeta.sourceUrl,
    scrapedAt: candidate.sourceMeta.scrapedAt,
    dedupKeys: candidate.dedupKeys,
    doctor: {
      name: f.name,
      gender: f.gender,
      bio: f.bio,
      contact: f.contact,
      languages: f.languages,
      qualifications: f.qualifications,
      designation: f.designation,
      institute: f.institute,
      externalImageUrl: f.externalImageUrl,
      specialties,
      sourceSpecialties,
      subSpecialties: [...(f.subSpecialties ?? []), ...unmatched],
      chambers,
    },
    raw,
    warnings,
  };
  return { record, missingChamber };
}

// --- Per-source extraction --------------------------------------------------

function metaScrapedAt(source: SourceName): string {
  try {
    const meta = JSON.parse(readFileSync(join(ROOT, `data/${source}/meta.json`), "utf8"));
    return String(meta.finishedAt ?? meta.startedAt ?? "");
  } catch {
    return "";
  }
}

function processPopular(records: any[], catalog: CatalogIndex, limit: number | null) {
  const scrapedAt = metaScrapedAt("popular-diagnostic");
  const out: NormalizedRecord[] = [];
  const missing: string[] = [];
  let skipped = 0;
  for (const rec of records) {
    if (limit != null && out.length >= limit) break;
    const detail = rec?.detail;
    if (!detail) {
      skipped++;
      continue;
    }
    const norm = normalizePopularDoctor(detail, rec.id, lookup);
    const candidate = toCanonicalCandidate(norm, scrapedAt);
    if (!candidate) {
      skipped++;
      continue;
    }
    const branchId =
      rec?.branches?.[0]?.branch?.id ?? rec?.branches?.[0]?.branch_id ?? detail?.branches?.[0]?.branch_id ?? null;
    const specialtyStrings = (detail.specialists ?? []).map((s: any) => s?.specialist_name).filter(Boolean);
    const { record, missingChamber } = toNormalizedRecord(
      candidate,
      rec,
      { provider: "popular-diagnostic", branchId, specialtyStrings, localPhotoPath: rec?.localPhotoPath },
      catalog,
    );
    if (missingChamber) missing.push(`${candidate.sourceMeta.sourceId} → ${missingChamber}`);
    out.push(record);
  }
  return { out, missing, skipped };
}

function processIbnSina(records: any[], catalog: CatalogIndex, limit: number | null) {
  const scrapedAt = metaScrapedAt("ibn-sina");
  const out: NormalizedRecord[] = [];
  const missing: string[] = [];
  let skipped = 0;
  for (const doc of records) {
    if (limit != null && out.length >= limit) break;
    const candidate = normalizeIbnSinaDoctor(doc, lookup, scrapedAt);
    if (!candidate) {
      skipped++;
      continue;
    }
    const branch = doc?.branches?.[0];
    const branchId = branch?.branch_id ?? null;
    const specialtyStrings = [
      ...(doc.specialists ?? []).map((s: any) => s?.specialist_name).filter(Boolean),
      ...(doc.specialty ? [doc.specialty] : []),
    ];
    const { record, missingChamber } = toNormalizedRecord(
      candidate,
      doc,
      {
        provider: "ibn-sina",
        branchId,
        specialtyStrings,
        floor: branch?.floor_number,
        room: branch?.room_number,
        localPhotoPath: doc?.localPhotoPath,
      },
      catalog,
    );
    if (missingChamber) missing.push(`${candidate.sourceMeta.sourceId} → ${missingChamber}`);
    out.push(record);
  }
  return { out, missing, skipped };
}

function processDoctime(records: any[], catalog: CatalogIndex, limit: number | null) {
  const scrapedAt = metaScrapedAt("doctime");
  const out: NormalizedRecord[] = [];
  const missing: string[] = [];
  let skipped = 0;
  for (const entry of records as DoctimeEntry[]) {
    if (limit != null && out.length >= limit) break;
    const candidate = normalizeDoctimeDoctor(entry, lookup, scrapedAt);
    if (!candidate) {
      skipped++;
      continue;
    }
    const specialtyStrings = (entry.data?.specialities ?? [])
      .map((s) => s?.name)
      .filter((s): s is string => !!s);
    // DocTime is telemedicine-only → no branch/chamber (branchId: null).
    const { record, missingChamber } = toNormalizedRecord(
      candidate,
      entry,
      {
        provider: "doctime",
        branchId: null,
        specialtyStrings,
        localPhotoPath: entry.localPhotoPath,
      },
      catalog,
    );
    if (missingChamber) missing.push(`${candidate.sourceMeta.sourceId} → ${missingChamber}`);
    out.push(record);
  }
  return { out, missing, skipped };
}

function loadCatalog(): { index: CatalogIndex; count: number } {
  const rows = JSON.parse(readFileSync(CATALOG_FILE, "utf8")) as ChamberLocation[];
  return { index: new Map(rows.map((r) => [r.id, r])), count: rows.length };
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : null;
  const sourceArg = argv.find((a) => a.startsWith("--source="))?.slice("--source=".length) as
    | SourceName
    | undefined;
  const sources: SourceName[] = sourceArg ? [sourceArg] : ["popular-diagnostic", "ibn-sina"];

  const { index: catalog, count: catalogCount } = loadCatalog();
  mkdirSync(OUT_DIR, { recursive: true });
  const allMissing: string[] = [];

  for (const source of sources) {
    const file = SOURCE_FILES[source];
    const buf = readFileSync(file);
    const records = JSON.parse(buf.toString("utf8")) as any[];
    const { out, missing, skipped } =
      source === "popular-diagnostic"
        ? processPopular(records, catalog, limit)
        : source === "doctime"
          ? processDoctime(records, catalog, limit)
          : processIbnSina(records, catalog, limit);
    allMissing.push(...missing);

    const gateEligible = out.filter((r) =>
      r.doctor.specialties.some((s) => s.matchConfidence === "high" || s.matchConfidence === "medium"),
    ).length;
    const withChamber = out.filter((r) => r.doctor.chambers.length > 0).length;
    console.log(
      `\n${source}: ${out.length} records (skipped ${skipped}) — ${withChamber} with chamber, ${gateEligible} gate-eligible specialty`,
    );

    if (dryRun) {
      console.log("  (dry-run: nothing written)");
      console.log(JSON.stringify(out[0], null, 2).slice(0, 1400));
      continue;
    }

    const payload = {
      meta: {
        source,
        generatedAt: new Date().toISOString(),
        sourceFile: `data/${source}/doctors.json`,
        sourceSha1: createHash("sha1").update(buf).digest("hex"),
        sourceCount: records.length,
        recordCount: out.length,
        chamberCatalogCount: catalogCount,
      },
      records: out,
    };
    const outFile = join(OUT_DIR, `${source}.json`);
    writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log(`  → wrote ${out.length} records to ${outFile}`);
  }

  if (allMissing.length > 0) {
    console.error(`\n✗ ${allMissing.length} records reference a chamber not in the catalog:`);
    for (const m of allMissing.slice(0, 20)) console.error(`   ${m}`);
    console.error("Re-run `npm run build:chambers` (catalog drift) and retry.");
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].includes("build-normalized")) {
  main();
}
