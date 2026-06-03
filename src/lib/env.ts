/**
 * Single source of truth for runtime environment variables.
 *
 * Zod-validates at module load so a missing required var fails fast at boot
 * with a clear error, instead of mysteriously later when the value is read.
 *
 * Server-only vars live on `env`. Anything that needs to ship to the browser
 * must be prefixed `NEXT_PUBLIC_` and is also re-exported on `publicEnv` for
 * type-safe client access.
 */

import { z } from "zod";

const ServerEnvSchema = z.object({
  // Mongo
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),

  // NextAuth
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars (use `openssl rand -hex 32`)"),
  AUTH_URL: z.string().url().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  // AWS
  AWS_REGION: z.string().default("ap-south-1"),
  // Static keys — the NON-PRODUCTION credential source (decision #7). In
  // production `getS3()` ignores these and assumes the cross-account role.
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  // Cross-account STS role — the PRODUCTION credential source. Base creds come
  // from the ECS task/instance role via the default provider chain.
  AWS_ASSUME_ROLE_ARN: z.string().optional(),
  AWS_S3_EXTERNAL_ID: z.string().optional(),
  // Legacy single bucket (kept for ingestion + as the public-bucket fallback).
  S3_BUCKET: z.string().default("doctor-id-uploads"),
  // Multi-bucket model (shafa-style). Public = profile/cover photos served by a
  // stable URL; private = identity docs (selfie, verification) read via presigned GET.
  AWS_PUBLIC_BUCKET_NAME: z.string().optional(),
  AWS_PRIVATE_BUCKET_NAME: z.string().optional(),
  // Upload limits + presign expiry (consumed by the upload actions).
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(10),
  MAX_FILES_COUNT: z.coerce.number().int().positive().default(5),
  IMAGE_UPLOAD_PRESIGN_EXPIRES_SECONDS: z.coerce.number().int().positive().default(86400),
  SES_FROM_EMAIL: z.string().email().optional(),
  SES_REPLY_TO: z.string().email().optional(),

  // Upstash
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // MDL SMS gateway (A.4 — SMS magic-link claim). Optional in dev: when any
  // of these are missing, `sendSms()` logs the message to the console
  // instead of dispatching, so the claim flow stays testable offline.
  MDL_SMS_API_BASE_URL: z.string().url().optional(),
  MDL_SMS_API_KEY: z.string().optional(),
  MDL_SMS_API_SENDER_ID: z.string().optional(),

  // App
  ADMIN_EMAILS: z.string().optional(),

  // Observability
  SENTRY_DSN: z.string().optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

// During `next build` Next will collect referenced env vars; we still want the
// server schema to validate at runtime, not at build-time when secrets may be
// absent from the build environment.
function parseServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("env.ts: server env accessed from the browser. Use publicEnv instead.");
  }
  const result = ServerEnvSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment variables:\n${formatted}`);
  }
  return result.data;
}

// Lazy: avoid throwing during module import in the browser bundle.
let _serverEnv: z.infer<typeof ServerEnvSchema> | null = null;
export function env() {
  if (!_serverEnv) _serverEnv = parseServerEnv();
  return _serverEnv;
}

export const publicEnv = PublicEnvSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

export function adminEmails(): string[] {
  const raw = env().ADMIN_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
