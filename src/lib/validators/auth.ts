/**
 * Shared Zod schemas for auth flows.
 *
 * Imported by both the React Hook Form resolver (client) and the Server
 * Actions (server). One source of truth means a client-side bypass can't
 * smuggle invalid input through — the server re-parses the same shape.
 */

import { z } from "zod";
import { isValidBmdcFormat } from "@/lib/utils/bmdc";

/**
 * Doctor registration — phone-first.
 *
 * BMDC + phone + name are required, plus a mandatory live `selfieS3Key` (the
 * S3 key returned by the live-camera capture upload). Email stays optional
 * (used later for notifications). `claimSlug` is only set when registration is
 * launched from the "Claim this profile" CTA on `/[slug]`.
 *
 * No password. Doctors authenticate by phone + SMS OTP only — admins keep
 * the email + password flow on `/auth/email/login`.
 */
export const RegisterSchema = z.object({
  bmdcNumber: z
    .string()
    .min(1, "BMDC number is required")
    .refine(isValidBmdcFormat, {
      message: "Enter a valid BMDC number (4–7 digits, optional A- prefix)",
    }),
  phone: z.string().min(1, "Phone is required"),
  firstName: z.string().min(1, "First name is required").max(80),
  lastName: z.string().min(1, "Last name is required").max(80),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  claimSlug: z.string().min(1).max(160).optional().or(z.literal("")),
  // Founding Doctor referral — the referrer's slug (from `?ref=`) or a manually
  // typed code. Optional; an invalid code is ignored, never blocks sign-up.
  referralCode: z.string().trim().max(160).optional().or(z.literal("")),
  selfieS3Key: z.string().min(1, "A live selfie is required"),
  agreeTerms: z
    .boolean()
    .refine((v) => v === true, { message: "You must agree to the terms to continue" }),
  // PDPO 2025: a live selfie is biometric (sensitive) personal data, which
  // requires specific, explicit consent separate from the general terms — and
  // the fiduciary bears the burden of proving it, so we re-validate server-side.
  agreeBiometric: z.boolean().refine((v) => v === true, {
    message: "Please consent to processing your selfie for identity verification.",
  }),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const ForgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email"),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z
  .object({
    email: z.string().email(),
    token: z.string().min(10),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters")
      .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
        message: "Password must contain both letters and numbers",
      }),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
