/**
 * Founding Doctor referral — pure, DB-less helpers.
 *
 * Kept side-effect free so they can be unit-tested without a DB and reused on
 * both the server (award logic) and client (progress display). The award/qualify
 * machinery that touches Mongoose lives in `src/lib/referral/service.ts`.
 */

/** Qualified referrals needed to earn the permanent Founding Doctor badge. */
export const FOUNDING_DOCTOR_THRESHOLD = 5;

/** True once a referrer has enough *qualified* referrals to earn the badge. */
export function isFoundingQualified(
  qualified: number,
  threshold: number = FOUNDING_DOCTOR_THRESHOLD,
): boolean {
  return qualified >= threshold;
}

/**
 * The shareable referral link a doctor posts to bring colleagues in. The `ref`
 * value is the referrer's BMDC number (short + easy to dictate); the resolver
 * also accepts a profile slug, so older slug-based links keep working. See
 * `resolveReferrer`.
 */
export function buildReferralLink(appUrl: string, code: string): string {
  const base = (appUrl ?? "").replace(/\/+$/, "");
  return `${base}/auth/register?ref=${encodeURIComponent(code)}`;
}
