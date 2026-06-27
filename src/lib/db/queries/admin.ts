/**
 * Admin-facing query helpers.
 *
 * Sprint A scope: claim-verification SLA dashboard. The pure classification
 * helpers live in `src/lib/sla.ts` so client components can import them
 * without dragging mongoose into the browser bundle.
 */

import type { Loose } from "@/lib/db/models/loose";
import { ClaimRequest } from "@/lib/db/models/ClaimRequest";
import { IdentityVerificationRequest } from "@/lib/db/models/IdentityVerificationRequest";
import { Doctor } from "@/lib/db/models";
import { dbConnect } from "@/lib/db/mongoose";
import { classifySla, VERIFICATION_SLA_MS } from "@/lib/sla";
import { getPresignedUrl } from "@/lib/s3/s3-service";
import type { DoctorDocLike, VerificationLevel, IdDocumentType } from "@/types/doctor";

export { classifySla, formatDuration, type SlaTone, type SlaClassification } from "@/lib/sla";

export interface AdminVerificationDocument {
  name: string;
  url: string | null;
  mimeType: string | null;
}

export interface AdminVerificationItem {
  _id: string;
  status: "pending" | "approved" | "rejected";
  bmdcNumberProvided: string | null;
  /** Verification docs as presigned GET URLs (from File-doc refs). */
  documents: AdminVerificationDocument[];
  /** Registration selfie as a presigned GET URL (private bucket). */
  selfieUrl: string | null;
  notesFromDoctor: string | null;
  createdAt: string;
  slaExpiresAt: string | null;
  verifiedAt: string | null;
  doctorId: {
    _id: string;
    slug: string;
    name: { displayName: string; prefix: string };
    bmdcNumber: string | null;
    verificationLevel: VerificationLevel;
  };
  /**
   * The User who initiated the claim. `populate("requestedBy", ...)` gives us
   * just the auth-identity fields admins need to vet the request: phone,
   * email (real or synthetic phone-placeholder), role, approval state.
   */
  requestedBy: {
    _id: string;
    email: string;
    phone: string | null;
    phoneVerified: boolean;
    approved: boolean;
    role: "doctor" | "admin" | "patient";
  } | null;
}

export interface AdminVerificationListResult {
  items: AdminVerificationItem[];
  buckets: { breached: number; lt6h: number; lt12h: number; gt12h: number };
}

/**
 * List pending claim requests ordered by SLA breach risk (oldest expiry
 * first). Caller renders them as the queue; bucket counts are summarized
 * at the top.
 */
export async function listPendingClaimRequests(now: Date = new Date()): Promise<AdminVerificationListResult> {
  const pending = await (ClaimRequest as unknown as Loose)
    .find({ status: "pending" })
    .sort({ slaExpiresAt: 1, createdAt: 1 })
    .populate("doctorId", "slug name bmdcNumber verificationLevel")
    .populate("requestedBy", "email phone phoneVerified approved role")
    .populate("documentFileIds", "s3Bucket s3Key mimeType originalFileName")
    .lean();

  const raw = (pending as unknown[]).map(
    (c) =>
      JSON.parse(JSON.stringify(c)) as AdminVerificationItem & {
        documentFileIds?: Array<{
          s3Bucket?: string;
          s3Key?: string;
          mimeType?: string;
          originalFileName?: string;
        }>;
        selfieKey?: string | null;
        selfieBucket?: string | null;
      },
  );

  // Verification docs live in the private bucket → hand the admin presigned GET
  // URLs (inline disposition).
  const items: AdminVerificationItem[] = await Promise.all(
    raw.map(async (c) => {
      const fromRefs = await Promise.all(
        (c.documentFileIds ?? []).map(async (f) => ({
          name: f.originalFileName ?? (f.s3Key ?? "").split("/").pop() ?? "document",
          mimeType: f.mimeType ?? null,
          url:
            f.s3Bucket && f.s3Key
              ? await getPresignedUrl(f.s3Bucket, f.s3Key, 3600, {
                  ResponseContentDisposition: "inline",
                })
              : null,
        })),
      );
      const selfieUrl =
        c.selfieKey && c.selfieBucket
          ? await getPresignedUrl(c.selfieBucket, c.selfieKey, 3600, {
              ResponseContentDisposition: "inline",
            })
          : null;
      return { ...c, documents: fromRefs, selfieUrl };
    }),
  );

  const buckets = { breached: 0, lt6h: 0, lt12h: 0, gt12h: 0 };
  for (const c of items) {
    const k = classifySla(c, now).bucket;
    if (k === "breached" || k === "lt6h" || k === "lt12h" || k === "gt12h") {
      buckets[k] += 1;
    }
  }

  return { items, buckets };
}

/** VERIFICATION_SLA_MS re-export so UIs can show the 24h promise without
 *  importing the model. */
export const SLA_WINDOW_MS = VERIFICATION_SLA_MS;

// --- Account (identity) verification queue ---

export interface AdminIdentityItem {
  _id: string;
  status: "pending" | "approved" | "rejected";
  legalName: { first: string; last: string };
  idDocumentType: IdDocumentType;
  /** Gov ID image(s) as presigned GET URLs (private bucket). */
  documents: AdminVerificationDocument[];
  notesFromDoctor: string | null;
  createdAt: string;
  slaExpiresAt: string | null;
  verifiedAt: string | null;
  doctorId: {
    _id: string;
    slug: string;
    name: { displayName: string; prefix: string; first: string; last: string };
    verificationLevel: VerificationLevel;
  };
  requestedBy: {
    _id: string;
    email: string;
    phone: string | null;
    phoneVerified: boolean;
    approved: boolean;
    role: "doctor" | "admin" | "patient";
  } | null;
}

export interface AdminIdentityListResult {
  items: AdminIdentityItem[];
  buckets: { breached: number; lt6h: number; lt12h: number; gt12h: number };
}

/**
 * List pending identity-verification requests ordered by SLA breach risk
 * (oldest expiry first). Mirrors `listPendingClaimRequests`, but the documents
 * are the Gov photo ID (no BMDC/selfie). The current profile name is populated
 * so the reviewer can compare it against the submitted legal name.
 */
export async function listPendingIdentityRequests(
  now: Date = new Date(),
): Promise<AdminIdentityListResult> {
  const pending = await (IdentityVerificationRequest as unknown as Loose)
    .find({ status: "pending" })
    .sort({ slaExpiresAt: 1, createdAt: 1 })
    .populate("doctorId", "slug name verificationLevel")
    .populate("requestedBy", "email phone phoneVerified approved role")
    .populate("documentFileIds", "s3Bucket s3Key mimeType originalFileName")
    .lean();

  const raw = (pending as unknown[]).map(
    (c) =>
      JSON.parse(JSON.stringify(c)) as AdminIdentityItem & {
        documentFileIds?: Array<{
          s3Bucket?: string;
          s3Key?: string;
          mimeType?: string;
          originalFileName?: string;
        }>;
      },
  );

  const items: AdminIdentityItem[] = await Promise.all(
    raw.map(async (c) => {
      const documents = await Promise.all(
        (c.documentFileIds ?? []).map(async (f) => ({
          name: f.originalFileName ?? (f.s3Key ?? "").split("/").pop() ?? "document",
          mimeType: f.mimeType ?? null,
          url:
            f.s3Bucket && f.s3Key
              ? await getPresignedUrl(f.s3Bucket, f.s3Key, 3600, {
                  ResponseContentDisposition: "inline",
                })
              : null,
        })),
      );
      return { ...c, documents };
    }),
  );

  const buckets = { breached: 0, lt6h: 0, lt12h: 0, gt12h: 0 };
  for (const c of items) {
    const k = classifySla(c, now).bucket;
    if (k === "breached" || k === "lt6h" || k === "lt12h" || k === "gt12h") {
      buckets[k] += 1;
    }
  }

  return { items, buckets };
}

// --- Admin doctor list ---

export interface AdminDoctorListParams {
  q?: string;
  status?: string;
  claimed?: string;
  /** Filter by exact specialty name (matches any entry in `specialties.name`). */
  specialty?: string;
  /**
   * When truthy, restrict the result to doctors flagged by the dedup pipeline
   * as members of a manual-review group (`dupReviewGroup` field set). Used
   * by the admin "Pending duplicate review" filter.
   */
  reviewGroup?: boolean;
  page?: number;
  pageSize?: number;
}

export interface AdminDoctorListResult {
  doctors: DoctorDocLike[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ADMIN_DEFAULT_PAGE_SIZE = 20;
const ADMIN_MIN_PAGE_SIZE = 10;
const ADMIN_MAX_PAGE_SIZE = 100;
const ADMIN_MAX_PAGE = 10000;
/** Valid Doctor.status values — guards the admin list filter (see Doctor model). */
const DOCTOR_STATUSES: readonly string[] = ["draft", "published", "suspended"];

/**
 * Lists doctors for the admin /admin/doctors table.
 *
 * Mirrors the public `searchDoctors` shape (`{ doctors, total, page, pageSize,
 * totalPages }`) so the existing `<Pagination>` component renders unchanged.
 * Sort is "most recently updated first" to keep the operator's working set on
 * page 1. Ops will run this against a 15k-row collection — keep the projection
 * lean and rely on the indexes that `searchDoctors` also uses.
 */
export async function listDoctorsForAdmin(params: AdminDoctorListParams): Promise<AdminDoctorListResult> {
  await dbConnect();

  const page = Math.min(ADMIN_MAX_PAGE, Math.max(1, Number(params.page) || 1));
  const pageSize = Math.min(
    ADMIN_MAX_PAGE_SIZE,
    Math.max(ADMIN_MIN_PAGE_SIZE, Number(params.pageSize) || ADMIN_DEFAULT_PAGE_SIZE),
  );
  const skip = (page - 1) * pageSize;

  const filter: Record<string, unknown> = {};
  // Constrain `status` to the known enum before it reaches the Mongoose filter —
  // never let an arbitrary value (or, defensively, a non-string operator object)
  // flow straight into the query.
  if (typeof params.status === "string" && DOCTOR_STATUSES.includes(params.status)) {
    filter.status = params.status;
  }
  if (params.claimed === "true") filter.isClaimed = true;
  if (params.claimed === "false") filter.isClaimed = false;
  if (params.specialty && params.specialty.trim()) {
    // Case-insensitive exact match — the Doctor.specialties array stores the
    // catalog `name` verbatim, so a `^…$/i` regex is the safest match without
    // hitting the parallel-array index restriction in #5 of CLAUDE.md.
    filter["specialties.name"] = new RegExp(
      `^${escapeRegex(params.specialty.trim())}$`,
      "i",
    );
  }
  if (params.reviewGroup) {
    filter.dupReviewGroup = { $exists: true, $ne: null };
  }
  if (params.q && params.q.trim()) {
    filter.$text = { $search: params.q.trim() };
  }

  // When filtering to review groups, sort by group ID so members cluster
  // together — ops triages a group at a time. Otherwise, most-recently
  // updated first.
  const sort: Record<string, 1 | -1> = params.reviewGroup
    ? { dupReviewGroup: 1, updatedAt: -1 }
    : { updatedAt: -1 };

  const [rawDocs, total] = await Promise.all([
    (Doctor as unknown as Loose)
      .find(filter)
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

// --- Admin profile-views summary ---

/** The view metric the summary table is sorted by. */
export type AdminViewsSort = "all" | "30d" | "recent";

export interface AdminViewsListParams {
  /** Which view metric to sort by, descending. Defaults to all-time. */
  sort?: string;
  /** Optional status scope (draft/published/suspended). */
  status?: string;
  page?: number;
  pageSize?: number;
}

/** Maps the `sort` param to a Mongo sort spec with a stable `_id` tiebreaker. */
const VIEWS_SORTS: Record<AdminViewsSort, Record<string, 1 | -1>> = {
  all: { profileViews: -1, _id: 1 },
  "30d": { "metrics.profileViews30d": -1, _id: 1 },
  recent: { "metrics.lastViewedAt": -1, _id: 1 },
};

/**
 * Lists doctors ranked by profile-view counts for the admin
 * `/admin/profile-views` table.
 *
 * Reads the **denormalized counters on Doctor** (`profileViews`,
 * `metrics.profileViews30d`, `metrics.lastViewedAt`) — no aggregation over the
 * `ProfileView` time-series — so it stays fast on a 15k-row collection. Returns
 * the same `{ doctors, total, page, pageSize, totalPages }` shape as
 * `listDoctorsForAdmin` so the shared `<Pagination>` renders unchanged.
 */
export async function listDoctorsByViews(params: AdminViewsListParams): Promise<AdminDoctorListResult> {
  await dbConnect();

  const page = Math.min(ADMIN_MAX_PAGE, Math.max(1, Number(params.page) || 1));
  const pageSize = Math.min(
    ADMIN_MAX_PAGE_SIZE,
    Math.max(ADMIN_MIN_PAGE_SIZE, Number(params.pageSize) || ADMIN_DEFAULT_PAGE_SIZE),
  );
  const skip = (page - 1) * pageSize;

  const filter: Record<string, unknown> = {};
  if (typeof params.status === "string" && DOCTOR_STATUSES.includes(params.status)) {
    filter.status = params.status;
  }

  const sortKey: AdminViewsSort =
    params.sort === "30d" || params.sort === "recent" ? params.sort : "all";

  const [rawDocs, total] = await Promise.all([
    (Doctor as unknown as Loose)
      .find(filter)
      .sort(VIEWS_SORTS[sortKey])
      .skip(skip)
      .limit(pageSize)
      .select("slug name profileViews metrics status isClaimed")
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

// --- Admin chamber list (flattened across all doctors) ---

export interface AdminChamberListParams {
  q?: string;
  division?: string;
  district?: string;
  /** Filter by the parent doctor's status (draft/published/suspended). */
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminChamberRow {
  doctorId: string;
  slug: string;
  doctorName: string;
  doctorStatus: string;
  chamberId: string;
  name: string;
  address: string;
  area: string;
  district: string;
  division: string;
  phone: string | null;
  floor: string | null;
  room: string | null;
  consultationFee: { amount: number; currency: "BDT" | "USD" } | null;
  scheduleCount: number;
  isPrimary: boolean;
}

export interface AdminChamberListResult {
  chambers: AdminChamberRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Flattens every doctor's embedded `chambers[]` into a single global list for
 * the /admin/chambers oversight page. Chambers are subdocuments (no top-level
 * collection — see CLAUDE.md #19), so we `$unwind` them and carry the parent
 * doctor's slug/name/status onto each row.
 *
 * Filters: free-text `q` (chamber name/address/area OR doctor display name),
 * exact `division`/`district`, and the parent doctor's `status`. When a
 * division/district filter is set we pre-`$match` before the unwind so the
 * `{"chambers.district": 1}` index narrows the candidate docs, then re-match
 * the exact chamber after the unwind (one doctor may have chambers in several
 * districts, and the unwind would otherwise keep the non-matching ones).
 */
export async function listChambersForAdmin(
  params: AdminChamberListParams,
): Promise<AdminChamberListResult> {
  await dbConnect();

  const page = Math.min(ADMIN_MAX_PAGE, Math.max(1, Number(params.page) || 1));
  const pageSize = Math.min(
    ADMIN_MAX_PAGE_SIZE,
    Math.max(ADMIN_MIN_PAGE_SIZE, Number(params.pageSize) || ADMIN_DEFAULT_PAGE_SIZE),
  );
  const skip = (page - 1) * pageSize;

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const division = typeof params.division === "string" ? params.division.trim() : "";
  const district = typeof params.district === "string" ? params.district.trim() : "";
  const status =
    typeof params.status === "string" && DOCTOR_STATUSES.includes(params.status)
      ? params.status
      : "";

  // Pre-unwind narrowing — leans on the chambers.district / status indexes.
  const preMatch: Record<string, unknown> = {};
  if (status) preMatch.status = status;
  if (district) preMatch["chambers.district"] = district;
  if (division) preMatch["chambers.division"] = division;

  // Per-chamber exact match after the unwind (drops sibling chambers in other
  // districts that rode along on a matching parent doc).
  const chamberMatch: Record<string, unknown> = {};
  if (district) chamberMatch["chambers.district"] = district;
  if (division) chamberMatch["chambers.division"] = division;
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    chamberMatch.$or = [
      { "chambers.name": rx },
      { "chambers.address": rx },
      { "chambers.area": rx },
      { "name.displayName": rx },
    ];
  }

  const pipeline: unknown[] = [
    ...(Object.keys(preMatch).length ? [{ $match: preMatch }] : []),
    { $unwind: "$chambers" },
    ...(Object.keys(chamberMatch).length ? [{ $match: chamberMatch }] : []),
    { $sort: { "chambers.district": 1, "name.displayName": 1, "chambers.name": 1 } },
    {
      $facet: {
        rows: [
          { $skip: skip },
          { $limit: pageSize },
          {
            $project: {
              _id: 0,
              doctorId: "$_id",
              slug: "$slug",
              doctorName: "$name.displayName",
              doctorStatus: "$status",
              chamberId: "$chambers._id",
              name: "$chambers.name",
              address: "$chambers.address",
              area: "$chambers.area",
              district: "$chambers.district",
              division: "$chambers.division",
              phone: "$chambers.phone",
              floor: "$chambers.floor",
              room: "$chambers.room",
              consultationFee: "$chambers.consultationFee",
              isPrimary: "$chambers.isPrimary",
              scheduleCount: { $size: { $ifNull: ["$chambers.schedule", []] } },
            },
          },
        ],
        total: [{ $count: "n" }],
      },
    },
  ];

  const agg = (await (Doctor as unknown as Loose).aggregate(pipeline)) as Array<{
    rows: unknown[];
    total: { n: number }[];
  }>;

  const facet = agg[0] ?? { rows: [], total: [] };
  const total = facet.total[0]?.n ?? 0;
  const chambers = (facet.rows as unknown[]).map(
    (r) => JSON.parse(JSON.stringify(r)) as AdminChamberRow,
  );

  return {
    chambers,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
