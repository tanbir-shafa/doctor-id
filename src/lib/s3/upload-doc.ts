/**
 * Generic "upload a file for a purpose" helper: validate → S3 → File doc.
 *
 * Used by authenticated document uploads (e.g. BMDC verification docs) and
 * reused to materialize the registration selfie's File doc. Photos go through
 * `doctor-photo.ts` instead, which also maintains the Doctor.photo cache.
 */

import type { Types } from "mongoose";
import { uploadBufferToS3, computeSha256, buildS3Key } from "./s3-service";
import { bucketFor, visibilityFor, securityClassFor, UPLOAD_PURPOSE, type UploadPurpose } from "./buckets";
import { createFileDoc } from "./file-doc";
import { optimizeImageBuffer } from "@/lib/images/optimize";
import { FILE_LINKED_ENTITY_TYPE, type FileLinkedEntityType } from "@/lib/db/models/files";
import { env } from "@/lib/env";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export const DOC_MIME_TYPES = [...IMAGE_MIME_TYPES, "application/pdf"];

type Result =
  | { ok: true; fileId: string; key: string; bucket: string }
  | { ok: false; error: string };

export async function uploadDocForPurpose(opts: {
  purposeKey: UploadPurpose;
  /** Owner id used in the S3 key prefix (userId or doctorId). */
  ownerFolderId: string;
  file: FormDataEntryValue | null;
  allowed: string[];
  linkedEntityType?: FileLinkedEntityType;
  linkedEntityId: Types.ObjectId | string;
  uploadedBy: Types.ObjectId | string;
  title?: string | null;
}): Promise<Result> {
  const { file } = opts;
  if (!file || typeof file === "string") return { ok: false, error: "No file provided." };
  if (!opts.allowed.includes(file.type)) {
    return { ok: false, error: "Unsupported file type." };
  }
  const maxMb = env().MAX_FILE_SIZE_MB;
  if (file.size > maxMb * 1024 * 1024) {
    return { ok: false, error: `File is larger than ${maxMb} MB.` };
  }

  const purpose = UPLOAD_PURPOSE[opts.purposeKey];
  const bucket = bucketFor(purpose.bucketType);
  if (!bucket) return { ok: false, error: "Uploads aren't configured in this environment." };

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  // Recompress image docs (Gov ID / BMDC cert) before storing — conservative
  // settings (large edge, high quality) so the text/photo stays legible for
  // admin review. PDFs pass through untouched (the helper skips non-image MIME).
  const optimized = await optimizeImageBuffer(rawBuffer, file.type, { maxEdge: 2400, quality: 85 });
  if (!optimized.ok) return { ok: false, error: optimized.error };
  const buffer = optimized.buffer;

  const ext = MIME_EXT[file.type] ?? "bin";
  const key = buildS3Key(`${purpose.folder}/${opts.ownerFolderId}`, `${opts.purposeKey}.${ext}`);
  const sha256 = computeSha256(buffer);

  const uploaded = await uploadBufferToS3({ buffer, bucket, key, mimeType: file.type });
  if (!uploaded) return { ok: false, error: "Uploads aren't configured in this environment." };

  const fileDoc = await createFileDoc({
    s3Bucket: bucket,
    s3Key: key,
    sha256,
    sizeBytes: uploaded.sizeBytes,
    mimeType: file.type,
    ext,
    linkedEntityType: opts.linkedEntityType ?? FILE_LINKED_ENTITY_TYPE.DOCTOR,
    linkedEntityId: opts.linkedEntityId,
    uploadedBy: opts.uploadedBy,
    category: purpose.category,
    visibility: visibilityFor(purpose.bucketType),
    securityClass: securityClassFor(purpose.bucketType),
    title: opts.title ?? null,
    originalFileName: file.name || null,
  });

  return { ok: true, fileId: String(fileDoc._id), key, bucket };
}
