// @vitest-environment node
import { describe, it, expect } from "vitest";
import { signUnsubscribe, verifyUnsubscribe } from "@/lib/outbound/unsubscribe-token";

// AUTH_SECRET is provided by vitest.setup.ts; UNSUBSCRIBE_SECRET is unset, so
// the token signer falls back to AUTH_SECRET.

describe("unsubscribe token", () => {
  it("round-trips a valid email", () => {
    const token = signUnsubscribe("doctor@example.com");
    expect(verifyUnsubscribe(token)).toBe("doctor@example.com");
  });

  it("normalizes case before signing + verifying", () => {
    const token = signUnsubscribe("Doctor@Example.COM");
    // The token decodes to the lowercased address.
    expect(verifyUnsubscribe(token)).toBe("doctor@example.com");
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const token = signUnsubscribe("doctor@example.com");
    const [, sig] = token.split(".");
    const forged = `${Buffer.from("attacker@evil.com").toString("base64url")}.${sig}`;
    expect(verifyUnsubscribe(forged)).toBeNull();
  });

  it("rejects a wrong/garbage signature", () => {
    const token = signUnsubscribe("doctor@example.com");
    const [payload] = token.split(".");
    expect(verifyUnsubscribe(`${payload}.deadbeef`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyUnsubscribe("")).toBeNull();
    expect(verifyUnsubscribe("nodot")).toBeNull();
    expect(verifyUnsubscribe(null)).toBeNull();
    expect(verifyUnsubscribe(undefined)).toBeNull();
    expect(verifyUnsubscribe(".")).toBeNull();
  });
});
