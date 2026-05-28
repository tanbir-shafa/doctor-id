import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

let _client: S3Client | null = null;

export function getS3(): S3Client | null {
  if (_client) return _client;
  const e = env();
  if (!e.AWS_ACCESS_KEY_ID || !e.AWS_SECRET_ACCESS_KEY) return null;
  _client = new S3Client({
    region: e.AWS_REGION,
    credentials: { accessKeyId: e.AWS_ACCESS_KEY_ID, secretAccessKey: e.AWS_SECRET_ACCESS_KEY },
  });
  return _client;
}
