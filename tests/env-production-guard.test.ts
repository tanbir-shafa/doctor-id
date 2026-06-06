// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The env loader must refuse to boot in production without a rate-limiter
 * backend — otherwise every per-IP/per-phone limiter silently allows-all (see
 * redis/ratelimit.ts) and the OTP/login/API abuse defenses evaporate.
 *
 * env() memoizes, so each case resets modules + re-imports a fresh copy.
 */
describe("env() production Upstash requirement", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("MONGO_URI", "mongodb://localhost:27017/test");
    vi.stubEnv("AUTH_SECRET", "test-secret-test-secret-test-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws in production when Upstash is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    const { env } = await import("@/lib/env");
    expect(() => env()).toThrow(/UPSTASH/);
  });

  it("boots in production when Upstash is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    const { env } = await import("@/lib/env");
    expect(() => env()).not.toThrow();
  });

  it("does NOT require Upstash outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    const { env } = await import("@/lib/env");
    expect(() => env()).not.toThrow();
  });
});
