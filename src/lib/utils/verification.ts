/**
 * Verification helpers — pure, client-safe, no Mongoose.
 *
 * A doctor profile carries two independent verification axes:
 *   - BMDC (professional credential) → `bmdcVerified`
 *   - Account / identity (Gov photo ID + legal name) → `nidVerified`
 *
 * `verificationLevel` is the single derived field consumed by the public
 * badge, the FHIR seam, and admin sorting. The blue "Verified" tick
 * (`fully_verified`) requires BOTH axes; partial states surface their own
 * lesser chip.
 */

import type { VerificationLevel } from "@/types/doctor";

/** Derive the single verification level from the two underlying flags. */
export function computeVerificationLevel(
  bmdcVerified: boolean,
  nidVerified: boolean,
): VerificationLevel {
  if (bmdcVerified && nidVerified) return "fully_verified";
  if (bmdcVerified) return "bmdc_verified";
  if (nidVerified) return "identity_verified";
  return "unverified";
}

/**
 * Canonical comparison key for the NID-matched legal name. Account
 * verification binds the profile's first+last to this value, so we compare
 * case- and whitespace-insensitively (a verified doctor editing their name
 * away from the ID loses the badge — see the name-change guard).
 */
export function normalizeLegalName(first: string, last: string): string {
  return `${first} ${last}`.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface VerifiedNameDecision {
  /** True when the name edit revoked an active account verification. */
  revoked: boolean;
  /** Account-verified flag after applying the edit. */
  nidVerified: boolean;
  /** Recomputed verification level after the edit. */
  verificationLevel: VerificationLevel;
  /** The display name to persist (locked to "prefix first last" while verified). */
  displayName: string;
}

/**
 * Pure decision for a profile name edit, enforcing the account-verification
 * name binding (see §5a of the plan). Both the doctor self-edit and the admin
 * edit funnel through this so the guard can't be bypassed.
 *
 * - While account-verified, editing first/last away from the NID-matched
 *   `legalName` snapshot **revokes** identity verification and the level drops.
 * - While still account-verified, the public display name is **locked** to
 *   `prefix + first + last`; otherwise the submitted display name is honored.
 * - Changing only the prefix does NOT revoke (it isn't part of the legal name).
 */
export function resolveVerifiedNameUpdate(input: {
  prefix: string;
  firstName: string;
  lastName: string;
  submittedDisplayName: string;
  currentNidVerified: boolean;
  bmdcVerified: boolean;
  legalName: { first?: string | null; last?: string | null } | null | undefined;
}): VerifiedNameDecision {
  let nidVerified = input.currentNidVerified;
  let revoked = false;

  if (nidVerified) {
    const changed =
      normalizeLegalName(input.firstName, input.lastName) !==
      normalizeLegalName(input.legalName?.first ?? "", input.legalName?.last ?? "");
    if (changed) {
      nidVerified = false;
      revoked = true;
    }
  }

  const displayName = nidVerified
    ? `${input.prefix} ${input.firstName} ${input.lastName}`.replace(/\s+/g, " ").trim()
    : input.submittedDisplayName;

  return {
    revoked,
    nidVerified,
    verificationLevel: computeVerificationLevel(input.bmdcVerified, nidVerified),
    displayName,
  };
}
