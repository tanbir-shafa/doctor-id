import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import { crossAccountCredentialsProvider } from "./aws-credentials";

let _client: S3Client | null = null;

/**
 * Lazily build the shared S3 client (cached singleton).
 *
 * Credentials resolve strictly by `NODE_ENV` (decision #7):
 *   - production  → cross-account STS role (base creds from the ECS task role)
 *   - any other   → static keys from .env (local/dev testing)
 *
 * Returns `null` when the selected mode's credentials are absent, so callers
 * surface a "not configured" error instead of throwing.
 */
export function getS3(): S3Client | null {
  if (_client) return _client;
  const e = env();

  if (e.NODE_ENV === "production") {
    const credentials = crossAccountCredentialsProvider();
    if (!credentials) return null;
    _client = new S3Client({ region: e.AWS_REGION, credentials });
    return _client;
  }

  // Non-production: static access keys.
  if (!e.AWS_ACCESS_KEY_ID || !e.AWS_SECRET_ACCESS_KEY) return null;
  _client = new S3Client({
    region: e.AWS_REGION,
    credentials: { accessKeyId: e.AWS_ACCESS_KEY_ID, secretAccessKey: e.AWS_SECRET_ACCESS_KEY },
  });
  return _client;
}
