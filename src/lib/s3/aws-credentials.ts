/**
 * Cross-account STS credential provider (production).
 *
 * Mirrors shafa-monorepo/apps/api/app/services/awsCredentials.js. The base
 * credentials come from the default provider chain (the ECS task / instance
 * role); this provider assumes the bucket-account role on top. The SDK caches
 * and auto-refreshes the temporary credentials per `DurationSeconds`.
 *
 * Lazy + memoized so we never read env at import time (the browser bundle and
 * the lazy env() validator both depend on that). Returns null when the role
 * ARN isn't configured, so `getS3()` can degrade to a friendly error.
 */

import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import { env } from "@/lib/env";

let _provider: ReturnType<typeof fromTemporaryCredentials> | null = null;

export function crossAccountCredentialsProvider(): ReturnType<typeof fromTemporaryCredentials> | null {
  if (_provider) return _provider;
  const e = env();
  if (!e.AWS_ASSUME_ROLE_ARN) return null;
  _provider = fromTemporaryCredentials({
    params: {
      RoleArn: e.AWS_ASSUME_ROLE_ARN,
      RoleSessionName: `doctor-id-${e.NODE_ENV}`,
      ...(e.AWS_S3_EXTERNAL_ID ? { ExternalId: e.AWS_S3_EXTERNAL_ID } : {}),
      DurationSeconds: 3600,
    },
  });
  return _provider;
}
