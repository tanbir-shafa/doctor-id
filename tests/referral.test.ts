import { describe, it, expect } from "vitest";
import {
  FOUNDING_DOCTOR_THRESHOLD,
  isFoundingQualified,
  buildReferralLink,
} from "@/lib/utils/referral";

describe("isFoundingQualified", () => {
  it("uses a threshold of 5", () => {
    expect(FOUNDING_DOCTOR_THRESHOLD).toBe(5);
  });

  it("is false below the threshold", () => {
    expect(isFoundingQualified(0)).toBe(false);
    expect(isFoundingQualified(4)).toBe(false);
  });

  it("is true at and above the threshold", () => {
    expect(isFoundingQualified(5)).toBe(true);
    expect(isFoundingQualified(6)).toBe(true);
  });

  it("honors a custom threshold", () => {
    expect(isFoundingQualified(3, 3)).toBe(true);
    expect(isFoundingQualified(2, 3)).toBe(false);
  });
});

describe("buildReferralLink", () => {
  it("builds a register link with a BMDC number as ?ref=", () => {
    expect(buildReferralLink("https://daktar.link", "12345")).toBe(
      "https://daktar.link/auth/register?ref=12345",
    );
  });

  it("still works with a slug (legacy links stay valid)", () => {
    expect(buildReferralLink("https://daktar.link", "karim-rahman-cardiologist")).toBe(
      "https://daktar.link/auth/register?ref=karim-rahman-cardiologist",
    );
  });

  it("trims a trailing slash on the base URL", () => {
    expect(buildReferralLink("https://daktar.link/", "x-slug")).toBe(
      "https://daktar.link/auth/register?ref=x-slug",
    );
  });

  it("URL-encodes the slug", () => {
    expect(buildReferralLink("https://x.com", "a b")).toBe(
      "https://x.com/auth/register?ref=a%20b",
    );
  });
});
