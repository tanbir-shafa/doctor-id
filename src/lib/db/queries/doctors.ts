/**
 * Query helpers used by /search, /[specialty], /[specialty]/[city], and the
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
  city?: string;
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

export async function searchDoctors(params: DoctorSearchParams): Promise<DoctorSearchResult> {
  await dbConnect();

  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(params.pageSize) || DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * pageSize;

  // Build the filter incrementally so empty params don't bloat the index hint.
  const filter: Record<string, unknown> = { status: "published" };

  if (params.specialty) {
    filter["specialties.name"] = new RegExp(`^${escapeRegex(params.specialty)}$`, "i");
  }
  if (params.city) {
    filter["chambers.city"] = new RegExp(`^${escapeRegex(params.city)}$`, "i");
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
            { "chambers.city": r },
            { "chambers.area": r },
            { "chambers.name": r },
          ],
        };
      });
    }
  }

  // Sort selection. With the regex-based search we no longer have a
  // textScore-driven relevance ranking — "relevance" now falls back to the
  // default (verified-first, then completeness). Honest to the user.
  let sort: Record<string, 1 | -1> = {
    verificationLevel: -1,
    profileCompletenessScore: -1,
    updatedAt: -1,
  };
  switch (params.sort) {
    case "name":
      sort = { "name.displayName": 1 };
      break;
    case "completeness":
      sort = { profileCompletenessScore: -1, verificationLevel: -1 };
      break;
    case "verified":
      sort = { verificationLevel: -1, updatedAt: -1 };
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
 * Returns the distinct cities present on published profiles. Used to populate
 * the search facets and the homepage stats.
 */
export async function listCities(): Promise<string[]> {
  await dbConnect();
  const cities = (await (Doctor as unknown as Loose).distinct(
    "chambers.city",
    { status: "published" },
  )) as string[];
  return cities.filter(Boolean).sort();
}

/**
 * Helpful counts for the homepage hero stats.
 */
export async function getStats(): Promise<{ totalDoctors: number; specialties: number; cities: number; verifiedDoctors: number }> {
  await dbConnect();
  const [totalDoctors, verifiedDoctors, cities] = await Promise.all([
    (Doctor as unknown as Loose).countDocuments({ status: "published" }),
    (Doctor as unknown as Loose).countDocuments({
      status: "published",
      verificationLevel: { $ne: "unverified" },
    }),
    listCities(),
  ]);
  const specialtyNames = (await (Doctor as unknown as Loose).distinct("specialties.name", {
    status: "published",
  })) as string[];
  return {
    totalDoctors,
    verifiedDoctors,
    cities: cities.length,
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
  city: string | null;
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
    .sort({ verificationLevel: -1, updatedAt: -1 })
    .limit(limit)
    .lean();
  return (rows as unknown[]).map((raw) => {
    const d = JSON.parse(JSON.stringify(raw)) as DoctorDocLike;
    return {
      slug: d.slug,
      name: d.name.displayName,
      specialty: d.specialties?.find((s) => s.isPrimary)?.name ?? d.specialties?.[0]?.name ?? null,
      city: d.chambers?.find((c) => c.isPrimary)?.city ?? d.chambers?.[0]?.city ?? null,
      photo: d.photo?.url ?? null,
      verificationLevel: d.verificationLevel,
    };
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
