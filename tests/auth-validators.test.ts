import { describe, it, expect } from "vitest";
import { RegisterSchema, LoginSchema, ResetPasswordSchema } from "@/lib/validators/auth";

describe("auth Zod validators", () => {
  it("RegisterSchema accepts a valid doctor signup", () => {
    const result = RegisterSchema.safeParse({
      email: "karim@example.com",
      password: "StrongPass123",
      confirmPassword: "StrongPass123",
      firstName: "Karim",
      lastName: "Rahman",
      bmdcNumber: "12345",
      agreeTerms: true,
    });
    expect(result.success).toBe(true);
  });

  it("RegisterSchema rejects a password without digits", () => {
    const result = RegisterSchema.safeParse({
      email: "karim@example.com",
      password: "OnlyLettersHere",
      confirmPassword: "OnlyLettersHere",
      firstName: "Karim",
      lastName: "Rahman",
      bmdcNumber: "12345",
      agreeTerms: true,
    });
    expect(result.success).toBe(false);
  });

  it("RegisterSchema rejects mismatched confirmation", () => {
    const result = RegisterSchema.safeParse({
      email: "karim@example.com",
      password: "StrongPass123",
      confirmPassword: "StrongPass124",
      firstName: "Karim",
      lastName: "Rahman",
      bmdcNumber: "12345",
      agreeTerms: true,
    });
    expect(result.success).toBe(false);
  });

  it("RegisterSchema rejects unchecked terms checkbox", () => {
    const result = RegisterSchema.safeParse({
      email: "karim@example.com",
      password: "StrongPass123",
      confirmPassword: "StrongPass123",
      firstName: "Karim",
      lastName: "Rahman",
      bmdcNumber: "12345",
      agreeTerms: false,
    });
    expect(result.success).toBe(false);
  });

  it("LoginSchema requires email + non-empty password", () => {
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
