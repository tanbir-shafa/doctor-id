/**
 * `createFileDoc` — single place that writes the authoritative File record
 * after a server-side S3 upload, so every upload action stays consistent.
 *
 * The File doc is the source of truth (CLAUDE.md #12); denormalized caches like
 * `Doctor.photo` point at it via `file`. `finalFileName` is derived from the S3
 * key basename so callers don't have to thread it through.
 */

import type { Types } from "mongoose";
import { dbConnect } from "@/lib/db/mongoose";
import {
  File,
  type FileLinkedEntityType,
  type FileVisibility,
  type FileSecurityClass,
} from "@/lib/db/models/files";

export interface CreateFileDocInput {
  s3Bucket: string;
  s3Key: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  ext: string;
  linkedEntityType: FileLinkedEntityType;
  linkedEntityId: Types.ObjectId | string;
  uploadedBy: Types.ObjectId | string;
  category: string;
  visibility: FileVisibility;
  securityClass: FileSecurityClass;
  title?: string | null;
  originalFileName?: string | null;
}

export async function createFileDoc(input: CreateFileDocInput) {
  await dbConnect();
  const finalFileName = input.s3Key.split("/").pop() ?? input.s3Key;
  return File.create({
    linkedEntityType: input.linkedEntityType,
    linkedEntityId: input.linkedEntityId,
    title: input.title ?? null,
    category: input.category,
    visibility: input.visibility,
    securityClass: input.securityClass,
    originalFileName: input.originalFileName ?? finalFileName,
    finalFileName,
    mimeType: input.mimeType,
    ext: input.ext,
    sizeBytes: input.sizeBytes,
    sha256: input.sha256,
    s3Bucket: input.s3Bucket,
    s3Key: input.s3Key,
    uploadedBy: input.uploadedBy,
  });
}
