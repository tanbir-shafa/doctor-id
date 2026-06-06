// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { verifyTurnstile } from "@/lib/security/turnstile";

function mockFetch(json: unknown) {
  const fn = vi.fn(
    async (_url?: unknown, _init?: unknown) => ({ json: async () => json }) as unknown as Response,
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("verifyTurnstile", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("no-ops to pass in dev when the secret is unset (offline flows keep working)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    const fetchFn = mockFetch({ success: true });
    const r = await verifyTurnstile("");
    expect(r.ok).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled(); // no Cloudflare call when unconfigured
  });

  it("FAILS CLOSED in production when the secret is unset", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    const r = await verifyTurnstile("any-token");
    expect(r.ok).toBe(false);
  });

  it("rejects a missing token when configured", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchFn = mockFetch({ success: true });
    const r = await verifyTurnstile("");
    expect(r.ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("passes when Cloudflare returns success:true", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchFn = mockFetch({ success: true });
    const r = await verifyTurnstile("good-token", "203.0.113.7");
    expect(r.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledOnce();
    const url = fetchFn.mock.calls[0]?.[0];
    expect(String(url)).toContain("challenges.cloudflare.com/turnstile/v0/siteverify");
  });

  it("rejects when Cloudflare returns success:false", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    mockFetch({ success: false, "error-codes": ["invalid-input-response"] });
    const r = await verifyTurnstile("bad-token");
    expect(r.ok).toBe(false);
  });

  it("fails closed in production if Cloudflare is unreachable", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const r = await verifyTurnstile("token");
    expect(r.ok).toBe(false);
  });
});
