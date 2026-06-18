/**
 * Incremental merge: fold the normalized DocTime records into the EXISTING
 * unified dataset WITHOUT re-clustering (and thus re-`unifiedId`-ing) the
 * already-seeded Popular/Ibn-Sina corpus.
 *
 * Why not just re-run build-unified.ts with a third source? Because `unifiedId`
 * is a hash of cluster membership (build-unified.ts) — a full rebuild would
 * change the id of any cluster a DocTime record joined, and the seeder
 * (idempotent by `unifiedId`) would then INSERT a duplicate of an
 * already-published, possibly-claimed production row instead of updating it.
 * So we treat the existing unified docs as FROZEN anchors and only mint new
 * ids for genuinely-new DocTime doctors.
 *
 * Rules (identical to build-unified.ts — we import its engine):
 *  1. BLOCK   — group DocTime records by `dedupKeys.nameKey`.
 *  2. CLUSTER — within a block, link records with the SAME `sameDoctor` test
 *               (gender hard-block → phone → specialty intersect) → DocTime-
 *               internal de-dup via `connectedComponents`.
 *  3. CLASSIFY against the frozen unified nameKeys:
 *       - nameKey ABSENT from production  → NEW  → `foldCluster` → emit.
 *       - nameKey PRESENT in production    → REVIEW. DocTime has no phone and
 *         (almost) no district, so the cross-source `sameDoctor` test can never
 *         auto-merge it — exactly the case build-unified.ts routes to the review
 *         queue. We do NOT auto-insert; we log both sides for a manual call.
 *  4. BMDC DE-DUP — collapse NEW clusters that share a `reg_no`/BMDC (catches a
 *               doctor listed under two name spellings that nameKey-blocking
 *               split apart). DocTime is our only BMDC-bearing source, so this
 *               never collides with production.
 *
 * Output (no DB writes):
 *   data/unified/doctime-new.json          — UnifiedDoctor[] ready for seeding
 *   data/unified/doctime-report.json       — the counts
 *   data/unified/doctime-review-queue.md   — name-collisions for manual review
 *
 *   npx tsx scripts/build-doctime-incremental.ts [--dry-run]
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connectedComponents, foldCluster, tierOf } from "./build-unified";
import type { NormalizedRecord } from "./build-normalized";

const ROOT = process.cwd();
const NORM_DIR = join(ROOT, "data/normalized");
const UNI_DIR = join(ROOT, "data/unified");

// Minimal shape of an existing unified doc we need to read (frozen anchor).
interface UnifiedAnchor {
  matchKey?: { nameKey?: string };
  canonical: {
    name: { displayName: string };
    gender?: string;
    specialties?: Array<{ canonical: string }>;
    chambers?: Array<{ district: string }>;
  };
  sources?: Array<{ source: string; sourceId: string }>;
}

const specsOf = (r: NormalizedRecord) =>
  r.doctor.specialties.map((s) => s.canonical).join(", ") || "—";
const qualsOf = (r: NormalizedRecord) =>
  (r.doctor.qualifications ?? []).map((q) => q.degree).join(", ") || "—";

function renderReview(nameKey: string, dt: NormalizedRecord[], uni: UnifiedAnchor[]): string {
  const dtLines = dt.map(
    (r) =>
      `  - **doctime:${r.sourceId}** — ${r.doctor.name.displayName} · ${specsOf(r)} · ` +
      `${qualsOf(r)} · BMDC ${r.dedupKeys?.bmdc ?? "—"}`,
  );
  const uniLines = uni.map((u) => {
    const src = (u.sources ?? []).map((s) => `${s.source}:${s.sourceId}`).join(", ") || "—";
    const sp = (u.canonical.specialties ?? []).map((s) => s.canonical).join(", ") || "—";
    const di = (u.canonical.chambers ?? []).map((c) => c.district).join("; ") || "—";
    return `  - _in production_ **${src}** — ${u.canonical.name.displayName} · ${sp} · ${di}`;
  });
  return `### ${nameKey}\n**DocTime (not inserted — needs a decision):**\n${dtLines.join(
    "\n",
  )}\n**Already in production:**\n${uniLines.join("\n")}`;
}

function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  // new Date() is fine here — this is a plain CLI, not a Workflow script.
  const createdAt = new Date().toISOString();

  // --- frozen production anchors, indexed by nameKey ---
  const unified = JSON.parse(
    readFileSync(join(UNI_DIR, "doctors.json"), "utf8"),
  ) as UnifiedAnchor[];
  const uniByName = new Map<string, UnifiedAnchor[]>();
  for (const u of unified) {
    const k = u?.matchKey?.nameKey;
    if (!k) continue;
    if (!uniByName.has(k)) uniByName.set(k, []);
    uniByName.get(k)!.push(u);
  }

  // --- normalized DocTime records ---
  const payload = JSON.parse(readFileSync(join(NORM_DIR, "doctime.json"), "utf8")) as {
    records: NormalizedRecord[];
  };
  const records = payload.records;

  // BLOCK DocTime by nameKey (a record without one is its own singleton).
  const byName = new Map<string, NormalizedRecord[]>();
  for (const r of records) {
    const key = r.dedupKeys?.nameKey || `__noname__:${r.source}:${r.sourceId}`;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(r);
  }

  type Unified = ReturnType<typeof foldCluster>;
  const newDocs: Unified[] = [];
  const reviewSections: string[] = [];
  let newClusters = 0;
  let reviewClusters = 0;
  let reviewRecords = 0;

  for (const [nameKey, group] of byName) {
    const collides = !nameKey.startsWith("__noname__:") && uniByName.has(nameKey);
    const comps = connectedComponents(group); // DocTime-internal de-dup (same rules)

    if (collides) {
      reviewClusters += comps.length;
      reviewRecords += group.length;
      reviewSections.push(renderReview(nameKey, group, uniByName.get(nameKey)!));
      continue; // name-collision → review queue, never auto-inserted
    }
    for (const comp of comps) {
      newDocs.push(foldCluster(comp, tierOf(comp, group.length), createdAt));
      newClusters++;
    }
  }

  // --- BMDC de-dup across NEW clusters (keep the source-richest, then the one
  //     with more qualifications; drop the rest so the sparse-unique bmdcNumber
  //     index can't be violated at seed time). ---
  const richness = (u: Unified) =>
    u.sources.length * 100 + (u.canonical.qualifications?.length ?? 0);
  const byBmdc = new Map<string, Unified>();
  const dropped: string[] = [];
  for (const ud of newDocs) {
    const b = ud.canonical.bmdcNumber;
    if (!b) continue;
    const prev = byBmdc.get(b);
    if (!prev || richness(ud) > richness(prev)) byBmdc.set(b, ud);
  }
  const deduped: Unified[] = [];
  const keptByBmdc = new Set<Unified>(byBmdc.values());
  for (const ud of newDocs) {
    const b = ud.canonical.bmdcNumber;
    if (b && byBmdc.get(b) !== ud) {
      if (keptByBmdc.has(ud)) deduped.push(ud);
      else dropped.push(`${ud.unifiedId} (BMDC ${b} → kept ${byBmdc.get(b)!.unifiedId})`);
      continue;
    }
    deduped.push(ud);
  }

  const report = {
    source: "doctime",
    inputs: { doctimeNormalizedRecords: records.length, frozenUnifiedDocs: unified.length },
    nameBlocks: byName.size,
    new: {
      clusters: newClusters,
      afterBmdcDedup: deduped.length,
      bmdcDropped: dropped.length,
    },
    review: {
      nameGroups: reviewSections.length,
      clusters: reviewClusters,
      records: reviewRecords,
    },
    generatedAt: createdAt,
  };

  console.log(`\nDocTime incremental merge — ${records.length} normalized records`);
  console.table({
    "NEW doctors (insert)": deduped.length,
    "  ↳ dropped as BMDC dupes": dropped.length,
    "REVIEW (name collision, records)": reviewRecords,
    "REVIEW name-groups": reviewSections.length,
  });

  if (dryRun) {
    console.log("(dry-run: nothing written)\n");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  mkdirSync(UNI_DIR, { recursive: true });
  writeFileSync(join(UNI_DIR, "doctime-new.json"), JSON.stringify(deduped, null, 2) + "\n");
  writeFileSync(join(UNI_DIR, "doctime-report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(
    join(UNI_DIR, "doctime-review-queue.md"),
    `# DocTime cross-source review queue (${reviewSections.length} name-groups, ${reviewRecords} records)\n\n` +
      `DocTime records whose normalized name already exists in production. DocTime has ` +
      `no phone and (almost) no chamber district, so the same-doctor test cannot ` +
      `auto-confirm these as the same person — decide each manually. Bangladeshi names ` +
      `collide often, so many of these are likely DIFFERENT people.\n\n` +
      reviewSections.join("\n\n") +
      "\n",
  );
  console.log(
    `→ wrote ${deduped.length} new docs → data/unified/doctime-new.json` +
      ` (+ doctime-report.json, doctime-review-queue.md)`,
  );
}

main();
