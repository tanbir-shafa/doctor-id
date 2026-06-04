/**
 * Seed the unified dataset (`data/unified/doctors.json`, produced by
 * `npm run build:unified`) into the Doctor collection.
 *
 *  - Chambers REFERENCE the seeded Chamber collection by `chamberLocationId`;
 *    display fields (name/address/phone/coords) are cached from Chamber for
 *    joinless SSR reads. `district` holds the canonical 64-district; `area`/`division`
 *    are the denormalized query keys.
 *  - Specialties are the canonical refs (deduped); the verbatim source strings are
 *    preserved in `sourceSpecialty`.
 *  - Idempotent by `(sourceProvider="unified", sourceProviderId=unifiedId)`.
 *
 * Requires `npm run seed` (Chamber + Specialty catalogs) to have run first.
 * No photos are uploaded here (kept fast / AWS-free) — run the photo step separately.
 *
 *   npm run seed:unified
 *   npm run seed:unified -- --limit=100 --dry-run
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import mongoose from "mongoose";
import { dbConnect, dbDisconnect } from "@/lib/db/mongoose";
import { Doctor, Chamber } from "@/lib/db/models";
import { generateSlug } from "@/lib/utils/slug";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV is production.");
  process.exit(1);
}

const PROVIDER = "unified";
const UNIFIED_FILE = join(process.cwd(), "data/unified/doctors.json");

interface UnifiedDoctor {
  unifiedId: string;
  matchKey: { tier: string };
  canonical: {
    name: { prefix: string; first: string; last: string; displayName: string };
    gender?: string;
    bio?: string;
    contact?: { publicPhone?: string; publicEmail?: string };
    languages?: string[];
    qualifications?: Array<{ degree: string; institution: string; year: number; country: string }>;
    designation?: string;
    institute?: string;
    specialties: Array<{ canonical: string; fhirCode: string | null; isPrimary: boolean }>;
    sourceSpecialties: string[];
    subSpecialties: string[];
    chambers: Array<{
      chamberLocationId: string;
      division: string;
      district: string;
      area: string;
      schedule: Array<{ day: string; startTime: string; endTime: string; available: boolean }>;
      floor?: string;
      room?: string;
      isPrimary: boolean;
    }>;
  };
  sources: Array<{ sourceUrl: string }>;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  return {
    dryRun: argv.includes("--dry-run"),
    limit: limitArg ? Number(limitArg.slice("--limit=".length)) : null,
  };
}

function specialtyRefs(specs: UnifiedDoctor["canonical"]["specialties"]) {
  const seen = new Set<string>();
  const refs: Array<{ name: string; isPrimary: boolean; fhirCode: string | null }> = [];
  for (const s of specs) {
    if (seen.has(s.canonical)) continue;
    seen.add(s.canonical);
    refs.push({ name: s.canonical, isPrimary: !!s.isPrimary, fhirCode: s.fhirCode ?? null });
  }
  if (refs.length && !refs.some((r) => r.isPrimary)) refs[0].isPrimary = true;
  return refs;
}

function chamberSubdocs(
  refs: UnifiedDoctor["canonical"]["chambers"],
  chamberById: Map<string, any>,
) {
  const out: any[] = [];
  for (const r of refs) {
    const c = chamberById.get(r.chamberLocationId);
    if (!c) continue; // facility not in the seeded catalog — skip (counted as missing)
    out.push({
      chamberLocationId: r.chamberLocationId,
      name: c.name,
      address: (c.address && String(c.address).trim()) || c.name, // required + non-empty
      area: r.area,
      district: r.district, // canonical 64-district (the indexed location key)
      division: r.division,
      coordinates: c.coordinates ?? { lat: null, lng: null },
      phone: c.phone ?? null,
      schedule: r.schedule ?? [],
      floor: r.floor ?? null,
      room: r.room ?? null,
      isPrimary: !!r.isPrimary,
    });
  }
  return out;
}

async function main() {
  const { dryRun, limit } = parseArgs();
  console.log(`→ Seeding unified doctors${dryRun ? " (dry-run)" : ""}`);
  await dbConnect();

  const chambers = await Chamber.find({}).lean();
  const chamberById = new Map<string, any>(chambers.map((c: any) => [c.externalId, c]));
  console.log(`  chambers in catalog: ${chamberById.size}`);
  if (chamberById.size === 0) {
    console.error("  ✗ Chamber collection is empty — run `npm run seed` first.");
    await dbDisconnect();
    process.exit(1);
  }

  const all = JSON.parse(readFileSync(UNIFIED_FILE, "utf8")) as UnifiedDoctor[];
  const take = limit ? all.slice(0, limit) : all;

  // Slug de-dup (also covers re-runs against existing rows).
  const usedSlugs = new Set<string>();
  for (const d of await Doctor.find({}).select({ slug: 1 }).lean()) usedSlugs.add((d as any).slug);

  let ops: any[] = [];
  let withChamber = 0;
  let missingChamber = 0;
  const BATCH = 1000;
  const flush = async () => {
    if (ops.length && !dryRun) await Doctor.bulkWrite(ops, { ordered: false });
    ops = [];
  };

  for (const u of take) {
    const primary =
      u.canonical.specialties.find((s) => s.isPrimary)?.canonical ?? u.canonical.specialties[0]?.canonical;
    let slug = generateSlug({ displayName: u.canonical.name.displayName, primarySpecialty: primary });
    if (usedSlugs.has(slug)) slug = `${slug}-u${u.unifiedId.slice(0, 6)}`;
    if (usedSlugs.has(slug)) slug = `${slug}-${u.unifiedId}`;
    usedSlugs.add(slug);

    const chamberDocs = chamberSubdocs(u.canonical.chambers, chamberById);
    if (chamberDocs.length) withChamber++;
    else missingChamber++;

    const set: Record<string, unknown> = {
      name: u.canonical.name,
      gender: u.canonical.gender ?? "prefer_not_to_say",
      bio: u.canonical.bio ?? "",
      contact: {
        publicPhone: u.canonical.contact?.publicPhone ?? null,
        publicEmail: u.canonical.contact?.publicEmail ?? null,
      },
      qualifications: u.canonical.qualifications ?? [],
      specialties: specialtyRefs(u.canonical.specialties),
      sourceSpecialty: (u.canonical.sourceSpecialties ?? []).join(" / ").slice(0, 200) || null,
      subSpecialties: u.canonical.subSpecialties ?? [],
      designation: u.canonical.designation ?? null,
      institute: u.canonical.institute ?? null,
      chambers: chamberDocs,
      sourceUrl: u.sources[0]?.sourceUrl ?? null,
    };
    if (u.canonical.languages?.length) set.languages = u.canonical.languages;

    ops.push({
      updateOne: {
        filter: { sourceProvider: PROVIDER, sourceProviderId: u.unifiedId },
        update: {
          $setOnInsert: {
            slug,
            ownerType: "doctor",
            ownerId: new mongoose.Types.ObjectId(),
            userId: null,
            isClaimed: false,
            status: "published",
            sourceProvider: PROVIDER,
            sourceProviderId: u.unifiedId,
          },
          $set: set,
        },
        upsert: true,
      },
    });
    if (ops.length >= BATCH) await flush();
  }
  await flush();

  if (!dryRun) await Doctor.syncIndexes();
  const total = dryRun ? 0 : await Doctor.countDocuments();
  console.log(`\n✓ processed ${take.length} unified docs — ${withChamber} with chamber, ${missingChamber} missing`);
  console.log(`  Doctor collection now: ${total}`);
  await dbDisconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
