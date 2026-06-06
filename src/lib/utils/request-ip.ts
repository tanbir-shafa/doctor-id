import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Trusted client-IP resolution.
 *
 * Why this exists: every per-IP rate limit is only as trustworthy as the IP it
 * keys on. The naive `x-forwarded-for.split(",")[0]` reads the LEFT-most hop,
 * which is fully client-controlled — an attacker rotates that header to dodge
 * every per-IP limit. This module derives the IP the way the deployment topology
 * actually guarantees.
 *
 * Topology: client → nginx (Elastic IP, single reverse proxy) → Node app bound
 * to 127.0.0.1. nginx is configured to:
 *   proxy_set_header X-Real-IP       $remote_addr;            # real TCP peer
 *   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;  # appends peer
 *
 * So:
 *   - `X-Real-IP` is overwritten by nginx with the real peer — it cannot be
 *     spoofed *through* nginx, so it's the most trustworthy signal.
 *   - In `X-Forwarded-For`, each trusted proxy APPENDS the IP that connected to
 *     it. The real client therefore sits `TRUSTED_PROXY_HOPS` from the RIGHT.
 *     Everything to the left of that is attacker-controlled and must be ignored.
 *
 * The app must NOT be reachable except through nginx (bind to 127.0.0.1),
 * otherwise a client could hit it directly and forge `X-Real-IP`.
 */

/**
 * Pure parser — takes the trusted-hop count explicitly so it can be unit-tested
 * without booting the env loader. Prefer `X-Real-IP`, then the hop-indexed XFF
 * entry; never the left-most (spoofable) hop.
 */
export function parseClientIp(h: Headers, trustedProxyHops: number): string {
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const hops = Math.max(1, Math.floor(trustedProxyHops) || 1);
      // The real client is `hops` entries from the right. Clamp to the left-most
      // only as a last resort (XFF shorter than the configured hop count =
      // misconfig); X-Real-IP above is the intended primary path anyway.
      const idx = parts.length - hops;
      return parts[idx >= 0 ? idx : 0]!;
    }
  }
  return "unknown";
}

/** Resolve the trusted client IP for the current request's headers. */
export function clientIp(h: Headers): string {
  return parseClientIp(h, env().TRUSTED_PROXY_HOPS);
}

/**
 * Hash the trusted client IP for use as a rate-limit key / view-dedup key /
 * abuse-forensics fingerprint. `pepper` (e.g. AUTH_SECRET) makes the hash
 * non-reversible across a DB leak; `salt` (e.g. a yyyy-mm-dd day) scopes it.
 */
export function clientIpHash(
  h: Headers,
  opts: { pepper?: string; salt?: string; length?: number } = {},
): string {
  const ip = clientIp(h);
  const material = [ip, opts.pepper, opts.salt].filter(Boolean).join("|");
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, opts.length ?? 16);
}
