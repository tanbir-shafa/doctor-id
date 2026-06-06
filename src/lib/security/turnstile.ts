/**
 * Cloudflare Turnstile server-side verification.
 *
 * Turnstile is a privacy-friendly, (usually) invisible CAPTCHA. The client
 * widget produces a one-time token; we verify it here BEFORE doing any
 * expensive or abusable work (sending an SMS/email, writing to S3).
 *
 * Configuration (read from process.env directly so the branches are unit-test-
 * able without the memoized env() cache; the keys are still declared +
 * documented in env.ts / .env.example):
 *   - TURNSTILE_SECRET_KEY            (server) — verification secret
 *   - NEXT_PUBLIC_TURNSTILE_SITE_KEY  (public) — rendered by the client widget
 *
 * Fail-open vs fail-closed (mirrors the SMS/SES dev no-op philosophy):
 *   - Secret UNSET in dev/test  → pass (no-op), so offline flows stay testable.
 *   - Secret UNSET in production → FAIL CLOSED (the protected form is disabled
 *     until you configure Turnstile — we never silently drop the human check
 *     in prod).
 *   - Cloudflare unreachable     → fail closed in prod, open in dev.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { ok: true } | { ok: false; error: string };

interface SiteVerifyResponse {
  success?: boolean;
  "error-codes"?: string[];
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Verify a Turnstile token. `ip` (the trusted client IP) is forwarded to
 * Cloudflare as `remoteip` for extra signal; pass `undefined`/"unknown" to skip.
 */
export async function verifyTurnstile(token: string, ip?: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (isProd()) {
      console.error(
        "[turnstile] TURNSTILE_SECRET_KEY is unset in production — failing closed. " +
          "Set TURNSTILE_SECRET_KEY + NEXT_PUBLIC_TURNSTILE_SITE_KEY to enable protected forms.",
      );
      return { ok: false, error: "Verification is temporarily unavailable. Please try again later." };
    }
    // Dev/test: no challenge configured, let the flow proceed.
    return { ok: true };
  }

  if (!token) {
    return { ok: false, error: "Please complete the verification challenge and try again." };
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      // Don't let a slow Cloudflare hang the request indefinitely.
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as SiteVerifyResponse;
    if (data.success) return { ok: true };

    console.warn("[turnstile] verification rejected:", data["error-codes"] ?? "no error codes");
    return { ok: false, error: "Verification failed. Please try the challenge again." };
  } catch (err) {
    console.error("[turnstile] verify request error:", err);
    if (isProd()) {
      return { ok: false, error: "Verification is temporarily unavailable. Please try again." };
    }
    // Dev: don't block local testing on a network hiccup to Cloudflare.
    return { ok: true };
  }
}
