/**
 * Query helpers used by /search, /[specialty], /[specialty]/[district], and the
 * public API. Kept here as the single source of truth so query shape changes
 * (e.g., moving to Atlas Search) only touch one file.
 */

import type { Loose } from "@/lib/db/models/loose";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, Specialty, ProfileView } from "@/lib/db/models";
import type { DoctorDocLike, VerificationLevel } from "@/types/doctor";

export interface DoctorSearchParams {
  q?: string;
  specialty?: string;
  district?: string;
  area?: string;
  verificationLevel?: "unverified" | "bmdc_verified" | "fully_verified";
  language?: string;
  gender?: "male" | "female" | "other";
  sort?: "relevance" | "name" | "experience" | "completeness" | "verified";
  page?: number;
  pageSize?: number;
}

export interface DoctorSearchResult {
  doctors: DoctorDocLike[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MIN_PAGE_SIZE = 5;
// Cap how deep pagination can go. `.skip()` is O(skip) in Mongo, so an
// unbounded `?page=` (this query backs the public API) is a cheap DoS:
// page=999999999 would make Mongo walk billions of docs. 500 pages × 50/page =
// 25k docs is far past any real browsing depth.
export const MAX_PAGE = 500;

/** Clamp a caller-supplied page to [1, MAX_PAGE]; coerces junk to 1. */
export function clampPage(page: unknown): number {
  return Math.min(MAX_PAGE, Math.max(1, Number(page) || 1));
}

/** Clamp a caller-supplied pageSize to [MIN_PAGE_SIZE, MAX_PAGE_SIZE]. */
export function clampPageSize(pageSize: unknown): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Number(pageSize) || DEFAULT_PAGE_SIZE));
}

export async function searchDoctors(params: DoctorSearchParams): Promise<DoctorSearchResult> {
  await dbConnect();

  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const skip = (page - 1) * pageSize;

  // Build the filter incrementally so empty params don't bloat the index hint.
  const filter: Record<string, unknown> = { status: "published" };

  if (params.specialty) {
    filter["specialties.name"] = new RegExp(`^${escapeRegex(params.specialty)}$`, "i");
  }
  if (params.district) {
    filter["chambers.district"] = new RegExp(`^${escapeRegex(params.district)}$`, "i");
  }
  if (params.area) {
    filter["chambers.area"] = new RegExp(`^${escapeRegex(params.area)}$`, "i");
  }
  if (params.verificationLevel) filter.verificationLevel = params.verificationLevel;
  if (params.language) filter.languages = params.language;
  if (params.gender) filter.gender = params.gender;

  // Free-text search.
  //
  // We switched from Mongo's `$text` index to per-token regex `$and` of `$or`
  // because `$text` requires whole-word matches with English stemming — bad
  // fit for BD names ("tanbir" wouldn't match "Tanbir" via prefix, and our
  // users *expect* substring matching). Regex on indexed string fields is
  // fine at MVP volume; we'll swap to Atlas Search when this gets slow.
  if (params.q) {
    const tokens = params.q
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(escapeRegex);
    if (tokens.length > 0) {
      filter.$and = tokens.map((t) => {
        const r = new RegExp(t, "i");
        return {
          $or: [
            { "name.displayName": r },
            { "name.first": r },
            { "name.last": r },
            { bio: r },
            { "specialties.name": r },
            { subSpecialties: r },
            { "chambers.district": r },
            { "chambers.area": r },
            { "chambers.name": r },
          ],
        };
      });
    }
  }

  // Sort selection. With the regex-based search we no longer have a
  // textScore-driven relevance ranking — "relevance" now falls back to the
  // default (founding-first, then verified, then completeness). Honest to the
  // user. `foundingDoctor.isFounding: -1` is the headline Founding Doctor perk:
  // a boolean -1 puts `true` ahead of `false`/absent, so Founding Doctors top
  // the default ordering ~most users see (and every /[specialty] listing, which
  // routes through here). The explicit "name"/"experience" sorts are left as the
  // user's deliberate choice.
  //
  // Verification rank is sorted on the underlying `bmdcVerified`/`nidVerified`
  // booleans (-1 = true-first), NOT the `verificationLevel` string: the enum's
  // alphabetical order ("unverified" sorts ahead of "fully_verified") does not
  // match its semantic rank, so a string sort would float unverified to the top.
  // Two booleans give the intended ladder: fully(T,T) > bmdc(T,F) >
  // identity(F,T) > unverified(F,F).
  let sort: Record<string, 1 | -1> = {
    "foundingDoctor.isFounding": -1,
    bmdcVerified: -1,
    nidVerified: -1,
    profileCompletenessScore: -1,
    updatedAt: -1,
  };
  switch (params.sort) {
    case "name":
      sort = { "name.displayName": 1 };
      break;
    case "completeness":
      sort = { profileCompletenessScore: -1, bmdcVerified: -1, nidVerified: -1 };
      break;
    case "verified":
      sort = { "foundingDoctor.isFounding": -1, bmdcVerified: -1, nidVerified: -1, updatedAt: -1 };
      break;
    case "experience":
      // Approximate: rely on count of experience entries until we add a derived field.
      sort = { "experience.0": -1, updatedAt: -1 };
      break;
    // "relevance" intentionally falls through to the default ordering above.
  }

  const projection = {};

  const [rawDocs, total] = await Promise.all([
    (Doctor as unknown as Loose)
      .find(filter, projection)
      .sort(sort)
      .skip(skip)
      .limit(pageSize)
      .lean(),
    (Doctor as unknown as Loose).countDocuments(filter),
  ]);

  const doctors = (rawDocs as unknown[]).map((d) => JSON.parse(JSON.stringify(d))) as DoctorDocLike[];

  return {
    doctors,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Returns the distinct districts present on published profiles. Used to populate
 * the search facets and the homepage stats.
 */
export async function listDistricts(): Promise<string[]> {
  await dbConnect();
  const districts = (await (Doctor as unknown as Loose).distinct(
    "chambers.district",
    { status: "published" },
  )) as string[];
  return districts.filter(Boolean).sort();
}

/**
 * Helpful counts for the homepage hero stats.
 */
export async function getStats(): Promise<{ totalDoctors: number; specialties: number; districts: number; verifiedDoctors: number; foundingDoctors: number }> {
  await dbConnect();
  const [totalDoctors, verifiedDoctors, foundingDoctors, districts] = await Promise.all([
    (Doctor as unknown as Loose).countDocuments({ status: "published" }),
    (Doctor as unknown as Loose).countDocuments({
      status: "published",
      verificationLevel: { $ne: "unverified" },
    }),
    (Doctor as unknown as Loose).countDocuments({
      status: "published",
      "foundingDoctor.isFounding": true,
    }),
    listDistricts(),
  ]);
  const specialtyNames = (await (Doctor as unknown as Loose).distinct("specialties.name", {
    status: "published",
  })) as string[];
  return {
    totalDoctors,
    verifiedDoctors,
    foundingDoctors,
    districts: districts.length,
    specialties: specialtyNames.length,
  };
}

/**
 * Active specialties for the homepage grid + /search facet, sorted by the
 * curated sortOrder. Single source so the homepage and search never drift.
 */
export async function listActiveSpecialties(): Promise<{ name: string; slug: string }[]> {
  await dbConnect();
  const rows = await (Specialty as unknown as Loose)
    .find({ active: true })
    .select("name slug")
    .sort({ sortOrder: 1 })
    .lean();
  // Map to plain {name, slug} (drop _id ObjectId) so the result is safe to
  // store in unstable_cache without serialization surprises.
  return (rows as unknown as { name: string; slug: string }[]).map((r) => ({
    name: r.name,
    slug: r.slug,
  }));
}

/**
 * Total profile views across all published profiles in the last 30 days.
 * Powers the homepage "patients viewed profiles N× in the last 30 days" hook —
 * a real demand signal, never a bare vanity counter.
 */
export async function getProfileViewsLast30Days(): Promise<number> {
  await dbConnect();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return (await (ProfileView as unknown as Loose).countDocuments({
    viewedAt: { $gte: since },
  })) as number;
}

export interface FeaturedDoctor {
  slug: string;
  name: string;
  specialty: string | null;
  district: string | null;
  photo: string | null;
  verificationLevel: VerificationLevel;
}

/**
 * A few recently-updated, claimed, verified profiles (with a photo) for the
 * homepage social-proof strip. Strictly published + claimed + verified — never
 * surfaces unclaimed or unpublished rows.
 */
export async function listFeaturedVerifiedDoctors(limit = 6): Promise<FeaturedDoctor[]> {
  await dbConnect();
  const rows = await (Doctor as unknown as Loose)
    .find({
      status: "published",
      isClaimed: true,
      verificationLevel: { $ne: "unverified" },
      "photo.url": { $exists: true, $ne: null },
    })
    .select("slug name specialties chambers photo verificationLevel")
    .sort({ "foundingDoctor.isFounding": -1, bmdcVerified: -1, nidVerified: -1, updatedAt: -1 })
    .limit(limit)
    .lean();
  return (rows as unknown[]).map((raw) => {
    const d = JSON.parse(JSON.stringify(raw)) as DoctorDocLike;
    return {
      slug: d.slug,
      name: d.name.displayName,
      specialty: d.specialties?.find((s) => s.isPrimary)?.name ?? d.specialties?.[0]?.name ?? null,
      district: d.chambers?.find((c) => c.isPrimary)?.district ?? d.chambers?.[0]?.district ?? null,
      photo: d.photo?.url ?? null,
      verificationLevel: d.verificationLevel,
    };
  });
}

/**
 * The canonical catalog slug for a specialty name (e.g. "Gynecology &
 * Obstetrics" → its real slug). A doctor's embedded specialty subdoc only
 * carries the name, so breadcrumb + cross-links from a profile need this to
 * build a valid `/[specialty]` URL. Null if not in the active catalog.
 */
export async function findSpecialtySlugByName(name: string): Promise<string | null> {
  await dbConnect();
  const sp = (await (Specialty as unknown as Loose)
    .findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i"), active: true })
    .select("slug")
    .lean()) as { slug: string } | null;
  return sp?.slug ?? null;
}

/**
 * Threshold of published doctors a specialty×district combo needs to be worth
 * indexing. Set to 1 so EMPTY combos (the soft-404 / thin-content risk across
 * the ~2,300 cartesian pages) are excluded from the sitemap and get
 * robots:noindex, while every combo with real supply stays indexable. Raise
 * toward 3 once GSC confirms which thin combos hurt — see
 * .claude/plans/seo-growth-plan.md task 22.
 */
export const MIN_INDEXABLE_COMBO_DOCTORS = 1;

export interface SpecialtyDistrictCombo {
  specialtySlug: string;
  /** Lowercased, URL-ready district. */
  district: string;
  count: number;
}

/**
 * Specialty×district combos that actually have doctors (count ≥ minCount).
 * Replaces the old full cartesian product in the sitemap so crawl budget isn't
 * spent on empty pages. `$addToSet` of `_id` de-dups doctors with multiple
 * chambers in the same district.
 */
export async function listSpecialtyDistrictCombos(
  minCount = MIN_INDEXABLE_COMBO_DOCTORS,
): Promise<SpecialtyDistrictCombo[]> {
  await dbConnect();
  const specialties = await listActiveSpecialties();
  const nameToSlug = new Map(specialties.map((s) => [s.name.toLowerCase(), s.slug]));

  const rows = (await (Doctor as unknown as Loose).aggregate([
    { $match: { status: "published" } },
    { $unwind: "$specialties" },
    { $unwind: "$chambers" },
    { $group: { _id: { s: "$specialties.name", d: "$chambers.district" }, docs: { $addToSet: "$_id" } } },
    { $project: { count: { $size: "$docs" } } },
    { $match: { count: { $gte: minCount } } },
  ])) as { _id: { s?: string; d?: string }; count: number }[];

  const out: SpecialtyDistrictCombo[] = [];
  for (const r of rows) {
    const slug = nameToSlug.get((r._id.s ?? "").toLowerCase());
    const district = (r._id.d ?? "").trim();
    if (!slug || !district) continue;
    out.push({ specialtySlug: slug, district: district.toLowerCase(), count: r.count });
  }
  return out;
}

/** Published-doctor count for one specialty×district combo (drives noindex). */
export async function countDoctorsInCombo(specialtyName: string, district: string): Promise<number> {
  await dbConnect();
  return (await (Doctor as unknown as Loose).countDocuments({
    status: "published",
    "specialties.name": new RegExp(`^${escapeRegex(specialtyName)}$`, "i"),
    "chambers.district": new RegExp(`^${escapeRegex(district)}$`, "i"),
  })) as number;
}

/**
 * Districts that have published supply for one specialty, most-populous first.
 * Powers the neutral "find more doctors" hub links at the bottom of a profile
 * (category links, not named peers — see seo-progress.md task 23). Filtered to
 * count ≥ MIN_INDEXABLE_COMBO_DOCTORS so a profile never links to a noindex thin
 * combo. `$addToSet` of `_id` de-dups a doctor with two chambers in one district.
 */
export async function listDistrictsForSpecialty(
  specialtyName: string,
  limit = 8,
): Promise<{ district: string; count: number }[]> {
  await dbConnect();
  const rows = (await (Doctor as unknown as Loose).aggregate([
    {
      $match: {
        status: "published",
        "specialties.name": new RegExp(`^${escapeRegex(specialtyName)}$`, "i"),
      },
    },
    { $unwind: "$chambers" },
    { $group: { _id: "$chambers.district", docs: { $addToSet: "$_id" } } },
    { $project: { count: { $size: "$docs" } } },
    { $match: { count: { $gte: MIN_INDEXABLE_COMBO_DOCTORS } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: limit },
  ])) as { _id: string | null; count: number }[];

  return rows
    .map((r) => ({ district: String(r._id ?? "").trim(), count: r.count }))
    .filter((r) => r.district);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
