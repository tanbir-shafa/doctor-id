/**
 * Signed unsubscribe tokens for outbound emails.
 *
 * The footer "unsubscribe" link must work from any email client with one click
 * and no auth — but we don't want to put a raw, mutable email address in the
 * URL (someone could unsubscribe arbitrary addresses, and it leaks the address
 * into referrer logs). So the link carries an HMAC-signed token instead:
 *
 *   token = base64url(email) "." base64url(HMAC_SHA256(email, secret))
 *
 * `verifyUnsubscribe` recomputes the MAC and returns the email only when the
 * signature matches (constant-time compare). The signing secret is
 * `UNSUBSCRIBE_SECRET` when set, else the shared `AUTH_SECRET` pepper — same
 * pattern as the OTP hasher (otp.ts).
 *
 * Pure + DB-less so it's unit-testable; the email is lowercased before signing
 * and verifying so case differences don't break the round-trip.
 */

import crypto from "node:crypto";
import { env } from "@/lib/env";

function secret(): string {
  const e = env();
  return e.UNSUBSCRIBE_SECRET || e.AUTH_SECRET;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function mac(email: string): Buffer {
  return crypto.createHmac("sha256", secret()).update(email).digest();
}

/** Build the opaque token embedded in an email's unsubscribe link. */
export function signUnsubscribe(email: string): string {
  const normalized = email.trim().toLowerCase();
  const payload = b64url(Buffer.from(normalized, "utf8"));
  const sig = b64url(mac(normalized));
  return `${payload}.${sig}`;
}

/** Return the email if the token's signature is valid, else `null`. */
export function verifyUnsubscribe(token: unknown): string | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  let email: string;
  try {
    email = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!email) return null;

  const expected = b64url(mac(email));
  // Constant-time compare; lengths must match or timingSafeEqual throws.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? email : null;
}
