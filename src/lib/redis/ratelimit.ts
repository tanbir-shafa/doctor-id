import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./client";
import { env } from "@/lib/env";

/**
 * Pre-configured rate-limiters.
 *
 * Fail-open vs fail-closed:
 *   - In **development / test**, if Upstash credentials are missing, `limit()`
 *     resolves to `{ success: true }` so local dev isn't blocked.
 *   - In **production**, a missing Redis backend makes `limit()` resolve to
 *     `{ success: false }` (FAIL CLOSED). The rate limiters are the backbone of
 *     the OTP / login / API abuse defenses; we refuse traffic rather than run
 *     wide open. (env.ts also hard-fails the boot when Upstash is unset in prod,
 *     so this is a belt-and-braces second line.)
 */

type LimitResult = { success: boolean; limit: number; remaining: number; reset: number };

function makeLimiter(prefix: string, requests: number, windowSec: number) {
  const redis = getRedis();
  if (!redis) {
    const failClosed = process.env.NODE_ENV === "production";
    return {
      async limit(_id: string): Promise<LimitResult> {
        if (failClosed) {
          // No backend in prod → deny. reset ~1 min out so clients back off.
          return { success: false, limit: requests, remaining: 0, reset: Date.now() + 60_000 };
        }
        return { success: true, limit: requests, remaining: requests, reset: 0 };
      },
    };
  }
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, `${windowSec} s`),
    prefix: `did:rl:${prefix}`,
    analytics: false,
  });
}

/** 5 login attempts per IP per minute. Brute-force defence. */
export const loginRateLimiter = makeLimiter("login", 5, 60);

/** 3 password-reset / verify-email requests per IP per 10 minutes. */
export const tokenRequestRateLimiter = makeLimiter("token-req", 3, 600);

/** 60 public API requests per IP per minute. */
export const publicApiRateLimiter = makeLimiter("api", 60, 60);

/** 20 profile-view writes per IP per minute (prevents view-count spam). */
export const profileViewRateLimiter = makeLimiter("pview", 20, 60);

/** 3 SMS OTP requests per phone per 10 minutes (A.4 claim flow). */
export const smsOtpRequestLimiter = makeLimiter("sms-otp-req", 3, 600);

/**
 * 8 SMS OTP requests per IP per hour — caps how many DISTINCT phone numbers a
 * single source can target. The per-phone limiter above stops harassing one
 * number; this one stops SMS-bombing across many numbers from one origin.
 */
export const smsOtpByIpLimiter = makeLimiter("sms-otp-ip", 8, 3600);

/** 5 SMS OTP verify attempts per phone per 10 minutes (A.4 claim flow). */
export const smsOtpVerifyLimiter = makeLimiter("sms-otp-verify", 5, 600);

/** 3 appointment-request submissions per IP per hour (A.3 public form). */
export const appointmentByIpLimiter = makeLimiter("appt-ip", 3, 3600);
/** 3 appointment-request submissions per phone per hour (A.3 public form). */
export const appointmentByPhoneLimiter = makeLimiter("appt-phone", 3, 3600);

/** 6 registration-selfie uploads per IP per 10 minutes (unauth pre-account upload). */
export const registrationSelfieRateLimiter = makeLimiter("reg-selfie", 6, 600);

/** 5 profile reports per IP per 10 minutes (unauth public report form). */
export const reportProfileRateLimiter = makeLimiter("report", 5, 600);

/** 5 verification requests per user per hour (authenticated doctor). */
export const verificationRequestLimiter = makeLimiter("verify-req", 5, 3600);

/**
 * App-wide OTP/transactional-SMS circuit breaker. A single sliding-window
 * counter keyed by a constant, so EVERY OTP-class send shares one global
 * budget. If an upstream per-IP / per-phone / Turnstile layer is somehow
 * bypassed, this bounds the total spend (and SMS cost) per hour.
 *
 * `SMS_GLOBAL_HOURLY_CAP` is read at module load; it's a coarse safety ceiling,
 * set well above legitimate peak volume.
 */
export const globalSmsBudgetLimiter = makeLimiter(
  "sms-global",
  // Read lazily-safe: env() is fine here because this module is server-only.
  (() => {
    try {
      return env().SMS_GLOBAL_HOURLY_CAP;
    } catch {
      return 2000;
    }
  })(),
  3600,
);
