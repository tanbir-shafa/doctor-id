import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

/**
 * Upstash Redis client.
 *
 * Returns null when the REST URL/token aren't configured — callers must guard
 * for this so dev environments without Upstash credentials still boot. The
 * rate-limiter wraps this and degrades to "allow everything" when absent.
 */
let _client: Redis | null = null;
let _resolved = false;

export function getRedis(): Redis | null {
  if (_resolved) return _client;
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = env();
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    _resolved = true;
    return null;
  }
  _client = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN });
  _resolved = true;
  return _client;
}
