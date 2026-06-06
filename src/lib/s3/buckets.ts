/**
 * Bucket routing — mirrors shafa's BUCKET_TYPE + UPLOAD_PURPOSE_CONFIG.
 *
 * Two buckets: PUBLIC (profile/cover photos, served by a stable URL) and
 * PRIVATE (identity docs — selfie, verification — read only via presigned GET).
 * An upload "purpose" maps to a folder + bucket type so call sites stay terse.
 */

import { env } from "@/lib/env";
import {
  FILE_VISIBILITY,
  FILE_SECURITY_CLASS,
  type FileVisibility,
  type FileSecurityClass,
} from "@/lib/db/models/files";

export const BUCKET_TYPE = Object.freeze({
  PUBLIC: "public",
  PRIVATE: "private",
} as const);
export type BucketType = (typeof BUCKET_TYPE)[keyof typeof BUCKET_TYPE];

/** Concrete bucket name for a type. */
export function bucketFor(type: BucketType): string | null {
  const e = env();
  if (type === BUCKET_TYPE.PRIVATE) return e.AWS_PRIVATE_BUCKET_NAME ?? null;
  return e.AWS_PUBLIC_BUCKET_NAME ?? null;
}

/** File `visibility` enum value for a bucket type. */
export function visibilityFor(type: BucketType): FileVisibility {
  return type === BUCKET_TYPE.PRIVATE ? FILE_VISIBILITY.PRIVATE : FILE_VISIBILITY.PUBLIC;
}

/** File `securityClass` enum value for a bucket type. */
export function securityClassFor(type: BucketType): FileSecurityClass {
  return type === BUCKET_TYPE.PRIVATE ? FILE_SECURITY_CLASS.RESTRICTED : FILE_SECURITY_CLASS.PUBLIC_ASSET;
}

/** Upload purpose → { folder, bucketType, category } (mirrors shafa). */
export const UPLOAD_PURPOSE = Object.freeze({
  doctor_profile_photo: {
    folder: "doctor/profile-picture",
    bucketType: BUCKET_TYPE.PUBLIC,
    category: "doctor_profile_photo",
  },
  doctor_cover_photo: {
    folder: "doctor/cover",
    bucketType: BUCKET_TYPE.PUBLIC,
    category: "doctor_cover_photo",
  },
  doctor_verification: {
    folder: "doctor/identity/verification",
    bucketType: BUCKET_TYPE.PRIVATE,
    category: "doctor_verification",
  },
  doctor_identity: {
    folder: "doctor/identity/gov-id",
    bucketType: BUCKET_TYPE.PRIVATE,
    category: "doctor_identity",
  },
  doctor_selfie: {
    folder: "doctor/identity/selfie",
    bucketType: BUCKET_TYPE.PRIVATE,
    category: "doctor_selfie",
  },
} as const);
export type UploadPurpose = keyof typeof UPLOAD_PURPOSE;

/** Region-qualified public object URL (stable, for public-bucket assets). */
export function publicObjectUrl(bucket: string, key: string): string {
  return `https://${bucket}.s3.${env().AWS_REGION}.amazonaws.com/${key}`;
}
