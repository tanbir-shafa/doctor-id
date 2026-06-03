import crypto from "node:crypto";

/**
 * One-time code helpers used by the SMS-magic-link claim flow.
 *
 * Generation: 6-digit numeric, cryptographically random.
 *   We use `crypto.randomInt(0, 1_000_000)` for uniform distribution; padding
 *   to 6 chars keeps the on-wire format constant.
 *
 * Hashing: SHA-256 with the AUTH_SECRET pepper. We store only the hash on
 * the User document — a DB leak doesn't directly hand the attacker an OTP.
 * The pepper is read lazily via `env()` so this module stays importable in
 * test environments that haven't booted the env loader.
 */
const TTL_MINUTES = 10;

export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(code: string, pepper: string): string {
  return crypto.createHash("sha256").update(`${pepper}|${code}`).digest("hex");
}

export function otpExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + TTL_MINUTES * 60 * 1000);
}

export const OTP_TTL_MINUTES = TTL_MINUTES;
export const OTP_MAX_ATTEMPTS = 5;
