/**
 * Seed doctor profile photos for the UNIFIED dataset into S3 + `Doctor.photo`.
 *
 * Companion to `scripts/seed-unified.ts`, which deliberately skips photos. The
 * unified records carry `canonical.photos[].localPath` pointing at files under
 * `data/popular-diagnostic/photos/` and `data/ibn-sina/photos/`. Two quirks of
 * the source data shape this script:
 *
 *   1. PLACEHOLDERS — each source stores its own "no photo" placeholder once
 *      *per doctor*, so the same image lands under thousands of distinct
 *      filenames. Real portraits are unique; placeholders are byte-identical
 *      duplicates. We detect them by content-hash frequency across the WHOLE
 *      corpus and SKIP them (the doctor falls back to the UI's initials avatar)
 *      — a placeholder is never uploaded.
 *   2. REDUNDANCY — every upload is content-addressed and each distinct image is
 *      uploaded at most once, so identical bytes are never stored twice (across
 *      doctors and across re-runs).
 *
 * Storage layout: bulk imports go to a SEPARATE namespace,
 * `[dev/]doctor/profile-picture/_seed/<sha>.<ext>` — the same purpose folder + public
 * bucket as user uploads, but a distinct `_seed/` prefix (user uploads write per-doctor
 * keys via `buildS3Key`). File docs are tagged `uploadedBy=admin` +
 * `metadata.source="unified-seed"`. The app renders both identically via `Doctor.photo.url`.
 *
 * Compression: images ≥ the size floor (`--min-compress-kb`, default 100) are resized +
 * recompressed with the real path's settings (`optimizeImageBuffer`, 1024px / q80) + a
 * `blurDataUrl`; smaller images (e.g. ibn-sina's ~200px/~18KB thumbnails) are stored
 * untouched to avoid double-compression artifacts. `sniffImageMime` validates real image
 * bytes (drops the stray `.bin`/`.gif`/corrupt) and yields the true MIME.
 *
 *   npm run seed:unified:photos -- --report            # dup groups + projection, no DB/S3, no writes
 *   npm run seed:unified:photos -- --dry-run --limit=30
 *   npm run seed:unified:photos                         # full run
 *   npm run seed:unified:photos -- --force              # re-evaluate even already-set photos
 *
 * Flags: --report, --dry-run, --limit=N, --force, --dup-threshold=N (default 2),
 *        --min-compress-kb=N (default 100), --concurrency=N (default 8).
 *
 * Requires AWS creds + `AWS_PUBLIC_BUCKET_NAME` in `.env.local` (no `S3_BUCKET`
 * fallback). Run `npm run seed` + `npm run seed:unified` first.
 */

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { dbConnect, dbDisconnect } from "@/lib/db/mongoose";
import { Doctor, User, File, FILE_LINKED_ENTITY_TYPE } from "@/lib/db/models";
import {
  bucketFor,
  publicObjectUrl,
  UPLOAD_PURPOSE,
  visibilityFor,
  securityClassFor,
} from "@/lib/s3/buckets";
import { uploadBufferToS3, computeSha256 } from "@/lib/s3/s3-service";
import { sniffImageMime, type SniffedImageMime } from "@/lib/utils/image-sniff";
import { optimizeImageBuffer, generateBlurDataUrl } from "@/lib/images/optimize";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed: NODE_ENV is production.");
  process.exit(1);
}

const PROVIDER = "unified";
const UNIFIED_FILE = join(process.cwd(), "data/unified/doctors.json");
const PROFILE_MAX_EDGE = 1024; // matches the real profile-upload path (doctor-photo.ts)
const PROFILE_QUALITY = 80;
const FLUSH_CHUNK = 500;

// Bulk-seed photos share the real profile-photo purpose (so the File doc + bucket match
// the app's conventions) but live in a SEPARATE `_seed/` namespace, distinct from the
// per-doctor keys user uploads write. `dev/` prefix mirrors `buildS3Key` (s3-service.ts).
const PURPOSE = UPLOAD_PURPOSE.doctor_profile_photo;
const PHOTO_VISIBILITY = visibilityFor(PURPOSE.bucketType);
const PHOTO_SECURITY = securityClassFor(PURPOSE.bucketType);
// Mirror buildS3Key's env split. (The production guard above means this is "dev/" in
// practice; the cast sidesteps TS narrowing NODE_ENV away from "production" after that guard.)
const ENV_PREFIX = (process.env.NODE_ENV as string) === "production" ? "" : "dev/";
const SEED_KEY_ROOT = `${ENV_PREFIX}${PURPOSE.folder}/_seed`; // e.g. dev/doctor/profile-picture/_seed

const EXT_FOR_MIME: Record<SniffedImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

interface UnifiedPhoto {
  source?: string;
  url?: string | null;
  localPath?: string | null;
}
interface UnifiedDoctor {
  unifiedId: string;
  canonical?: { photos?: UnifiedPhoto[] };
}

interface Candidate {
  unifiedId: string;
  absPath: string;
  provider: string; // photo source (e.g. popular-diagnostic / ibn-sina) — File provenance
  srcSha256: string; // hash of the ORIGINAL bytes — placeholder-detection + dedup signal
  mime: SniffedImageMime;
  ext: string;
}

interface UploadRec {
  fileId: unknown;
  url: string;
  s3Bucket: string;
  s3Key: string;
  blurDataUrl: string | null;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const num = (flag: string, dflt: number) => {
    const a = argv.find((x) => x.startsWith(flag));
    const v = a ? Number(a.slice(flag.length)) : NaN;
    return Number.isFinite(v) ? v : dflt;
  };
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  return {
    report: argv.includes("--report"),
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    limit: limitArg ? num("--limit=", 0) || null : null,
    dupThreshold: Math.max(2, num("--dup-threshold=", 2)),
    concurrency: Math.max(1, num("--concurrency=", 8)),
    // Below this byte floor we skip the lossy re-encode and store the original as-is
    // (ibn-sina's ~200px/~18KB thumbnails would only degrade). 0 disables the floor.
    minCompressBytes: Math.max(0, num("--min-compress-kb=", 100)) * 1024,
  };
}

/** Run `fn` over `items` with at most `concurrency` promises in flight. */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

/** The first `photos[]` entry whose local file exists on disk (with its source tag). */
function firstExistingLocal(d: UnifiedDoctor): { abs: string; source: string } | null {
  for (const p of d.canonical?.photos ?? []) {
    if (!p.localPath) continue;
    const abs = join(process.cwd(), p.localPath);
    if (existsSync(abs)) return { abs, source: p.source ?? "unknown" };
  }
  return null;
}

/** Read + validate a doctor's chosen photo. Returns null when there isn't a real image. */
async function classify(d: UnifiedDoctor): Promise<Candidate | null> {
  const found = firstExistingLocal(d);
  if (!found) return null;
  let buf: Buffer;
  try {
    buf = await readFile(found.abs);
  } catch {
    return null;
  }
  const mime = sniffImageMime(buf); // jpeg/png/webp only — drops .bin/.gif/corrupt
  if (!mime) return null;
  return {
    unifiedId: d.unifiedId,
    absPath: found.abs,
    provider: found.source,
    srcSha256: computeSha256(buf),
    mime,
    ext: EXT_FOR_MIME[mime],
  };
}

function printReport(
  total: number,
  candidates: Candidate[],
  freq: Map<string, number>,
  sampleByHash: Map<string, string>,
  noLocalPhoto: number,
  dupThreshold: number,
) {
  const groups = [...freq.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  console.log(`\n  Doctors:                 ${total}`);
  console.log(`  With a usable image:     ${candidates.length}`);
  console.log(`  No usable local file:    ${noLocalPhoto}`);
  console.log(`  Distinct image contents: ${freq.size}`);
  console.log(`  Duplicate groups (>1):   ${groups.length}\n`);

  console.log(`  Top duplicate groups (count · hash · sample file):`);
  for (const [hash, n] of groups.slice(0, 15)) {
    console.log(`    ${String(n).padStart(5)}  ${hash.slice(0, 16)}  ${sampleByHash.get(hash) ?? ""}`);
  }

  const counts = candidates.map((c) => freq.get(c.srcSha256) ?? 1);
  const thresholds = [...new Set([2, 3, 5, dupThreshold])].sort((a, b) => a - b);
  console.log(`\n  Projection by --dup-threshold (≥N doctors ⇒ placeholder ⇒ skipped):`);
  console.log(`    thr  upload(unique)  skip(placeholder)  photoless total`);
  for (const t of thresholds) {
    const skip = counts.filter((n) => n >= t).length;
    const upload = counts.length - skip;
    const tag = t === dupThreshold ? "  ← active" : "";
    console.log(
      `    ${String(t).padStart(3)}  ${String(upload).padStart(13)}  ${String(skip).padStart(17)}  ${String(skip + noLocalPhoto).padStart(15)}${tag}`,
    );
  }
}

async function main() {
  const opts = parseArgs();
  const all = JSON.parse(readFileSync(UNIFIED_FILE, "utf8")) as UnifiedDoctor[];

  const mode = opts.report ? " (report)" : opts.dryRun ? " (dry-run)" : "";
  console.log(`→ Seeding unified photos${mode}`);
  console.log(`  hashing source images across the full dataset (${all.length} doctors)…`);

  // PASS 1 — classify EVERY doctor (full dataset, ignoring --limit) so placeholder
  // detection by content-hash frequency stays correct even on a limited run.
  const classified = await mapPool(all, opts.concurrency, classify);
  const candByUnified = new Map<string, Candidate>();
  const candidates: Candidate[] = [];
  const freq = new Map<string, number>();
  const sampleByHash = new Map<string, string>();
  let noLocalPhotoAll = 0;
  for (const c of classified) {
    if (!c) {
      noLocalPhotoAll++;
      continue;
    }
    candByUnified.set(c.unifiedId, c);
    candidates.push(c);
    freq.set(c.srcSha256, (freq.get(c.srcSha256) ?? 0) + 1);
    if (!sampleByHash.has(c.srcSha256)) sampleByHash.set(c.srcSha256, basename(c.absPath));
  }
  const placeholderHashes = new Set(
    [...freq.entries()].filter(([, n]) => n >= opts.dupThreshold).map(([h]) => h),
  );
  console.log(
    `  distinct images: ${freq.size} · placeholder images (≥${opts.dupThreshold}): ${placeholderHashes.size}`,
  );

  if (opts.report) {
    printReport(all.length, candidates, freq, sampleByHash, noLocalPhotoAll, opts.dupThreshold);
    return;
  }

  // S3 preflight. Real runs require the public bucket; a dry-run only warns.
  const bucket = bucketFor("public");
  if (!bucket) {
    if (!opts.dryRun) {
      console.error(
        "✗ Public S3 bucket not configured. Set AWS_PUBLIC_BUCKET_NAME + AWS creds in .env.local.",
      );
      process.exit(1);
    }
    console.warn("  ⚠ no public bucket configured — dry-run will not produce real URLs.");
  }

  await dbConnect();

  const admin = (await User.findOne({ role: "admin" }).select({ _id: 1 }).lean()) as {
    _id: unknown;
  } | null;
  if (!admin) {
    console.error("✗ No admin user found — run `npm run seed` first.");
    await dbDisconnect();
    process.exit(1);
  }
  const adminId = admin._id;

  const take = opts.limit ? all.slice(0, opts.limit) : all;
  const ids = take.map((d) => d.unifiedId);
  const docs = (await Doctor.find({ sourceProvider: PROVIDER, sourceProviderId: { $in: ids } })
    .select({ _id: 1, sourceProviderId: 1, photo: 1 })
    .lean()) as unknown as Array<{ _id: unknown; sourceProviderId: string; photo?: unknown }>;
  const docByUnified = new Map(docs.map((d) => [d.sourceProviderId, d]));
  console.log(`  seeded doctor rows for this run: ${docByUnified.size} / ${take.length}`);

  const stats = {
    uploaded: 0, // compressed (re-encoded) then uploaded
    storedOriginal: 0, // below the size floor (or re-encode didn't help) → uploaded as-is
    reusedSharedImage: 0,
    skippedExisting: 0,
    skippedPlaceholder: 0,
    noLocalPhoto: 0,
    noDoctorRow: 0,
    errors: 0,
  };
  // Upload each distinct image at most once. Storing the in-flight promise makes
  // this race-free if two doctors ever share a (non-placeholder) image.
  const inflight = new Map<string, Promise<UploadRec>>();
  const ops: any[] = []; // Mongoose bulkWrite op shape (loosely typed, as in seed-unified.ts)

  const doUpload = async (c: Candidate, doctorId: unknown): Promise<UploadRec> => {
    const original = await readFile(c.absPath);
    // Compress, but with the size floor: optimizeImageBuffer runs its decompression-bomb
    // guard first, then returns the ORIGINAL untouched (optimized:false) for anything below
    // minBytes — so tiny thumbnails aren't re-encoded into artifacts.
    const result = await optimizeImageBuffer(original, c.mime, {
      maxEdge: PROFILE_MAX_EDGE,
      quality: PROFILE_QUALITY,
      minBytes: opts.minCompressBytes,
    });
    if (!result.ok) throw new Error(result.error);
    const buffer = result.buffer;
    if (result.optimized) stats.uploaded++;
    else stats.storedOriginal++;

    const blurDataUrl = await generateBlurDataUrl(buffer);
    // SEPARATE seed namespace (see CLAUDE-noted separation): bulk imports live under
    // `_seed/`, never the per-doctor folders user uploads write. Content-addressed.
    const key = `${SEED_KEY_ROOT}/${c.srcSha256}.${c.ext}`;

    if (opts.dryRun || !bucket) {
      return {
        fileId: null,
        url: bucket ? publicObjectUrl(bucket, key) : "(dry-run)",
        s3Bucket: bucket ?? "(unconfigured)",
        s3Key: key,
        blurDataUrl,
      };
    }

    const uploaded = await uploadBufferToS3({ buffer, bucket, key, mimeType: c.mime });
    if (!uploaded) throw new Error("S3 upload returned null (bucket/creds not configured)");

    // Idempotent: content-addressed key is unique, so re-runs reuse the File doc
    // instead of tripping its `s3Key` unique index. Reuses the app's UPLOAD_PURPOSE
    // config + visibility/security helpers; tagged with bulk-import provenance.
    const fileDoc = (await File.findOneAndUpdate(
      { s3Key: key },
      {
        $setOnInsert: {
          linkedEntityType: FILE_LINKED_ENTITY_TYPE.DOCTOR,
          linkedEntityId: doctorId,
          title: "Doctor profile photo (bulk import)",
          description: null,
          category: PURPOSE.category,
          visibility: PHOTO_VISIBILITY,
          securityClass: PHOTO_SECURITY,
          originalFileName: basename(c.absPath),
          finalFileName: `${c.srcSha256}.${c.ext}`,
          mimeType: c.mime,
          ext: c.ext,
          sizeBytes: uploaded.sizeBytes,
          sha256: computeSha256(buffer), // hash of the STORED bytes (== original when below floor)
          s3VersionId: null,
          uploadedBy: adminId,
          metadata: { source: "unified-seed", provider: c.provider },
        },
      },
      { upsert: true, returnDocument: "after" },
    )) as { _id: unknown };

    return { fileId: fileDoc._id, url: publicObjectUrl(bucket, key), s3Bucket: bucket, s3Key: key, blurDataUrl };
  };

  const ensureUploaded = (c: Candidate, doctorId: unknown): Promise<UploadRec> => {
    const existing = inflight.get(c.srcSha256);
    if (existing) {
      stats.reusedSharedImage++;
      return existing;
    }
    const p = doUpload(c, doctorId);
    inflight.set(c.srcSha256, p);
    return p;
  };

  // PASS 2 — process the (optionally limited) slice. ops are pushed synchronously
  // and flushed after the pool drains, so there's no concurrent mutation race.
  await mapPool(take, opts.concurrency, async (d) => {
    const doctor = docByUnified.get(d.unifiedId);
    if (!doctor) {
      stats.noDoctorRow++;
      return;
    }
    const hasPhoto = !!doctor.photo;
    if (hasPhoto && !opts.force) {
      stats.skippedExisting++;
      return;
    }

    const c = candByUnified.get(d.unifiedId);
    if (!c || placeholderHashes.has(c.srcSha256)) {
      if (!c) stats.noLocalPhoto++;
      else stats.skippedPlaceholder++;
      // --force on a doctor that previously got a (now-reclassified) photo: clear it.
      if (opts.force && hasPhoto) {
        ops.push({ updateOne: { filter: { _id: doctor._id }, update: { $set: { photo: null } } } });
      }
      return;
    }

    try {
      const rec = await ensureUploaded(c, doctor._id);
      ops.push({
        updateOne: {
          filter: { _id: doctor._id },
          update: {
            $set: {
              photo: {
                file: rec.fileId,
                url: rec.url,
                s3Bucket: rec.s3Bucket,
                s3Key: rec.s3Key,
                visibility: PHOTO_VISIBILITY,
                blurDataUrl: rec.blurDataUrl,
              },
            },
          },
        },
      });
    } catch (e) {
      stats.errors++;
      console.warn(`  ! ${d.unifiedId}: ${(e as Error).message}`);
    }
  });

  // Flush Doctor.photo updates in chunks.
  if (!opts.dryRun) {
    for (let i = 0; i < ops.length; i += FLUSH_CHUNK) {
      await Doctor.bulkWrite(ops.slice(i, i + FLUSH_CHUNK), { ordered: false });
    }
  }

  console.log(`\n✓ Unified photo pass complete${opts.dryRun ? " (dry-run — no writes)" : ""}:`);
  console.table(stats);
  await dbDisconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
