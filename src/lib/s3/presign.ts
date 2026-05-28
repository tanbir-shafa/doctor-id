import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3 } from "./client";
import { env } from "@/lib/env";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_DOC_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf"];
const MAX_BYTES = 5 * 1024 * 1024;

export interface PresignResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

/**
 * Generates a presigned PUT URL for the browser to upload directly to S3.
 *
 * Returns null if S3 isn't configured (dev without creds). Callers should
 * surface a friendly error in that case.
 *
 * `kind` controls the MIME allow-list: profile/cover photos accept images
 * only; verification documents also accept PDF.
 */
export async function presignUpload(opts: {
  prefix: string;
  contentType: string;
  contentLength: number;
  kind?: "image" | "document";
}): Promise<PresignResult | null> {
  const allowed = opts.kind === "document" ? ALLOWED_DOC_TYPES : ALLOWED_IMAGE_TYPES;
  if (!allowed.includes(opts.contentType)) {
    throw new Error(`Unsupported content type. Allowed: ${allowed.join(", ")}.`);
  }
  if (opts.contentLength > MAX_BYTES) {
    throw new Error("File too large. Max 5 MB.");
  }

  const client = getS3();
  if (!client) return null;

  const e = env();
  const subtype = opts.contentType.split("/")[1]!.replace("jpeg", "jpg");
  const key = `${opts.prefix}/${cryptoRandomId()}.${subtype}`;

  const command = new PutObjectCommand({
    Bucket: e.S3_BUCKET,
    Key: key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
    CacheControl: "public, max-age=31536000, immutable",
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  const publicUrl = `https://${e.S3_BUCKET}.s3.${e.AWS_REGION}.amazonaws.com/${key}`;
  return { uploadUrl, publicUrl, key };
}

function cryptoRandomId(): string {
  return (globalThis.crypto as { randomUUID(): string }).randomUUID();
}
