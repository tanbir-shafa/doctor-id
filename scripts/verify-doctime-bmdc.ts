/**
 * Bulk-mark ingested doctors as BMDC-verified (the professional axis only).
 *
 * Scopes to the doctors from a given unified file (e.g. the DocTime batch) that
 * carry a `bmdcNumber`, and for each sets:
 *   - bmdcVerified   = true
 *   - bmdcVerifiedAt = now
 *   - verificationLevel = computeVerificationLevel(true, doc.nidVerified)
 *                         (→ "bmdc_verified"; "fully_verified" only if already nid-verified)
 *
 * It does NOT touch the identity axis (`nidVerified`), the name/displayName, the
 * `registrations` array (already set at seed time), or any `User`/login state —
 * these are unclaimed, account-less profiles, so there is no `User.approved` gate
 * to flip. It only changes the PUBLIC profile badge.
 *
 * Scope is by `(sourceProvider:"unified", sourceProviderId ∈ <file's ids>)`, so a
 * different unified corpus (e.g. doctors.json) is never affected unless you point
 * --file at it. Idempotent: a row that's already BMDC-verified at the right level
 * is skipped, so re-runs report 0 changes.
 *
 *   npm run verify:bmdc -- --file=data/unified/doctime-new.json --dry-run
 *   npm run verify:bmdc -- --file=data/unified/doctime-new.json
 *   npm run verify:bmdc -- --file=data/unified/doctime-new.json --limit=50
 *
 * Against production (static-key path): prefix MONGO_URI="$PROD_MONGO" (see
 * doc/seeding-production.md). Refuses NODE_ENV=production unless ALLOW_PROD_SEED=1.
 *
 * ROLLBACK (undo for the same cohort): run a one-off setting bmdcVerified:false +
 * verificationLevel = computeVerificationLevel(false, doc.nidVerified) over the
 * same `sourceProviderId` set.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import mongoose from "mongoose";
import { dbConnect, dbDisconnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { computeVerificationLevel } from "@/lib/utils/verification";
import { assertSeedAllowed } from "./lib/prod-guard";

assertSeedAllowed("verify BMDC");

interface UnifiedDoctor {
  unifiedId: string;
  canonical?: { bmdcNumber?: string | null };
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const fileArg = argv.find((a) => a.startsWith("--file="));
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  if (!fileArg) {
    console.error("Missing --file=<unified.json> (e.g. --file=data/unified/doctime-new.json).");
    process.exit(1);
  }
  return {
    dryRun: argv.includes("--dry-run"),
    limit: limitArg ? Number(limitArg.slice("--limit=".length)) || null : null,
    file: join(process.cwd(), fileArg.slice("--file=".length)),
  };
}

async function main() {
  const { dryRun, limit, file } = parseArgs();
  console.log(`→ Mark BMDC-verified from ${file}${dryRun ? " (dry-run)" : ""}`);

  const all = JSON.parse(readFileSync(file, "utf8")) as UnifiedDoctor[];
  // unifiedIds of records that actually carry a BMDC number.
  let ids = all
    .filter((d) => typeof d.canonical?.bmdcNumber === "string" && d.canonical.bmdcNumber.trim())
    .map((d) => d.unifiedId);
  if (limit) ids = ids.slice(0, limit);
  console.log(`  file records: ${all.length} · with BMDC: ${ids.length}`);

  await dbConnect();

  // Only the seeded rows for this cohort that have a stored bmdcNumber.
  const docs = (await Doctor.find({
    sourceProvider: "unified",
    sourceProviderId: { $in: ids },
    bmdcNumber: { $type: "string" },
  })
    .select({ _id: 1, bmdcVerified: 1, nidVerified: 1, verificationLevel: 1 })
    .lean()) as unknown as Array<{
    _id: unknown;
    bmdcVerified?: boolean;
    nidVerified?: boolean;
    verificationLevel?: string;
  }>;

  const now = new Date();
  let alreadyDone = 0;
  const ops: any[] = [];
  for (const d of docs) {
    const level = computeVerificationLevel(true, Boolean(d.nidVerified));
    if (d.bmdcVerified === true && d.verificationLevel === level) {
      alreadyDone += 1;
      continue; // idempotent: nothing to change
    }
    ops.push({
      updateOne: {
        filter: { _id: d._id },
        update: { $set: { bmdcVerified: true, bmdcVerifiedAt: now, verificationLevel: level } },
      },
    });
  }

  console.log(
    `  matched doctor rows: ${docs.length} · already BMDC-verified: ${alreadyDone} · to update: ${ops.length}`,
  );

  if (!dryRun && ops.length) {
    const BATCH = 500;
    for (let i = 0; i < ops.length; i += BATCH) {
      await Doctor.bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
    }
  }

  console.log(`\n✓ ${dryRun ? `${ops.length} would be marked BMDC-verified` : `${ops.length} marked BMDC-verified`}.`);
  await dbDisconnect();
  await mongoose.disconnect().catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
