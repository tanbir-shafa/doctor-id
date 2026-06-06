/**
 * Shared profile/cover photo upload: validate → S3 (public bucket) → File doc
 * → Doctor.photo cache → cleanup of the replaced object. Used by both the
 * doctor dashboard action and the admin action so the File/cache update stays
 * atomic and consistent in one place (CLAUDE.md #12).
 */

import type { Types } from "mongoose";
import { File as FileModel, FILE_LINKED_ENTITY_TYPE } from "@/lib/db/models/files";
import { uploadBufferToS3, computeSha256, buildS3Key, deleteFromS3 } from "./s3-service";
import {
  bucketFor,
  visibilityFor,
  securityClassFor,
  UPLOAD_PURPOSE,
  publicObjectUrl,
} from "./buckets";
import { createFileDoc } from "./file-doc";
import { optimizeImageBuffer, generateBlurDataUrl } from "@/lib/images/optimize";
import { env } from "@/lib/env";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type PhotoKind = "profile" | "cover";

/** Minimal shape we need from a hydrated Doctor document. */
interface PhotoDoctorDoc {
  _id: unknown;
  get(path: string): unknown;
  set(path: string, value: unknown): unknown;
  save(): Promise<unknown>;
}

type Result = { ok: true; url: string } | { ok: false; error: string };

export async function uploadDoctorPhotoFromForm(opts: {
  doctor: PhotoDoctorDoc;
  kind: PhotoKind;
  file: FormDataEntryValue | null;
  uploadedBy: string | Types.ObjectId;
}): Promise<Result> {
  const { doctor, kind, file, uploadedBy } = opts;

  if (!file || typeof file === "string") return { ok: false, error: "No file provided." };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: "Pick a JPG, PNG, or WebP image." };
  }
  const maxMb = env().MAX_FILE_SIZE_MB;
  if (file.size > maxMb * 1024 * 1024) {
    return { ok: false, error: `File is larger than ${maxMb} MB.` };
  }

  const purpose =
    kind === "profile" ? UPLOAD_PURPOSE.doctor_profile_photo : UPLOAD_PURPOSE.doctor_cover_photo;
  const bucket = bucketFor(purpose.bucketType);
  if (!bucket) {
    return { ok: false, error: "Photo uploads aren't configured in this environment." };
  }

  const docId = doctor._id as Types.ObjectId;
  const rawBuffer = Buffer.from(await file.arrayBuffer());
  // Resize + recompress before storing. Profile photos render at ≤288px, so a
  // 1024 long-edge cap leaves retina headroom; cover gets more. This shrinks S3
  // storage and the source the next/image optimizer + OG route later fetch.
  const optimized = await optimizeImageBuffer(rawBuffer, file.type, {
    maxEdge: kind === "profile" ? 1024 : 1600,
    quality: 80,
  });
  if (!optimized.ok) return { ok: false, error: optimized.error };
  const buffer = optimized.buffer;

  const ext = MIME_EXT[file.type] ?? "jpg";
  const key = buildS3Key(`${purpose.folder}/${String(docId)}`, `${kind}.${ext}`);
  const sha256 = computeSha256(buffer);
  const blurDataUrl = await generateBlurDataUrl(buffer);

  const uploaded = await uploadBufferToS3({ buffer, bucket, key, mimeType: file.type });
  if (!uploaded) {
    return { ok: false, error: "Photo uploads aren't configured in this environment." };
  }

  const field = kind === "profile" ? "photo" : "coverPhoto";
  const prev = doctor.get(field) as { s3Bucket?: string; s3Key?: string } | null;

  const fileDoc = await createFileDoc({
    s3Bucket: bucket,
    s3Key: key,
    sha256,
    sizeBytes: uploaded.sizeBytes,
    mimeType: file.type,
    ext,
    linkedEntityType: FILE_LINKED_ENTITY_TYPE.DOCTOR,
    linkedEntityId: docId,
    uploadedBy,
    category: purpose.category,
    visibility: visibilityFor(purpose.bucketType),
    securityClass: securityClassFor(purpose.bucketType),
    title: kind === "profile" ? "Doctor profile photo" : "Doctor cover photo",
  });

  const url = publicObjectUrl(bucket, key);
  doctor.set(field, {
    file: fileDoc._id,
    url,
    s3Bucket: bucket,
    s3Key: key,
    visibility: visibilityFor(purpose.bucketType),
    blurDataUrl,
  });
  await doctor.save();

  // Best-effort cleanup of the replaced object + its File doc (CLAUDE.md #12).
  if (prev?.s3Key && prev.s3Key !== key) {
    try {
      await FileModel.updateOne(
        { s3Key: prev.s3Key, linkedEntityId: docId },
        { $set: { deletedAt: new Date() } },
      );
      await deleteFromS3(prev.s3Bucket ?? bucket, prev.s3Key);
    } catch {
      // non-fatal — the new photo is already live
    }
  }

  return { ok: true, url };
}
