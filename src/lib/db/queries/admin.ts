/**
 * Admin-facing query helpers.
 *
 * Sprint A scope: claim-verification SLA dashboard. The pure classification
 * helpers live in `src/lib/sla.ts` so client components can import them
 * without dragging mongoose into the browser bundle.
 */

import type { Loose } from "@/lib/db/models/loose";
import { ClaimRequest } from "@/lib/db/models/ClaimRequest";
import { Doctor } from "@/lib/db/models";
import { dbConnect } from "@/lib/db/mongoose";
import { classifySla, VERIFICATION_SLA_MS } from "@/lib/sla";
import { getPresignedUrl } from "@/lib/s3/s3-service";
import { env } from "@/lib/env";
import type { DoctorDocLike, VerificationLevel } from "@/types/doctor";

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
  documentsUploaded: string[];
  /** Verification docs as presigned GET URLs (new File-doc refs + legacy keys). */
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
  // URLs (inline disposition). Legacy raw keys are presigned via the old bucket.
  const legacyBucket = env().S3_BUCKET;
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
      const fromLegacy = await Promise.all(
        (c.documentsUploaded ?? []).map(async (k) => ({
          name: k.split("/").pop() ?? "document",
          mimeType: null as string | null,
          url: await getPresignedUrl(legacyBucket, k, 3600, {
            ResponseContentDisposition: "inline",
          }),
        })),
      );
      const selfieUrl =
        c.selfieKey && c.selfieBucket
          ? await getPresignedUrl(c.selfieBucket, c.selfieKey, 3600, {
              ResponseContentDisposition: "inline",
            })
          : null;
      return { ...c, documents: [...fromRefs, ...fromLegacy], selfieUrl };
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

  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(
    ADMIN_MAX_PAGE_SIZE,
    Math.max(ADMIN_MIN_PAGE_SIZE, Number(params.pageSize) || ADMIN_DEFAULT_PAGE_SIZE),
  );
  const skip = (page - 1) * pageSize;

  const filter: Record<string, unknown> = {};
  if (params.status) filter.status = params.status;
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
