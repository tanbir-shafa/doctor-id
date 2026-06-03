/**
 * Seed script — bootstraps the database to a usable state.
 *
 * Default mode (`npm run seed`):
 *   - Upserts the bootstrap admin user.
 *   - Upserts the canonical 36-specialty catalog.
 *   - Does NOT create fake doctor profiles.
 *   - Does NOT drop or reset any collection — safe to re-run.
 *
 * Ingestion mode (`npm run seed -- --source=popular-diagnostic`):
 *   - Reads the on-disk dump at `data/popular-diagnostic/` and upserts
 *     unclaimed Doctor profiles.
 *   - Idempotent by `(sourceProvider, sourceProviderId)`.
 *   - Refuses to run if NODE_ENV === 'production' (mirrors the seed
 *     guardrail).
 *
 * Common flags:
 *   --limit=N      cap ingestion at N records (ignored in default mode)
 *   --dry-run      log what would be inserted/updated, no DB writes
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { dbConnect, dbDisconnect } from "@/lib/db/mongoose";
import { User, Specialty, Chamber, Doctor, FILE_VISIBILITY } from "@/lib/db/models";
import type { ChamberLocation } from "./build-chamber-catalog";
import { generateSlug } from "@/lib/utils/slug";
import { SPECIALTY_CATALOG as SPECIALTIES } from "./lib/specialty-catalog";
import {
  POPULAR_PROVIDER,
  buildSpecialtyLookup,
  loadPopularDetail,
  loadPopularIndex,
  normalizePopularDoctor,
  uploadPopularPhoto,
} from "./lib/providers/popular";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV is production. Set to development to run.");
  process.exit(1);
}

interface CliArgs {
  source: "default" | "popular-diagnostic";
  limit: number | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { source: "default", limit: null, dryRun: false };
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--source=")) {
      const v = a.slice("--source=".length);
      if (v === "popular-diagnostic") args.source = v;
      else if (v === "default") args.source = "default";
      else throw new Error(`Unknown --source value: ${v}`);
    } else if (a.startsWith("--limit=")) {
      const n = Number(a.slice("--limit=".length));
      if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --limit: ${a}`);
      args.limit = n;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Bootstrap helpers (shared by default mode + Popular ingestion)
// ---------------------------------------------------------------------------
// (The specialty catalog now lives in ./lib/specialty-catalog.ts — the single
//  source of truth shared by this seed and the DB-less normalize pipeline.)

/**
 * Upsert the canonical specialty catalog. Idempotent — keyed by `slug`.
 *
 * Sets `active: true` so a re-run never strands a row in an inactive
 * state. Deactivating a specialty is intentionally a manual DB edit
 * (we don't want a hot-fix re-seed to flip a flag the admin chose).
 *
 * Returns the list in the same shape the Popular ingestion expects.
 */
async function ensureSpecialties(): Promise<Array<{ name: string; fhirCode: string }>> {
  for (const s of SPECIALTIES) {
    await Specialty.updateOne(
      { slug: s.slug },
      { $set: { ...s, active: true } },
      { upsert: true },
    );
  }
  return SPECIALTIES.map((s) => ({ name: s.name, fhirCode: s.fhirCode }));
}

/**
 * Upsert the chamber (facility) catalog from `data/chambers/chamber-locations.json`,
 * keyed idempotently by `externalId`. Run BEFORE doctor ingestion so doctors can
 * reference chambers. Gracefully no-ops (with a hint) if the file is absent —
 * build it with `npm run build:chambers`.
 */
async function ensureChambers(dryRun = false): Promise<number> {
  const file = join(process.cwd(), "data/chambers/chamber-locations.json");
  let rows: ChamberLocation[];
  try {
    rows = JSON.parse(readFileSync(file, "utf8")) as ChamberLocation[];
  } catch {
    console.warn(
      "  ⚠ no data/chambers/chamber-locations.json — run `npm run build:chambers` first; skipping chambers.",
    );
    return 0;
  }
  if (dryRun) return rows.length;
  for (const c of rows) {
    await Chamber.updateOne(
      { externalId: c.id },
      {
        $set: {
          externalId: c.id,
          provider: c.provider,
          branchId: c.branchId,
          division: c.division,
          district: c.district,
          area: c.area,
          name: c.name,
          address: c.address,
          sourceCity: c.sourceCity,
          phone: c.phone ?? null,
        },
      },
      { upsert: true },
    );
  }
  return rows.length;
}

/**
 * Upsert the bootstrap admin user. Email comes from `ADMIN_EMAILS[0]`
 * when set, otherwise the default `admin@doctor.id.bd`. The password is
 * set only on insert — re-running never overwrites a rotated password.
 *
 * `approved: true` is set explicitly so the approval gate (which defaults
 * new doctor accounts to false) never traps the admin.
 */
async function ensureBootstrapAdmin(): Promise<{ adminId: mongoose.Types.ObjectId; email: string }> {
  const adminEmail = (
    process.env.ADMIN_EMAILS?.split(",")[0]?.trim() || "admin@doctor.id.bd"
  ).toLowerCase();
  const adminPassword = "ChangeMe!2026";
  const adminHash = await bcrypt.hash(adminPassword, 12);
  const admin = await User.findOneAndUpdate(
    { email: adminEmail },
    {
      $set: {
        email: adminEmail,
        role: "admin",
        emailVerified: new Date(),
        approved: true,
      },
      $setOnInsert: { passwordHash: adminHash },
    },
    { upsert: true, returnDocument: "after" },
  ).lean();
  if (!admin) throw new Error("Failed to bootstrap admin user");
  return { adminId: admin._id as unknown as mongoose.Types.ObjectId, email: adminEmail };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("→ Connecting to Mongo…");
  await dbConnect();

  if (args.source === "popular-diagnostic") {
    await runPopularIngestion(args);
    return;
  }

  // Default mode: upsert admin + specialties only. No fake doctors, no
  // destructive ops. Re-running is always safe.
  console.log("→ Bootstrap mode (admin + specialty catalog)");
  if (args.dryRun) console.log("  (dry-run: no DB writes will be persisted)");

  if (args.dryRun) {
    console.log(`  [dry] would upsert admin from ADMIN_EMAILS or default`);
    console.log(`  [dry] would upsert ${SPECIALTIES.length} specialties`);
    console.log(`  [dry] would upsert chambers from data/chambers/chamber-locations.json`);
    return;
  }

  const { adminId: _adminId, email: adminEmail } = await ensureBootstrapAdmin();
  console.log(`  ✓ admin: ${adminEmail}`);

  const specs = await ensureSpecialties();
  await Specialty.syncIndexes();
  console.log(`  ✓ ${specs.length} specialties ready`);

  const chamberCount = await ensureChambers();
  await Chamber.syncIndexes();
  console.log(`  ✓ ${chamberCount} chambers ready`);

  const counts = {
    specialties: await Specialty.countDocuments(),
    activeSpecialties: await Specialty.countDocuments({ active: true }),
    chambers: await Chamber.countDocuments(),
    admins: await User.countDocuments({ role: "admin" }),
    doctors: await Doctor.countDocuments({}),
  };
  console.log("\n✓ Seed complete:");
  console.table(counts);
  console.log(`  Admin login: ${adminEmail} / ChangeMe!2026 at /auth/admin/login`);
  console.log(
    "  Tip: run `npm run seed -- --source=popular-diagnostic` to ingest real BD doctor profiles.",
  );
}

// ---------------------------------------------------------------------------
// Ingestion mode: Popular Diagnostic
// ---------------------------------------------------------------------------

async function runPopularIngestion(args: CliArgs) {
  console.log("→ Popular Diagnostic ingestion mode");
  if (args.dryRun) console.log("  (dry-run: no DB writes will be persisted)");

  const { adminId, email: adminEmail } = await ensureBootstrapAdmin();
  console.log(`  ✓ admin: ${adminEmail}`);

  const specialties = await ensureSpecialties();
  const specialtyLookup = buildSpecialtyLookup(specialties);
  const chamberCount = await ensureChambers(args.dryRun);
  if (!args.dryRun) await Chamber.syncIndexes();
  console.log(`  ✓ ${chamberCount} chambers ready`);
  console.log(`  ✓ ${specialties.length} specialties ready`);

  await Doctor.syncIndexes();

  const allIds = await loadPopularIndex();
  const ids = args.limit ? allIds.slice(0, args.limit) : allIds;
  console.log(`→ Ingesting ${ids.length}${args.limit ? ` (capped at --limit=${args.limit})` : ""} of ${allIds.length} doctors`);

  const stats = {
    totalSeen: 0,
    inserted: 0,
    updated: 0,
    skippedInvalid: 0,
    photosUploaded: 0,
    photosLegacyExternal: 0,
    photosMissingFile: 0,
    warnings: 0,
  };

  for (const id of ids) {
    stats.totalSeen++;
    let detail;
    try {
      detail = await loadPopularDetail(id);
    } catch (e) {
      console.warn(`  ⚠ detail load failed for id=${id}: ${(e as Error).message}`);
      stats.skippedInvalid++;
      continue;
    }
    const norm = normalizePopularDoctor(detail, id, specialtyLookup);
    stats.warnings += norm.warnings.length;

    if (!norm.parsedName) {
      stats.skippedInvalid++;
      continue;
    }

    const primarySpecialty = norm.specialties[0]?.name;
    let slug = generateSlug({ displayName: norm.parsedName.displayName, primarySpecialty });
    // Reserve a sentinel slug suffix for collisions — `pd<id>` is unique
    // within the Popular dataset and short enough to keep URLs clean.
    const slugAlternate = `${slug}-pd${id}`;

    if (args.dryRun) {
      console.log(`  [dry] id=${id} → ${norm.parsedName.displayName} / ${primarySpecialty ?? "(no specialty)"} / slug=${slug}`);
      continue;
    }

    // Upsert by provenance key. Use $setOnInsert for fields we never want to
    // overwrite (slug, ownerId, ownerType, claim state). Use $set for the
    // refreshable fields (name, contact, bio, chambers, specialties).
    const existing = await Doctor.findOne({
      sourceProvider: POPULAR_PROVIDER,
      sourceProviderId: String(id),
    })
      .select({ _id: 1, slug: 1, isClaimed: 1 })
      .lean<{ _id: mongoose.Types.ObjectId; slug: string; isClaimed: boolean } | null>();

    let doctorId: mongoose.Types.ObjectId;
    let isNew = false;

    if (existing) {
      doctorId = existing._id as unknown as mongoose.Types.ObjectId;
    } else {
      // First insert. Resolve slug collision once.
      const collision = await Doctor.findOne({ slug }).select({ _id: 1 }).lean();
      if (collision) slug = slugAlternate;
      const ownerId = new mongoose.Types.ObjectId();
      doctorId = new mongoose.Types.ObjectId();
      isNew = true;
      try {
        await Doctor.create({
          _id: doctorId,
          ownerType: "doctor",
          ownerId,
          userId: null,
          slug,
          name: norm.parsedName,
          gender: norm.gender,
          bio: norm.bio,
          status: "published",
          isClaimed: false,
          contact: norm.contact,
          qualifications: norm.qualifications,
          specialties: norm.specialties,
          subSpecialties: norm.subSpecialties,
          chambers: norm.chambers,
          sourceProvider: POPULAR_PROVIDER,
          sourceProviderId: String(id),
          sourceUrl: norm.sourceUrl,
          // photo set below after upload
        });
      } catch (e) {
        const err = e as { code?: number };
        if (err.code === 11000) {
          // Race or stale state: another row took the slug. Retry once with
          // the disambiguated form.
          slug = slugAlternate;
          await Doctor.create({
            _id: doctorId,
            ownerType: "doctor",
            ownerId,
            userId: null,
            slug,
            name: norm.parsedName,
            gender: norm.gender,
            bio: norm.bio,
            status: "published",
            isClaimed: false,
            contact: norm.contact,
            qualifications: norm.qualifications,
            specialties: norm.specialties,
            subSpecialties: norm.subSpecialties,
            chambers: norm.chambers,
            sourceProvider: POPULAR_PROVIDER,
            sourceProviderId: String(id),
            sourceUrl: norm.sourceUrl,
          });
        } else {
          throw e;
        }
      }
    }

    // Upload (or fall back) the photo, then write Doctor.photo + refreshable
    // fields. Skip refreshable updates entirely if the profile has been
    // claimed (the doctor owns their content at that point).
    const photoResult = await uploadPopularPhoto({
      id,
      doctorId,
      adminId,
      externalImageUrl: norm.externalImageUrl,
    });

    if (photoResult) {
      if (photoResult.fileId) stats.photosUploaded++;
      else stats.photosLegacyExternal++;
    } else {
      stats.photosMissingFile++;
    }

    const updateSet: Record<string, unknown> = {
      sourceUrl: norm.sourceUrl,
    };
    if (!existing || !existing.isClaimed) {
      Object.assign(updateSet, {
        name: norm.parsedName,
        gender: norm.gender,
        bio: norm.bio,
        contact: norm.contact,
        qualifications: norm.qualifications,
        specialties: norm.specialties,
        subSpecialties: norm.subSpecialties,
        chambers: norm.chambers,
      });
      if (photoResult) {
        updateSet.photo = {
          file: photoResult.fileId,
          url: photoResult.url,
          s3Bucket: photoResult.s3Bucket,
          s3Key: photoResult.s3Key,
          visibility: FILE_VISIBILITY.PUBLIC,
        };
      }
    }

    await Doctor.updateOne({ _id: doctorId }, { $set: updateSet });
    if (isNew) stats.inserted++;
    else stats.updated++;
  }

  console.log("\n✓ Popular ingestion complete:");
  console.table(stats);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbDisconnect();
  });
