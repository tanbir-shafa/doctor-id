import { describe, it, expect } from "vitest";
import { generateOtp, hashOtp, otpExpiresAt, OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS } from "@/lib/utils/otp";

describe("generateOtp", () => {
  it("returns a 6-digit string", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("pads short codes with leading zeros", () => {
    // We can't directly test randomness, but sampling many should hit small numbers.
    const codes = new Set<string>();
    for (let i = 0; i < 500; i++) codes.add(generateOtp());
    const hasShort = [...codes].some((c) => c.startsWith("0"));
    // 500 samples should comfortably exceed the 1-in-10 odds for a leading zero.
    expect(hasShort).toBe(true);
  });
});

describe("hashOtp", () => {
  it("is deterministic for the same code + pepper", () => {
    const a = hashOtp("123456", "secret");
    const b = hashOtp("123456", "secret");
    expect(a).toBe(b);
  });

  it("differs across codes", () => {
    expect(hashOtp("123456", "secret")).not.toBe(hashOtp("123457", "secret"));
  });

  it("differs across peppers", () => {
    expect(hashOtp("123456", "secret1")).not.toBe(hashOtp("123456", "secret2"));
  });

  it("produces a 64-char hex digest", () => {
    expect(hashOtp("123456", "secret")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("otpExpiresAt", () => {
  it("sets expiry TTL_MINUTES into the future", () => {
    const now = new Date("2026-05-29T10:00:00Z");
    const exp = otpExpiresAt(now);
    const expected = now.getTime() + OTP_TTL_MINUTES * 60 * 1000;
    expect(exp.getTime()).toBe(expected);
  });
});

describe("OTP constants", () => {
  it("exposes a 10-minute TTL and 5-attempt cap", () => {
    expect(OTP_TTL_MINUTES).toBe(10);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
  });
});
