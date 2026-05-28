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
