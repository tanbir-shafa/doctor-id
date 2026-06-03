/**
 * S3 service — TypeScript port of shafa-monorepo/apps/api/app/services/s3Service.js.
 *
 * Server-side uploads (the buffer streams through our process, then PutObject),
 * SHA-256 content addressing for dedup, and presigned GET URLs for private
 * objects. The S3 client + credential resolution live in `./client`.
 */

import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";
import path from "node:path";
import { getS3 } from "./client";

/** SHA-256 hex digest of an in-memory buffer (dedup + content addressing). */
export function computeSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** `{timestamp}-{4-byte-hex}{ext}` — short, collision-resistant object name. */
export function shortFileName(originalName: string): string {
  const ext = path.extname(originalName || "").toLowerCase() || ".bin";
  const id = crypto.randomBytes(4).toString("hex");
  return `${Date.now()}-${id}${ext}`;
}

/**
 * Build an S3 object key under `rootPath`. Prefixes `dev/` outside production
 * so dev/test objects are easy to sweep (mirrors shafa's NODE_ENV switch).
 */
export function buildS3Key(rootPath: string, originalName: string): string {
  const name = shortFileName(originalName);
  return process.env.NODE_ENV === "production" ? `${rootPath}/${name}` : `dev/${rootPath}/${name}`;
}

/**
 * Upload an in-memory buffer with SSE-S3 encryption. Returns `null` when S3
 * isn't configured (callers surface a "not configured" error).
 */
export async function uploadBufferToS3(opts: {
  buffer: Buffer;
  bucket: string;
  key: string;
  mimeType: string;
}): Promise<{ key: string; sizeBytes: number } | null> {
  const client = getS3();
  if (!client) return null;
  await client.send(
    new PutObjectCommand({
      Bucket: opts.bucket,
      Key: opts.key,
      Body: opts.buffer,
      ContentType: opts.mimeType,
      ServerSideEncryption: "AES256",
    }),
  );
  return { key: opts.key, sizeBytes: opts.buffer.length };
}

/** Hard-delete an object. Callers should soft-delete the File doc too. */
export async function deleteFromS3(bucket: string, key: string): Promise<boolean> {
  const client = getS3();
  if (!client) return false;
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return true;
}

type ResponseHeaderOverrides = Pick<
  GetObjectCommandInput,
  "ResponseContentType" | "ResponseContentDisposition" | "ResponseCacheControl"
>;

/**
 * Presigned GET URL for a (typically private) object. `responseHeaders` can
 * force inline preview, e.g. `{ ResponseContentDisposition: "inline" }`.
 * Returns `null` when S3 isn't configured.
 */
export async function getPresignedUrl(
  bucket: string,
  key: string,
  expiresIn = 3600,
  responseHeaders: ResponseHeaderOverrides = {},
): Promise<string | null> {
  const client = getS3();
  if (!client) return null;
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key, ...responseHeaders });
  return getSignedUrl(client, cmd, { expiresIn });
}
