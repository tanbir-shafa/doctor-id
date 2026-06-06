"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { Types } from "mongoose";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { uploadDoctorPhotoFromForm } from "@/lib/s3/doctor-photo";
import { uploadDocForPurpose, DOC_MIME_TYPES } from "@/lib/s3/upload-doc";
import { uploadBufferToS3, computeSha256, buildS3Key } from "@/lib/s3/s3-service";
import { bucketFor, BUCKET_TYPE, UPLOAD_PURPOSE } from "@/lib/s3/buckets";
import { env } from "@/lib/env";
import { registrationSelfieRateLimiter } from "@/lib/redis/ratelimit";
import { clientIpHash } from "@/lib/utils/request-ip";
import { sniffImageMime } from "@/lib/utils/image-sniff";
import { optimizeImageBuffer } from "@/lib/images/optimize";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Server-side profile/cover photo upload — replaces the presign + confirm
 * pair. The file streams through this action to the PUBLIC bucket, we write
 * the authoritative File doc, refresh the Doctor.photo cache (pointing `file`
 * at the new File doc), and best-effort clean up the replaced object.
 */
export async function uploadProfilePhotoAction(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const kind = String(formData.get("kind") ?? "");
  if (kind !== "profile" && kind !== "cover") {
    return { ok: false, error: "Invalid upload kind." };
  }

  await dbConnect();
  const doctor = await Doctor.findOne({ ownerId: session.user.id });
  if (!doctor) return { ok: false, error: "No profile found." };

  const result = await uploadDoctorPhotoFromForm({
    doctor,
    kind,
    file: formData.get("file"),
    uploadedBy: session.user.id,
  });
  if (!result.ok) return result;

  revalidatePath(`/${doctor.get("slug")}`);
  revalidatePath("/dashboard/photos");
  return { ok: true, data: { url: result.url } };
}

/**
 * Server-side verification-document upload (BMDC cert, etc.). Stores the file
 * in the PRIVATE bucket and returns the new File doc id; the verification
 * request action then attaches that id to the ClaimRequest. Admins read it
 * back via a presigned GET URL.
 */
export async function uploadVerificationDocAction(
  formData: FormData,
): Promise<ActionResult<{ fileId: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  await dbConnect();
  const doctor = await Doctor.findOne({ ownerId: session.user.id });
  if (!doctor) return { ok: false, error: "No profile found." };

  const result = await uploadDocForPurpose({
    purposeKey: "doctor_verification",
    ownerFolderId: session.user.id,
    file: formData.get("file"),
    allowed: DOC_MIME_TYPES,
    linkedEntityId: doctor._id as Types.ObjectId,
    uploadedBy: session.user.id,
    title: "BMDC verification document",
  });
  if (!result.ok) return result;
  return { ok: true, data: { fileId: result.fileId } };
}

/**
 * Server-side identity-document upload (Gov photo ID — NID/Passport/Driving
 * License) for account verification. Stores the file in the PRIVATE bucket and
 * returns the new File doc id; requestAccountVerificationAction then attaches it
 * to the IdentityVerificationRequest. Admins read it back via a presigned GET URL.
 */
export async function uploadIdentityDocAction(
  formData: FormData,
): Promise<ActionResult<{ fileId: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  await dbConnect();
  const doctor = await Doctor.findOne({ ownerId: session.user.id });
  if (!doctor) return { ok: false, error: "No profile found." };

  const result = await uploadDocForPurpose({
    purposeKey: "doctor_identity",
    ownerFolderId: session.user.id,
    file: formData.get("file"),
    allowed: DOC_MIME_TYPES,
    linkedEntityId: doctor._id as Types.ObjectId,
    uploadedBy: session.user.id,
    title: "Government photo ID",
  });
  if (!result.ok) return result;
  return { ok: true, data: { fileId: result.fileId } };
}

const EXT_FOR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Unauthenticated registration selfie upload (replaces presignRegistrationDocAction).
 *
 * The live-camera capture posts the image blob here BEFORE the doctor has an
 * account. We stream it to the PRIVATE bucket and return the key + content
 * metadata (sha256/size/mime) so the registration form can carry them into
 * `startRegistrationAction`; the File doc is minted at materialization, once a
 * userId exists.
 *
 * This is one of the few unauthenticated write paths, so it's defended in depth:
 *   1. trusted-proxy IP rate limit (dedicated limiter, not the shared API one)
 *   2. real-content validation by MAGIC BYTES, not the client-supplied MIME, so
 *      an attacker can't store an arbitrary blob by lying about Content-Type.
 * The SMS-sending registration step (startRegistrationAction) is separately
 * Turnstile-gated, so a bot can't actually complete a registration with these.
 */
export async function uploadRegistrationSelfieAction(
  formData: FormData,
): Promise<ActionResult<{ key: string; sha256: string; sizeBytes: number; mimeType: string }>> {
  const h = await headers();
  const ipHash = clientIpHash(h, { length: 16 });

  const rl = await registrationSelfieRateLimiter.limit(`reg-selfie:${ipHash}`);
  if (!rl.success) {
    return { ok: false, error: "Too many uploads from this IP. Try again in a minute." };
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") return { ok: false, error: "No selfie provided." };
  const maxMb = env().MAX_FILE_SIZE_MB;
  if (file.size > maxMb * 1024 * 1024) {
    return { ok: false, error: `Selfie is larger than ${maxMb} MB.` };
  }

  const bucket = bucketFor(BUCKET_TYPE.PRIVATE);
  if (!bucket) {
    return { ok: false, error: "Uploads aren't configured in this environment." };
  }

  try {
    const rawBuffer = Buffer.from(await file.arrayBuffer());
    // Validate the actual bytes — ignore the client's Content-Type entirely.
    const realMime = sniffImageMime(rawBuffer);
    if (!realMime || !EXT_FOR_MIME[realMime]) {
      return { ok: false, error: "Selfie must be a real JPEG, PNG, or WebP image." };
    }
    // Resize + recompress: bakes EXIF orientation, strips metadata, and guards
    // against decompression bombs on this unauthenticated path. The client
    // already captures JPEG, so the byte win is modest — the safety is the point.
    const optimized = await optimizeImageBuffer(rawBuffer, realMime, { maxEdge: 1280, quality: 82 });
    if (!optimized.ok) return { ok: false, error: optimized.error };
    const buffer = optimized.buffer;
    const today = new Date().toISOString().slice(0, 10);
    const ext = EXT_FOR_MIME[realMime];
    const key = buildS3Key(
      `${UPLOAD_PURPOSE.doctor_selfie.folder}/registration/${today}/${ipHash}`,
      `selfie.${ext}`,
    );
    const sha256 = computeSha256(buffer);
    const uploaded = await uploadBufferToS3({ buffer, bucket, key, mimeType: realMime });
    if (!uploaded) return { ok: false, error: "Uploads aren't configured in this environment." };
    return { ok: true, data: { key, sha256, sizeBytes: uploaded.sizeBytes, mimeType: realMime } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not upload selfie.";
    return { ok: false, error: message };
  }
}
