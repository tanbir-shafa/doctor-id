/**
 * One-off DB cleanup: reconcile after the LEGACY unified-photo objects were
 * deleted from S3.
 *
 * An earlier `seed:unified:photos` run stored ~2,554 profile photos under the
 * legacy flat `doctor-photos/<sha>.<ext>` keys — since superseded by the
 * `_seed/` namespace + 100 KB compression floor. Those S3 objects were deleted
 * manually, so the DB now holds dangling references (broken `<img>` on the
 * public profiles) plus orphaned `File` docs.
 *
 * This script (DB only — no S3 access):
 *   - sets `Doctor.photo = null` for unified docs whose `photo.s3Key` is a legacy
 *     `doctor-photos/…` key, so the profile cleanly falls back to the UI's
 *     initials avatar and a later `npm run seed:unified:photos` re-uploads it
 *     fresh under `_seed/`;
 *   - soft-deletes (`deletedAt`) the matching legacy `File` docs.
 *
 * The `doctor-photos/` prefix is unique to that old run (the live upload path and
 * the Popular ingestion use other key layouts), so the match is precise.
 *
 *   npm run clean:legacy-photos             # preview — counts only, no writes
 *   npm run clean:legacy-photos -- --apply  # execute the cleanup
 */

import { dbConnect, dbDisconnect } from "@/lib/db/mongoose";
import { Doctor, File } from "@/lib/db/models";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run: NODE_ENV is production.");
  process.exit(1);
}

// Legacy keys from the superseded flat scheme. Anchored at start so the File
// query can use the unique `s3Key` index.
const LEGACY_KEY = { $regex: "^doctor-photos/" };

async function main() {
  const apply = process.argv.slice(2).includes("--apply");
  await dbConnect();

  const docFilter = { sourceProvider: "unified", "photo.s3Key": LEGACY_KEY };
  const fileFilter = { s3Key: LEGACY_KEY, deletedAt: null };

  const docCount = await Doctor.countDocuments(docFilter);
  const fileCount = await File.countDocuments(fileFilter);

  console.log(
    `→ Legacy unified-photo DB cleanup${apply ? " (APPLY)" : " (preview — pass --apply to write)"}`,
  );
  console.log(`  Doctor.photo to clear (legacy doctor-photos/ keys): ${docCount}`);
  console.log(`  legacy File docs to soft-delete:                    ${fileCount}`);

  if (apply) {
    const dRes = await Doctor.updateMany(docFilter, { $set: { photo: null } });
    const fRes = await File.updateMany(fileFilter, { $set: { deletedAt: new Date() } });
    console.log(`  ✓ cleared Doctor.photo:     ${dRes.modifiedCount}`);
    console.log(`  ✓ soft-deleted File docs:   ${fRes.modifiedCount}`);
    const remaining = await Doctor.countDocuments(docFilter);
    console.log(`  remaining legacy Doctor.photo refs: ${remaining}`);
  }

  await dbDisconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
