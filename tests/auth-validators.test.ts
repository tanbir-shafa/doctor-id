import { describe, it, expect } from "vitest";
import { RegisterSchema, LoginSchema, ResetPasswordSchema } from "@/lib/validators/auth";

const VALID_REGISTER = {
  bmdcNumber: "12345",
  phone: "01712345678",
  firstName: "Karim",
  lastName: "Rahman",
  selfieS3Key: "dev/doctor/identity/selfie/registration/2026-06-03/abc123/selfie.jpg",
  agreeTerms: true,
};

describe("auth Zod validators", () => {
  it("RegisterSchema accepts a valid phone-first signup", () => {
    const result = RegisterSchema.safeParse(VALID_REGISTER);
    expect(result.success).toBe(true);
  });

  it("RegisterSchema accepts a valid claim-by-slug signup", () => {
    const result = RegisterSchema.safeParse({
      ...VALID_REGISTER,
      claimSlug: "dr-karim-rahman-cardiologist",
    });
    expect(result.success).toBe(true);
  });

  it("RegisterSchema accepts an optional email", () => {
    const result = RegisterSchema.safeParse({
      ...VALID_REGISTER,
      email: "karim@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("RegisterSchema rejects missing BMDC#", () => {
    const result = RegisterSchema.safeParse({ ...VALID_REGISTER, bmdcNumber: "" });
    expect(result.success).toBe(false);
  });

  it("RegisterSchema rejects malformed BMDC#", () => {
    const result = RegisterSchema.safeParse({ ...VALID_REGISTER, bmdcNumber: "not-numbers" });
    expect(result.success).toBe(false);
  });

  it("RegisterSchema rejects missing phone", () => {
    const result = RegisterSchema.safeParse({ ...VALID_REGISTER, phone: "" });
    expect(result.success).toBe(false);
  });

  it("RegisterSchema rejects missing name fields", () => {
    expect(RegisterSchema.safeParse({ ...VALID_REGISTER, firstName: "" }).success).toBe(false);
    expect(RegisterSchema.safeParse({ ...VALID_REGISTER, lastName: "" }).success).toBe(false);
  });

  it("RegisterSchema rejects unchecked terms checkbox", () => {
    const result = RegisterSchema.safeParse({ ...VALID_REGISTER, agreeTerms: false });
    expect(result.success).toBe(false);
  });

  it("RegisterSchema rejects an invalid email when provided", () => {
    const result = RegisterSchema.safeParse({ ...VALID_REGISTER, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("RegisterSchema rejects a missing selfieS3Key", () => {
    const result = RegisterSchema.safeParse({ ...VALID_REGISTER, selfieS3Key: undefined });
    expect(result.success).toBe(false);
  });

  it("RegisterSchema rejects an empty selfieS3Key", () => {
    const result = RegisterSchema.safeParse({ ...VALID_REGISTER, selfieS3Key: "" });
    expect(result.success).toBe(false);
  });

  it("LoginSchema requires email + non-empty password (admin path)", () => {
    expect(LoginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
    expect(LoginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
    expect(LoginSchema.safeParse({ email: "notanemail", password: "x" }).success).toBe(false);
  });

  it("ResetPasswordSchema requires token + matching passwords", () => {
    expect(
      ResetPasswordSchema.safeParse({
        email: "a@b.com",
        token: "x".repeat(20),
        password: "StrongPass123",
        confirmPassword: "StrongPass123",
      }).success,
    ).toBe(true);
    expect(
      ResetPasswordSchema.safeParse({
        email: "a@b.com",
        token: "short",
        password: "StrongPass123",
        confirmPassword: "StrongPass123",
      }).success,
    ).toBe(false);
  });
});
