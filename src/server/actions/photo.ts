"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import type { Types } from "mongoose";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { uploadDoctorPhotoFromForm } from "@/lib/s3/doctor-photo";
import { uploadDocForPurpose, DOC_MIME_TYPES } from "@/lib/s3/upload-doc";
import { uploadBufferToS3, computeSha256, buildS3Key } from "@/lib/s3/s3-service";
import { bucketFor, BUCKET_TYPE, UPLOAD_PURPOSE } from "@/lib/s3/buckets";
import { env } from "@/lib/env";
import { publicApiRateLimiter } from "@/lib/redis/ratelimit";

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

const SELFIE_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

/**
 * Unauthenticated registration selfie upload (replaces presignRegistrationDocAction).
 *
 * The live-camera capture posts the image blob here BEFORE the doctor has an
 * account. We stream it to the PRIVATE bucket and return the key + content
 * metadata (sha256/size/mime) so the registration form can carry them into
 * `startRegistrationAction`; the File doc is minted at materialization, once a
 * userId exists. IP-rate-limited (no session to scope to).
 */
export async function uploadRegistrationSelfieAction(
  formData: FormData,
): Promise<ActionResult<{ key: string; sha256: string; sizeBytes: number; mimeType: string }>> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);

  const rl = await publicApiRateLimiter.limit(`reg-selfie:${ipHash}`);
  if (!rl.success) {
    return { ok: false, error: "Too many uploads from this IP. Try again in a minute." };
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") return { ok: false, error: "No selfie provided." };
  if (!SELFIE_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: "Selfie must be an image." };
  }
  const maxMb = env().MAX_FILE_SIZE_MB;
  if (file.size > maxMb * 1024 * 1024) {
    return { ok: false, error: `Selfie is larger than ${maxMb} MB.` };
  }

  const bucket = bucketFor(BUCKET_TYPE.PRIVATE);
  if (!bucket) {
    return { ok: false, error: "Uploads aren't configured in this environment." };
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = buildS3Key(
      `${UPLOAD_PURPOSE.doctor_selfie.folder}/registration/${today}/${ipHash}`,
      `selfie.${ext}`,
    );
    const sha256 = computeSha256(buffer);
    const uploaded = await uploadBufferToS3({ buffer, bucket, key, mimeType: file.type });
    if (!uploaded) return { ok: false, error: "Uploads aren't configured in this environment." };
    return { ok: true, data: { key, sha256, sizeBytes: uploaded.sizeBytes, mimeType: file.type } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not upload selfie.";
    return { ok: false, error: message };
  }
}
