/**
 * Step A — build the chamber-location catalog.
 *
 * Extracts the distinct physical facilities (one per `provider:branchId`) from
 * the source dumps, resolves each to a canonical `{ division, district, area }`
 * ONCE, and writes `data/chambers/chamber-locations.json`. This file is the
 * source of truth for the `Chamber` collection (seeded by `scripts/seed.ts`)
 * and is referenced by the unified-merge build via `chamberLocationId`.
 *
 * Design (see .claude/plans/build-unified-plan.md, Step A):
 *  - District/division resolve through the tested 64-district catalog
 *    `@/lib/geo/bd-districts` (canonicalizeDistrict / recoverDistrictFromFreeText).
 *  - Area resolves through the ingest `AREAS` table via `parseBdAddress`, with a
 *    branch-name fallback so every facility gets a locality.
 *  - **Hard assert**: every facility must resolve to a district. An unrecognized
 *    location is a build error (add an alias to bd-districts.ts) — never a null
 *    or a defaulted "Dhaka".
 *
 * Pure-functional core (`buildChamberCatalog`) + thin IO wrapper, so the logic
 * is unit-testable without disk. No DB, no network.
 *
 *   npx tsx scripts/build-chamber-catalog.ts            # write the file
 *   npx tsx scripts/build-chamber-catalog.ts --dry-run  # print summary, write nothing
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseBdAddress } from "./lib/normalize/address";
import {
  canonicalizeDistrict,
  divisionForDistrict,
  recoverDistrictFromFreeText,
} from "@/lib/geo/bd-districts";

const ROOT = process.cwd();
const PD_FILE = join(ROOT, "data/popular-diagnostic/doctors.json");
const IBN_FILE = join(ROOT, "data/ibn-sina/doctors.json");
const OUT_DIR = join(ROOT, "data/chambers");
const OUT_FILE = join(OUT_DIR, "chamber-locations.json");

export type ChamberProvider = "popular-diagnostic" | "ibn-sina";

/** One row of `data/chambers/chamber-locations.json`. Mirrors the `Chamber` model. */
export interface ChamberLocation {
  /** Stable external id, also the FK doctors reference: "popular-diagnostic:1". */
  id: string;
  provider: ChamberProvider;
  branchId: number;
  // Canonical location — the query keys (also denormalized onto Doctor.chambers[]).
  division: string;
  district: string;
  area: string;
  // Display-only (fetched by id at render; never queried).
  name: string;
  address: string;
  sourceCity: string;
  phone?: string;
}

/** A facility as pulled from a source, before location resolution. */
interface RawFacility {
  provider: ChamberProvider;
  branchId: number;
  /** The source's own branch/facility name (PD: "DHANMONDI"; Ibn: full title). */
  rawName: string;
  address: string;
  phone?: string;
}

function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();
}

/** Distinct facilities, keyed by `provider:branchId`. First occurrence wins
 * (verified: exactly one address per branchId in both sources). */
export function extractFacilities(pd: unknown[], ibn: unknown[]): RawFacility[] {
  const byId = new Map<string, RawFacility>();

  for (const rec of pd as Array<Record<string, any>>) {
    const idx = rec?.branches?.[0];
    const detail = rec?.detail?.branches?.[0];
    const branchId = idx?.branch?.id ?? idx?.branch_id ?? detail?.branch_id;
    if (branchId == null) continue;
    const key = `popular-diagnostic:${branchId}`;
    if (byId.has(key)) continue;
    byId.set(key, {
      provider: "popular-diagnostic",
      branchId: Number(branchId),
      rawName: String(idx?.branch?.name ?? detail?.name ?? "").trim(),
      address: String(detail?.map ?? "").trim(),
      phone: detail?.phone ? String(detail.phone).trim() : undefined,
    });
  }

  for (const rec of ibn as Array<Record<string, any>>) {
    const b = rec?.branches?.[0];
    const branchId = b?.branch_id;
    if (branchId == null) continue;
    const key = `ibn-sina:${branchId}`;
    if (byId.has(key)) continue;
    byId.set(key, {
      provider: "ibn-sina",
      branchId: Number(branchId),
      rawName: String(b?.name ?? "").trim(),
      address: String(b?.map ?? "").trim(),
      phone: b?.phone ? String(b.phone).trim() : undefined,
    });
  }

  return [...byId.values()];
}

/** The locality string for a facility. PD's branch name IS the locality; Ibn's is
 * the trailing token after the last comma, cleaned of marketing / qualifier tails
 * ("Jashore. We are ISO…" → "Jashore", "Keraniganj Ltd." → "Keraniganj"). */
function localityOf(f: RawFacility): string {
  if (f.provider === "popular-diagnostic") return f.rawName;
  if (!f.rawName.includes(",")) return "";
  let tail = f.rawName.split(",").pop()!.trim();
  tail = tail.split(/[.\d(){}[\]]| - | – /)[0]!.trim(); // stop at period/digit/paren/dash-clause
  tail = tail.replace(/\b(ltd|limited|pvt)\.?\b/gi, "").trim(); // drop corporate suffixes
  return tail;
}

/** The area (locality). Resolve from the locality ALONE (canonical via AREAS, else
 * the cleaned locality) so an incidental neighborhood in the address can't override
 * the branch's own locality. Falls back to the address only when no locality exists. */
function deriveArea(f: RawFacility, locality: string, district: string): string {
  if (locality) return parseBdAddress(locality).area ?? titleCase(locality);
  return parseBdAddress(f.address).area ?? district;
}

function displayName(f: RawFacility): string {
  if (f.provider === "popular-diagnostic") {
    return `Popular Diagnostic Centre Ltd. ${titleCase(f.rawName)}`.trim();
  }
  return f.rawName; // Ibn facility names are already self-qualified.
}

export interface BuildResult {
  rows: ChamberLocation[];
  errors: Array<{ id: string; rawName: string; address: string }>;
}

/** Pure core: facilities → resolved catalog rows + any resolution failures. */
export function buildChamberCatalog(pd: unknown[], ibn: unknown[]): BuildResult {
  const rows: ChamberLocation[] = [];
  const errors: BuildResult["errors"] = [];

  for (const f of extractFacilities(pd, ibn)) {
    const id = `${f.provider}:${f.branchId}`;
    // Resolve from the branch LOCALITY first (authoritative); the free-text address
    // is a last resort so an incidental district name in the address can't win.
    const locality = localityOf(f);
    const district =
      canonicalizeDistrict(locality) ??
      recoverDistrictFromFreeText(locality) ??
      recoverDistrictFromFreeText(f.rawName) ??
      canonicalizeDistrict(f.address) ??
      recoverDistrictFromFreeText(f.address);
    if (!district) {
      errors.push({ id, rawName: f.rawName, address: f.address });
      continue;
    }
    const division = divisionForDistrict(district)!;
    rows.push({
      id,
      provider: f.provider,
      branchId: f.branchId,
      division,
      district,
      area: deriveArea(f, locality, district),
      name: displayName(f),
      address: f.address,
      sourceCity: f.rawName,
      phone: f.phone,
    });
  }

  rows.sort((a, b) => a.id.localeCompare(b.id));
  return { rows, errors };
}

function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  const pd = JSON.parse(readFileSync(PD_FILE, "utf8")) as unknown[];
  const ibn = JSON.parse(readFileSync(IBN_FILE, "utf8")) as unknown[];

  const { rows, errors } = buildChamberCatalog(pd, ibn);

  if (errors.length > 0) {
    console.error(`✗ ${errors.length} facilities did not resolve to a district:`);
    for (const e of errors) console.error(`   ${e.id}  name="${e.rawName}"  map="${e.address}"`);
    console.error("Add an alias to src/lib/geo/bd-districts.ts and re-run.");
    process.exit(1);
  }

  const byProvider = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.provider] = (acc[r.provider] ?? 0) + 1;
    return acc;
  }, {});
  const districts = new Set(rows.map((r) => r.district));
  console.log(`✓ ${rows.length} chambers resolved (100%) across ${districts.size} districts`);
  console.table(byProvider);

  if (dryRun) {
    console.log("(dry-run: nothing written)");
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(rows, null, 2) + "\n", "utf8");
  console.log(`→ wrote ${rows.length} rows to ${OUT_FILE}`);
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && process.argv[1].includes("build-chamber-catalog")) {
  main();
}
