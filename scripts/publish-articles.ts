/**
 * Publish health guides + stamp the medical reviewer (SEO task 47/48).
 *
 *   REVIEWER_NAME="Dr. Jane Doe" \
 *   REVIEWER_CREDENTIAL="MBBS, FCPS (Medicine), BMDC 12345" \
 *   REVIEWER_PROFILE_URL="https://daktar.link/jane-doe-cardiologist" \
 *     npm run publish:articles
 *
 *   npm run publish:articles -- --dry-run     # show what would change
 *   npm run publish:articles -- --slug=asthma-symptoms,piles-...   # limit to slugs
 *
 * For every guide (or just the --slug list), ensures `status: published` and
 * stamps the medical reviewer byline + review date that the public guide page
 * and the schema.org `reviewedBy` / `lastReviewed` read. This both publishes
 * drafts AND corrects the reviewer on already-published guides (e.g. ones that
 * went live with the generic "admin" byline). `publishedAt` is preserved when
 * already set. Refuses NODE_ENV=production (do prod from /admin/articles).
 */

import mongoose from "mongoose";
import { dbConnect, dbDisconnect } from "@/lib/db/mongoose";
import { Article } from "@/lib/db/models";
import type { Loose } from "@/lib/db/models/loose";
import { assertSeedAllowed } from "./lib/prod-guard";

assertSeedAllowed("publish articles");

const DRY_RUN = process.argv.includes("--dry-run");
const slugArg = process.argv.find((a) => a.startsWith("--slug="));
const onlySlugs = slugArg
  ? slugArg
      .slice("--slug=".length)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  : null;

const reviewerName = (process.env.REVIEWER_NAME ?? "").trim();
const reviewerCredential = (process.env.REVIEWER_CREDENTIAL ?? "").trim() || null;
const reviewerProfileUrl = (process.env.REVIEWER_PROFILE_URL ?? "").trim() || null;

if (!reviewerName) {
  console.error(
    "Missing REVIEWER_NAME. Set REVIEWER_NAME (and ideally REVIEWER_CREDENTIAL, REVIEWER_PROFILE_URL) before publishing — it becomes the public 'Medically reviewed by …' byline.",
  );
  process.exit(1);
}

async function main() {
  await dbConnect();
  const model = Article as unknown as Loose;

  const query: Record<string, unknown> = onlySlugs ? { slug: { $in: onlySlugs } } : {};

  const docs = await model.find(query).sort({ slug: 1 });
  if (!docs.length) {
    console.log("No guides matched — nothing to do.");
    await dbDisconnect();
    await mongoose.disconnect().catch(() => {});
    return;
  }

  console.log(
    `Reviewer: ${reviewerName}${reviewerCredential ? ` — ${reviewerCredential}` : ""}` +
      `${reviewerProfileUrl ? ` (${reviewerProfileUrl})` : ""}`,
  );
  console.log(`${docs.length} guide(s) to stamp${DRY_RUN ? " (dry-run)" : ""}:\n`);

  const now = new Date();
  let changed = 0;
  for (const doc of docs) {
    const action = doc.status === "published" ? "re-stamp" : "publish ";
    console.log(`  ${DRY_RUN ? "would " : ""}${action} ${doc.slug}`);
    if (DRY_RUN) continue;
    doc.status = "published";
    doc.publishedAt = (doc.publishedAt as Date | null) ?? now;
    doc.reviewerName = reviewerName;
    doc.reviewerCredential = reviewerCredential;
    doc.reviewerProfileUrl = reviewerProfileUrl;
    doc.reviewedAt = now;
    await doc.save();
    changed += 1;
  }

  console.log(`\nDone. ${DRY_RUN ? `${docs.length} would be updated` : `${changed} updated`}.`);
  await dbDisconnect();
  await mongoose.disconnect().catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
