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
  // Multi-bucket model (shafa-style). Public = profile/cover photos served by a
  // stable URL; private = identity docs (selfie, verification) read via presigned GET.
  AWS_PUBLIC_BUCKET_NAME: z.string().optional(),
  AWS_PRIVATE_BUCKET_NAME: z.string().optional(),
  // Upload limits + presign expiry (consumed by the upload actions).
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(10),
  MAX_FILES_COUNT: z.coerce.number().int().positive().default(5),
  IMAGE_UPLOAD_PRESIGN_EXPIRES_SECONDS: z.coerce.number().int().positive().default(86400),
  // AWS SES (transactional email — same cross-account role as S3). Mirrors the
  // shafa `emailService.js` config surface; see src/lib/email/ses.ts.
  SES_FROM_ADDRESS: z.string().email().optional(),
  SES_FROM_NAME: z.string().optional(),
  SES_REPLY_TO: z.string().email().optional(),
  SES_CONFIG_SET: z.string().optional(),
  // DynamoDB table backing the app-level recipient suppression list (partition
  // key `email`). Unset → the pre-send suppression check is skipped.
  SES_SUPPRESSION_TABLE: z.string().optional(),

  // Upstash. Optional in dev/test (limiters degrade per NODE_ENV — see
  // redis/ratelimit.ts), but REQUIRED in production: parseServerEnv() below
  // hard-fails the boot if they're missing under NODE_ENV=production, because
  // the rate limiters are the backbone of the OTP/login/API abuse defenses.
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Number of trusted reverse-proxy hops in front of the app (nginx = 1). Used
  // by request-ip.ts to pick the real client IP from X-Forwarded-For instead of
  // the spoofable left-most hop. Bump this if you add a CDN/LB in front of nginx.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().positive().default(1),

  // Cloudflare Turnstile (human-verification challenge on OTP/email send paths).
  // When the secret is unset, verifyTurnstile() no-ops to "pass" in dev/test and
  // FAILS CLOSED in production (see lib/security/turnstile.ts).
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // Extra origins allowed to call /api/v1 and submit Server Actions, beyond
  // NEXT_PUBLIC_APP_URL. Comma-separated absolute origins (scheme+host[:port]).
  EXTRA_ALLOWED_ORIGINS: z.string().optional(),

  // App-wide circuit breaker: max OTP/transactional SMS sends per hour across
  // ALL users. Bounds cost/blast-radius if an upstream layer is bypassed.
  SMS_GLOBAL_HOURLY_CAP: z.coerce.number().int().positive().default(2000),

  // SMS provider switch. `ssl` (SSL Wireless iSMS Plus v3) is the default;
  // `mdl` selects the legacy in-house gateway as a one-env-var fallback.
  SMS_PROVIDER: z.enum(["ssl", "mdl"]).default("ssl"),

  // SSL Wireless iSMS Plus v3 (primary SMS provider). Optional in dev: when
  // token + sid are missing, `sendSms()`/`sendSmsBatch()` log to the console
  // instead of dispatching, so OTP + campaign flows stay testable offline
  // (same UX as the SES email client). NOTE: the request IP must be
  // whitelisted in the SSL portal before live sends succeed.
  SSL_SMS_API_TOKEN: z.string().optional(),
  SSL_SMS_SID: z.string().optional(),
  SSL_SMS_API_BASE_URL: z.string().url().default("https://smsplus.sslwireless.com/api/v3"),

  // MDL SMS gateway (legacy fallback — set SMS_PROVIDER=mdl to use). Optional
  // in dev: when any of these are missing, the MDL path logs to the console
  // instead of dispatching.
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
  // Cloudflare Turnstile public site key — rendered by the client widget on the
  // register/login OTP forms. Unset → the widget is skipped (dev).
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  // Google Analytics 4 measurement ID (e.g. "G-XXXXXXXXXX"). Unset → the GA
  // script is never loaded and trackEvent()/pageview() no-op (see
  // components/analytics/google-analytics.tsx + lib/analytics/gtag.ts).
  NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().optional(),
  // Search-engine site-verification tokens, rendered as <meta> tags site-wide.
  // Paste the token from Google Search Console / Bing Webmaster Tools, deploy,
  // then click "verify". Unset → no tag is emitted.
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().optional(),
  NEXT_PUBLIC_BING_SITE_VERIFICATION: z.string().optional(),
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

  // Fail fast in production if the rate-limiter backend is missing. Without it
  // every per-IP / per-phone limiter would silently allow-all (see
  // redis/ratelimit.ts), gutting the OTP, login, and API abuse defenses. We'd
  // rather refuse to boot than run wide open.
  //
  // Skip during `next build` (NEXT_PHASE === phase-production-build): the build
  // runs with NODE_ENV=production but secrets may legitimately be absent then —
  // we only require Upstash when actually SERVING in production.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (result.data.NODE_ENV === "production" && !isBuildPhase) {
    if (!result.data.UPSTASH_REDIS_REST_URL || !result.data.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error(
        "Invalid server environment variables:\n" +
          "  - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN: required in production " +
          "(rate limiting fails closed without Redis).",
      );
    }
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
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  NEXT_PUBLIC_BING_SITE_VERIFICATION: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
});

export function adminEmails(): string[] {
  const raw = env().ADMIN_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The set of origins allowed to call /api/v1 and invoke Server Actions: the
 * app's own URL plus any `EXTRA_ALLOWED_ORIGINS`. Normalized to bare origins
 * (scheme + host + optional port), lowercased, no trailing slash.
 */
export function allowedOrigins(): string[] {
  const out = new Set<string>();
  const add = (raw?: string) => {
    if (!raw) return;
    for (const part of raw.split(",")) {
      const v = part.trim();
      if (!v) continue;
      try {
        out.add(new URL(v).origin.toLowerCase());
      } catch {
        // Ignore malformed entries rather than crash the request path.
      }
    }
  };
  add(publicEnv.NEXT_PUBLIC_APP_URL);
  add(env().EXTRA_ALLOWED_ORIGINS);
  return [...out];
}
