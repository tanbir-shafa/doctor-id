import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "./client";

/**
 * Pre-configured rate-limiters.
 *
 * If Upstash credentials are missing, `limit()` resolves to `{ success: true }`
 * so dev environments aren't blocked. Production deployments MUST set the
 * Upstash env vars — the deploy README calls this out.
 */

type LimitResult = { success: boolean; limit: number; remaining: number; reset: number };

function makeLimiter(prefix: string, requests: number, windowSec: number) {
  const redis = getRedis();
  if (!redis) {
    return {
      async limit(_id: string): Promise<LimitResult> {
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

/** 5 SMS OTP verify attempts per phone per 10 minutes (A.4 claim flow). */
export const smsOtpVerifyLimiter = makeLimiter("sms-otp-verify", 5, 600);

/** 3 appointment-request submissions per IP per hour (A.3 public form). */
export const appointmentByIpLimiter = makeLimiter("appt-ip", 3, 3600);
/** 3 appointment-request submissions per phone per hour (A.3 public form). */
export const appointmentByPhoneLimiter = makeLimiter("appt-phone", 3, 3600);
