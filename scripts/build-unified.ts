/**
 * PR2 — the merge. Consumes the Phase-0b normalized staging files and produces the
 * unified dataset under `data/unified/`.
 *
 * Pipeline (see .claude/plans/build-unified-plan.md §3):
 *  1. BLOCK   — group all records by `dedupKeys.nameKey`.
 *  2. SPLIT   — within each name-group, link records with the ordered same-doctor
 *               test (gender hard-block → phone-equal → HIGH/MEDIUM specialty
 *               intersect) and take connected components → doctor-clusters.
 *  3. TIER    — MERGE-HIGH (phone, or clean cross 1:1) / MERGE-MEDIUM (specialty-only)
 *               / REVIEW (cross collision or unlinked cross pair) / SEPARATE / SINGLE.
 *  4. FOLD    — union chamber refs (dedupe by id, merge schedules), paired
 *               specialties, languages, qualifications; resolve scalar conflicts.
 *  5. WRITE   — doctors.json, chamber refs kept; clusters.json, review-queue.md,
 *               report.json, conflicts.md.
 *
 * No DB, no network.  npx tsx scripts/build-unified.ts [--limit=N] [--dry-run]
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChamberRef, NormalizedRecord, PairedSpecialty } from "./build-normalized";

const ROOT = process.cwd();
const NORM_DIR = join(ROOT, "data/normalized");
const OUT_DIR = join(ROOT, "data/unified");
const SOURCES = ["popular-diagnostic", "ibn-sina"] as const;

type Tier = "MERGE-HIGH" | "MERGE-MEDIUM" | "REVIEW" | "SEPARATE" | "SINGLE";

interface UnifiedDoctor {
  unifiedId: string;
  matchKey: { nameKey: string; specialties: string[]; tier: Tier };
  canonical: {
    name: NormalizedRecord["doctor"]["name"];
    gender?: NormalizedRecord["doctor"]["gender"];
    bio?: string;
    contact: { publicPhone?: string; publicEmail?: string };
    languages: string[];
    qualifications: NonNullable<NormalizedRecord["doctor"]["qualifications"]>;
    designation?: string;
    institute?: string;
    specialties: PairedSpecialty[];
    sourceSpecialties: string[];
    subSpecialties: string[];
    chambers: ChamberRef[];
    externalImageUrl?: string;
    photos: Array<{ source: string; url: string; localPath?: string }>;
  };
  sources: Array<{ source: string; sourceId: string; sourceUrl: string; scrapedAt: string; raw: unknown }>;
  conflicts: Array<{ field: string; values: Array<{ source: string; value: unknown }>; chosen: { source: string; value: unknown }; reason: string }>;
  warnings: string[];
  createdAt: string;
}

// --- Same-doctor test (§3.2) -----------------------------------------------

function gateCanonicals(r: NormalizedRecord): Set<string> {
  return new Set(
    r.doctor.specialties
      .filter((s) => s.matchConfidence === "high" || s.matchConfidence === "medium")
      .map((s) => s.canonical),
  );
}

function districtOverlap(a: NormalizedRecord, b: NormalizedRecord): boolean {
  const da = new Set(a.doctor.chambers.map((c) => c.district));
  return b.doctor.chambers.some((c) => da.has(c.district));
}

function sameDoctor(a: NormalizedRecord, b: NormalizedRecord): boolean {
  const ga = a.doctor.gender;
  const gb = b.doctor.gender;
  if (ga && gb && ga !== gb) return false; // rule 1 — gender conflict
  const pa = a.dedupKeys?.phone;
  const pb = b.dedupKeys?.phone;
  if (pa && pb && pa === pb) return true; // rule 2 — same phone (decisive)
  const sa = gateCanonicals(a); // rule 3 — HIGH/MEDIUM specialty intersect
  const sb = gateCanonicals(b);
  let shares = false;
  for (const x of sa) if (sb.has(x)) { shares = true; break; }
  if (!shares) return false; // rule 4
  // intra-source: specialty intersect suffices. cross-source has neither phone nor
  // gender, so it additionally requires a shared district — otherwise the pair goes
  // to the review queue instead of auto-merging (§3.2 / §6 false-positive guard).
  return a.source === b.source || districtOverlap(a, b);
}

function connectedComponents(records: NormalizedRecord[]): NormalizedRecord[][] {
  const n = records.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (sameDoctor(records[i], records[j])) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, NormalizedRecord[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(records[i]);
  }
  return [...groups.values()];
}

function hasSharedPhone(cluster: NormalizedRecord[]): boolean {
  const counts = new Map<string, number>();
  for (const r of cluster) {
    const p = r.dedupKeys?.phone;
    if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.values()].some((c) => c >= 2);
}

function tierOf(cluster: NormalizedRecord[], groupSize: number): Tier {
  if (cluster.length === 1) return groupSize === 1 ? "SINGLE" : "SEPARATE";
  const providers = new Set(cluster.map((r) => r.source));
  const pd = cluster.filter((r) => r.source === "popular-diagnostic").length;
  const ibn = cluster.length - pd;
  if (providers.size === 1) return hasSharedPhone(cluster) ? "MERGE-HIGH" : "MERGE-MEDIUM";
  if (pd === 1 && ibn === 1) return "MERGE-HIGH";
  return "REVIEW";
}

// --- Fold (§3.4 + §3.6) -----------------------------------------------------

const PREFIX_RANK: Record<string, number> = {
  "Prof. Dr.": 4,
  "Assoc. Prof. Dr.": 3,
  "Asst. Prof. Dr.": 2,
  "Dr.": 1,
};

function foldChambers(cluster: NormalizedRecord[]): ChamberRef[] {
  const byId = new Map<string, ChamberRef>();
  for (const r of cluster) {
    for (const ch of r.doctor.chambers) {
      const existing = byId.get(ch.chamberLocationId);
      if (!existing) {
        byId.set(ch.chamberLocationId, { ...ch, schedule: [...ch.schedule] });
        continue;
      }
      const seen = new Set(existing.schedule.map((s) => `${s.day}|${s.startTime}|${s.endTime}`));
      for (const s of ch.schedule) {
        const k = `${s.day}|${s.startTime}|${s.endTime}`;
        if (!seen.has(k)) {
          seen.add(k);
          existing.schedule.push(s);
        }
      }
      if (!existing.floor && ch.floor) existing.floor = ch.floor;
      if (!existing.room && ch.room) existing.room = ch.room;
    }
  }
  const arr = [...byId.values()];
  arr.forEach((c, i) => (c.isPrimary = i === 0));
  return arr;
}

function foldSpecialties(cluster: NormalizedRecord[]): PairedSpecialty[] {
  const byKey = new Map<string, PairedSpecialty>();
  for (const r of cluster) {
    for (const s of r.doctor.specialties) {
      const k = `${s.sourceProvider}|${s.sourceValue.toLowerCase()}`;
      if (!byKey.has(k)) byKey.set(k, { ...s });
    }
  }
  const arr = [...byKey.values()];
  const primaryIdx = arr.findIndex((s) => s.isPrimary);
  arr.forEach((s, i) => (s.isPrimary = i === (primaryIdx >= 0 ? primaryIdx : 0)));
  return arr;
}

function unionCaseInsensitive(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const k = v.trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(v.trim());
    }
  }
  return out;
}

function longest(values: Array<string | undefined>): string | undefined {
  return values.filter((v): v is string => !!v).sort((a, b) => b.length - a.length)[0];
}

function firstDefined<T>(values: Array<T | undefined | null>): T | undefined {
  return values.find((v) => v != null && v !== "") ?? undefined;
}

function foldCluster(cluster: NormalizedRecord[], tier: Tier, createdAt: string): UnifiedDoctor {
  const ordered = [...cluster].sort((a, b) =>
    `${a.source}:${a.sourceId}`.localeCompare(`${b.source}:${b.sourceId}`),
  );
  const unifiedId = createHash("sha1")
    .update(ordered.map((r) => `${r.source}:${r.sourceId}`).join("|"))
    .digest("hex")
    .slice(0, 12);

  // name — longest displayName; prefix by highest rank.
  const nameRec = [...ordered].sort(
    (a, b) => b.doctor.name.displayName.length - a.doctor.name.displayName.length,
  )[0];
  const bestPrefix = [...ordered]
    .map((r) => r.doctor.name.prefix)
    .sort((a, b) => (PREFIX_RANK[b] ?? 0) - (PREFIX_RANK[a] ?? 0))[0];
  const name = { ...nameRec.doctor.name, prefix: bestPrefix ?? nameRec.doctor.name.prefix };

  const gender = firstDefined(ordered.map((r) => r.doctor.gender));
  const bio = longest(ordered.map((r) => r.doctor.bio));
  const publicPhone = firstDefined(ordered.map((r) => r.doctor.contact?.publicPhone));
  const publicEmail = firstDefined(ordered.map((r) => r.doctor.contact?.publicEmail));
  const designation = firstDefined(ordered.map((r) => r.doctor.designation));
  const institute = firstDefined(ordered.map((r) => r.doctor.institute));
  const externalImageUrl = firstDefined(ordered.map((r) => r.doctor.externalImageUrl));

  // qualifications — union by normalized degree token.
  const qualifications: UnifiedDoctor["canonical"]["qualifications"] = [];
  const seenDegree = new Set<string>();
  for (const r of ordered) {
    for (const q of r.doctor.qualifications ?? []) {
      const k = String(q.degree).trim().toLowerCase();
      if (k && !seenDegree.has(k)) {
        seenDegree.add(k);
        qualifications.push(q);
      }
    }
  }

  const photos: UnifiedDoctor["canonical"]["photos"] = [];
  const seenPhoto = new Set<string>();
  for (const r of ordered) {
    const url = r.doctor.externalImageUrl;
    if (url && !seenPhoto.has(url)) {
      seenPhoto.add(url);
      photos.push({ source: r.source, url, localPath: (r.raw as any)?.localPhotoPath ?? undefined });
    }
  }

  // scalar conflicts — log when ≥2 records carry differing non-null values.
  const conflicts: UnifiedDoctor["conflicts"] = [];
  const scalar: Array<[string, (r: NormalizedRecord) => unknown, unknown, string]> = [
    ["name.displayName", (r) => r.doctor.name.displayName, name.displayName, "longest"],
    ["gender", (r) => r.doctor.gender, gender, "first known"],
    ["bio", (r) => r.doctor.bio, bio, "longest"],
    ["designation", (r) => r.doctor.designation, designation, "first non-null"],
    ["institute", (r) => r.doctor.institute, institute, "first non-null"],
    ["contact.publicPhone", (r) => r.doctor.contact?.publicPhone, publicPhone, "first non-null"],
  ];
  for (const [field, getter, chosenValue, reason] of scalar) {
    const values = ordered
      .map((r) => ({ source: `${r.source}:${r.sourceId}`, value: getter(r) }))
      .filter((v) => v.value != null && v.value !== "");
    if (new Set(values.map((v) => JSON.stringify(v.value))).size > 1) {
      conflicts.push({
        field,
        values,
        chosen: { source: "merged", value: chosenValue },
        reason,
      });
    }
  }

  const specialties = foldSpecialties(ordered);

  return {
    unifiedId,
    matchKey: {
      nameKey: ordered[0].dedupKeys?.nameKey ?? "",
      specialties: [...new Set(specialties.map((s) => s.canonical))],
      tier,
    },
    canonical: {
      name,
      gender,
      bio,
      contact: { publicPhone, publicEmail },
      languages: unionCaseInsensitive(ordered.flatMap((r) => r.doctor.languages ?? [])),
      qualifications,
      designation,
      institute,
      specialties,
      sourceSpecialties: unionCaseInsensitive(ordered.flatMap((r) => r.doctor.sourceSpecialties)),
      subSpecialties: unionCaseInsensitive(ordered.flatMap((r) => r.doctor.subSpecialties)),
      chambers: foldChambers(ordered),
      externalImageUrl,
      photos,
    },
    sources: ordered.map((r) => ({
      source: r.source,
      sourceId: r.sourceId,
      sourceUrl: r.sourceUrl,
      scrapedAt: r.scrapedAt,
      raw: r.raw,
    })),
    conflicts,
    warnings: ordered.flatMap((r) => r.warnings),
    createdAt,
  };
}

// --- Driver -----------------------------------------------------------------

function loadRecords(): NormalizedRecord[] {
  const all: NormalizedRecord[] = [];
  for (const src of SOURCES) {
    const file = join(NORM_DIR, `${src}.json`);
    const payload = JSON.parse(readFileSync(file, "utf8")) as { records: NormalizedRecord[] };
    all.push(...payload.records);
  }
  return all;
}

function renderReview(nameKey: string, group: NormalizedRecord[]): string {
  const line = (r: NormalizedRecord) =>
    `  - **${r.source}:${r.sourceId}** — ${r.doctor.name.displayName} · ` +
    `${[...gateCanonicals(r)].join(", ") || "—"} · ` +
    `${r.doctor.chambers.map((c) => `${c.area}/${c.district}`).join("; ") || "—"} · ` +
    `${(r.doctor.qualifications ?? []).map((q) => q.degree).join(", ") || "—"}`;
  return `### ${nameKey}\n${group.map(line).join("\n")}`;
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : null;
  const createdAt = new Date().toISOString();

  const records = loadRecords();
  const inputCounts = {
    popularDiagnostic: records.filter((r) => r.source === "popular-diagnostic").length,
    ibnSina: records.filter((r) => r.source === "ibn-sina").length,
  };

  // BLOCK by nameKey (records without one each get a unique singleton group).
  const byName = new Map<string, NormalizedRecord[]>();
  for (const r of records) {
    const key = r.dedupKeys?.nameKey || `__noname__:${r.source}:${r.sourceId}`;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(r);
  }

  const unified: UnifiedDoctor[] = [];
  const clusters: Array<{ unifiedId: string; nameKey: string; tier: Tier; sources: string[]; specialties: string[]; chamberCount: number }> = [];
  const reviewSections: string[] = [];
  let inputChamberRefs = 0;
  let outputChamberRefs = 0;

  for (const [nameKey, group] of byName) {
    for (const r of group) inputChamberRefs += r.doctor.chambers.length;
    const comps = connectedComponents(group);

    for (const comp of comps) {
      const tier = tierOf(comp, group.length);
      const emit = (cluster: NormalizedRecord[], t: Tier) => {
        const ud = foldCluster(cluster, t, createdAt);
        unified.push(ud);
        outputChamberRefs += ud.canonical.chambers.length;
        clusters.push({
          unifiedId: ud.unifiedId,
          nameKey: ud.matchKey.nameKey,
          tier: t,
          sources: ud.sources.map((s) => `${s.source}:${s.sourceId}`),
          specialties: ud.matchKey.specialties,
          chamberCount: ud.canonical.chambers.length,
        });
      };
      if (tier === "REVIEW") {
        for (const r of comp) emit([r], "REVIEW"); // explode — do not merge a collision
      } else {
        emit(comp, tier);
      }
    }

    // Review queue: any cross-source name-group that did NOT resolve to one clean 1:1 merge.
    const pd = group.filter((r) => r.source === "popular-diagnostic");
    const ibn = group.filter((r) => r.source === "ibn-sina");
    if (pd.length > 0 && ibn.length > 0) {
      const oneCleanMerge =
        comps.length === 1 &&
        comps[0].length === group.length &&
        tierOf(comps[0], group.length) === "MERGE-HIGH" &&
        new Set(comps[0].map((r) => r.source)).size === 2;
      if (!oneCleanMerge) reviewSections.push(renderReview(nameKey, group));
    }
  }

  // Report
  const tierCount = (t: Tier) => clusters.filter((c) => c.tier === t).length;
  const report = {
    inputs: inputCounts,
    clusters: {
      total: clusters.length,
      single: tierCount("SINGLE"),
      separate: tierCount("SEPARATE"),
      intraMerge_high: clusters.filter((c) => c.tier === "MERGE-HIGH" && new Set(c.sources.map((s) => s.split(":")[0])).size === 1).length,
      intraMerge_medium: tierCount("MERGE-MEDIUM"),
      crossMerge_high: clusters.filter((c) => c.tier === "MERGE-HIGH" && new Set(c.sources.map((s) => s.split(":")[0])).size === 2).length,
      review: tierCount("REVIEW"),
    },
    chambers: {
      refsUnioned: inputChamberRefs,
      afterFold: outputChamberRefs,
      sameFacilityDeduped: inputChamberRefs - outputChamberRefs,
    },
    reviewGroups: reviewSections.length,
    conflicts: { total: unified.reduce((n, u) => n + u.conflicts.length, 0) },
    warnings: { total: unified.reduce((n, u) => n + u.warnings.length, 0) },
    generatedAt: createdAt,
  };

  console.log(`unified docs: ${unified.length} (from ${records.length} records)`);
  console.table(report.clusters);

  if (dryRun) {
    console.log("(dry-run: nothing written)");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const take = limit ? unified.slice(0, limit) : unified;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "doctors.json"), JSON.stringify(take, null, 2) + "\n");
  writeFileSync(join(OUT_DIR, "clusters.json"), JSON.stringify(clusters, null, 2) + "\n");
  writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(
    join(OUT_DIR, "review-queue.md"),
    `# Cross-source review queue (${reviewSections.length})\n\n` +
      `Name-groups with records from both sources that did NOT auto-merge into one ` +
      `clean 1:1 doctor. Decide manually whether each is the same person.\n\n` +
      reviewSections.join("\n\n") +
      "\n",
  );
  const conflictByField = new Map<string, number>();
  for (const u of unified) for (const c of u.conflicts) conflictByField.set(c.field, (conflictByField.get(c.field) ?? 0) + 1);
  writeFileSync(
    join(OUT_DIR, "conflicts.md"),
    `# Conflict summary\n\n| field | count |\n|---|---|\n` +
      [...conflictByField.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `| ${f} | ${n} |`).join("\n") +
      "\n",
  );
  console.log(`→ wrote ${take.length} unified docs + audits to ${OUT_DIR}`);
}

if (process.argv[1] && process.argv[1].includes("build-unified")) {
  main();
}

export { sameDoctor, tierOf, foldCluster, connectedComponents };
