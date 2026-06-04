import { describe, it, expect } from "vitest";
import {
  computeVerificationLevel,
  normalizeLegalName,
  resolveVerifiedNameUpdate,
} from "@/lib/utils/verification";

describe("computeVerificationLevel", () => {
  it("requires BOTH flags for the blue tick (fully_verified)", () => {
    expect(computeVerificationLevel(true, true)).toBe("fully_verified");
  });
  it("BMDC only → bmdc_verified", () => {
    expect(computeVerificationLevel(true, false)).toBe("bmdc_verified");
  });
  it("account/identity only → identity_verified", () => {
    expect(computeVerificationLevel(false, true)).toBe("identity_verified");
  });
  it("neither → unverified", () => {
    expect(computeVerificationLevel(false, false)).toBe("unverified");
  });
});

describe("normalizeLegalName", () => {
  it("folds case and collapses whitespace", () => {
    expect(normalizeLegalName("Abdul", "Karim")).toBe(
      normalizeLegalName("  abdul ", "  karim  "),
    );
    expect(normalizeLegalName("Abdul", "Karim")).toBe("abdul karim");
  });
  it("distinguishes a genuinely different name", () => {
    expect(normalizeLegalName("Abdul", "Karim")).not.toBe(
      normalizeLegalName("Abdul", "Rahim"),
    );
  });
});

describe("resolveVerifiedNameUpdate — account-verification name binding", () => {
  const verified = { first: "Abdul", last: "Karim" };

  it("keeps verification when the name is unchanged (and locks the display name)", () => {
    const r = resolveVerifiedNameUpdate({
      prefix: "Dr.",
      firstName: "Abdul",
      lastName: "Karim",
      submittedDisplayName: "Something Else Entirely",
      currentNidVerified: true,
      bmdcVerified: true,
      legalName: verified,
    });
    expect(r.revoked).toBe(false);
    expect(r.nidVerified).toBe(true);
    expect(r.verificationLevel).toBe("fully_verified");
    // Display name is forced to "prefix first last" while verified — no spoofing.
    expect(r.displayName).toBe("Dr. Abdul Karim");
  });

  it("revokes when first/last changes — fully_verified drops to bmdc_verified", () => {
    const r = resolveVerifiedNameUpdate({
      prefix: "Dr.",
      firstName: "Abdul",
      lastName: "Rahim",
      submittedDisplayName: "Dr. Abdul Rahim",
      currentNidVerified: true,
      bmdcVerified: true,
      legalName: verified,
    });
    expect(r.revoked).toBe(true);
    expect(r.nidVerified).toBe(false);
    expect(r.verificationLevel).toBe("bmdc_verified");
    // Once unverified, the submitted display name is honored again.
    expect(r.displayName).toBe("Dr. Abdul Rahim");
  });

  it("revokes identity_verified → unverified when there is no BMDC", () => {
    const r = resolveVerifiedNameUpdate({
      prefix: "Dr.",
      firstName: "New",
      lastName: "Name",
      submittedDisplayName: "Dr. New Name",
      currentNidVerified: true,
      bmdcVerified: false,
      legalName: verified,
    });
    expect(r.revoked).toBe(true);
    expect(r.verificationLevel).toBe("unverified");
  });

  it("does NOT revoke on a prefix-only change (prefix isn't part of the legal name)", () => {
    const r = resolveVerifiedNameUpdate({
      prefix: "Prof. Dr.",
      firstName: "Abdul",
      lastName: "Karim",
      submittedDisplayName: "ignored while verified",
      currentNidVerified: true,
      bmdcVerified: true,
      legalName: verified,
    });
    expect(r.revoked).toBe(false);
    expect(r.nidVerified).toBe(true);
    expect(r.displayName).toBe("Prof. Dr. Abdul Karim");
  });

  it("passes through unchanged for a non-account-verified doctor", () => {
    const r = resolveVerifiedNameUpdate({
      prefix: "Dr.",
      firstName: "Any",
      lastName: "Name",
      submittedDisplayName: "Dr. Custom Display",
      currentNidVerified: false,
      bmdcVerified: true,
      legalName: null,
    });
    expect(r.revoked).toBe(false);
    expect(r.nidVerified).toBe(false);
    expect(r.verificationLevel).toBe("bmdc_verified");
    expect(r.displayName).toBe("Dr. Custom Display");
  });
});
