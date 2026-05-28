import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { publicApiRateLimiter } from "@/lib/redis/ratelimit";

/**
 * Shared helpers for /api/v1/* route handlers.
 *
 * Centralizes rate-limiting (returns 429 with a Retry-After header), CORS
 * (locked to GET-only since the API is read-only in MVP), and consistent
 * `Cache-Control` directives so the CDN can absorb most read traffic.
 */

export async function withApiHandler<T>(
  handler: () => Promise<T>,
  options: { cacheSeconds?: number } = {},
): Promise<NextResponse> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  const rl = await publicApiRateLimiter.limit(`api:${ip}`);
  if (!rl.success) {
    const retry = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000));
    return new NextResponse(
      JSON.stringify({ error: "rate_limited", retryAfterSeconds: retry }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(retry), ...corsHeaders() },
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
        ...corsHeaders(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new NextResponse(JSON.stringify({ error: "internal_error", message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function notFoundResponse(message = "Not found") {
  return new NextResponse(JSON.stringify({ error: "not_found", message }), {
    status: 404,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
