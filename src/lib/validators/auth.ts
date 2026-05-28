/**
 * Shared Zod schemas for auth flows.
 *
 * Imported by both the React Hook Form resolver (client) and the Server
 * Actions (server). One source of truth means a client-side bypass can't
 * smuggle invalid input through — the server re-parses the same shape.
 */

import { z } from "zod";
import { isValidBmdcFormat } from "@/lib/utils/bmdc";

export const RegisterSchema = z
  .object({
    email: z.string().email("Enter a valid email"),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters")
      .max(200, "Password too long")
      .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
        message: "Password must contain both letters and numbers",
      }),
    confirmPassword: z.string(),
    firstName: z.string().min(1, "First name is required").max(80),
    lastName: z.string().min(1, "Last name is required").max(80),
    bmdcNumber: z
      .string()
      .min(1, "BMDC number is required")
      .refine(isValidBmdcFormat, { message: "Enter a valid BMDC number (4–7 digits, optional A- prefix)" }),
    agreeTerms: z
      .boolean()
      .refine((v) => v === true, { message: "You must agree to the terms to continue" }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
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
