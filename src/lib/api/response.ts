import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { publicApiRateLimiter } from "@/lib/redis/ratelimit";
import { allowedOrigins } from "@/lib/env";
import { clientIp } from "@/lib/utils/request-ip";

/**
 * Shared helpers for /api/v1/* route handlers.
 *
 * The /api/v1 surface is FIRST-PARTY ONLY. It is locked down three ways:
 *   1. `enforceFirstParty()` — rejects (403) any request whose Origin / Referer
 *      isn't in our allowlist (the app URL + EXTRA_ALLOWED_ORIGINS). This stops
 *      cross-site browser usage and naive scripts. (It can't stop a determined
 *      client that forges the Origin header — for that we rely on nginx
 *      rate-limiting / WAF and the per-IP limiter below.)
 *   2. CORS is reflected ONLY for allowlisted origins — never `*` — so another
 *      website's JavaScript can't read our responses from a visitor's browser.
 *   3. Per-IP rate limiting (trusted client IP from request-ip.ts).
 */

/** Resolve the request's origin from the Origin header, falling back to Referer. */
function requestOrigin(h: Headers): string | null {
  const origin = h.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin.toLowerCase();
    } catch {
      return null;
    }
  }
  const referer = h.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin.toLowerCase();
    } catch {
      return null;
    }
  }
  return null;
}

/** True when the request originates from an allowlisted (first-party) origin. */
export function isFirstParty(h: Headers): boolean {
  const origin = requestOrigin(h);
  if (!origin) return false; // No Origin/Referer at all → not a first-party browser fetch.
  return allowedOrigins().includes(origin);
}

/**
 * CORS headers for a given request. Echoes the request's origin only when it's
 * allowlisted; otherwise emits no `Access-Control-Allow-Origin` (deny). `Vary:
 * Origin` keeps the CDN from caching one origin's CORS decision for another.
 */
export function corsHeaders(h?: Headers): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  const origin = h ? requestOrigin(h) : null;
  if (origin && allowedOrigins().includes(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
  }
  return base;
}

/**
 * Throw inside a `withApiHandler` callback to return a 404 (instead of the
 * default 500). Lets a route do its DB lookup INSIDE the guarded handler — so
 * the first-party + rate-limit gates run before we touch the database.
 */
export class ApiNotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "ApiNotFoundError";
  }
}

/** 403 response for a non-first-party caller. */
function forbiddenResponse(h: Headers): NextResponse {
  return new NextResponse(
    JSON.stringify({ error: "forbidden", message: "This API is restricted to the Daktar.Link application." }),
    { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders(h) } },
  );
}

export async function withApiHandler<T>(
  handler: () => Promise<T>,
  options: { cacheSeconds?: number } = {},
): Promise<NextResponse> {
  const h = await headers();

  // First-party gate before any work.
  if (!isFirstParty(h)) {
    return forbiddenResponse(h);
  }

  const ip = clientIp(h);
  const rl = await publicApiRateLimiter.limit(`api:${ip}`);
  if (!rl.success) {
    const retry = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000));
    return new NextResponse(
      JSON.stringify({ error: "rate_limited", retryAfterSeconds: retry }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(retry), ...corsHeaders(h) },
      },
    );
  }

  try {
    const data = await handler();
    const cacheHeader = options.cacheSeconds
      ? `public, s-maxage=${options.cacheSeconds}, stale-while-revalidate=${options.cacheSeconds * 2}`
      : "no-store";
    return new NextResponse(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": cacheHeader,
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
        ...corsHeaders(h),
      },
    });
  } catch (err) {
    if (err instanceof ApiNotFoundError) {
      return new NextResponse(JSON.stringify({ error: "not_found", message: err.message }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders(h) },
      });
    }
    const message = err instanceof Error ? err.message : "Internal error";
    return new NextResponse(JSON.stringify({ error: "internal_error", message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(h) },
    });
  }
}
