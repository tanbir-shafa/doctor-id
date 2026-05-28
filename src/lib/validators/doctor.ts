/**
 * Zod schemas for doctor profile editing.
 *
 * One schema per profile section so the dashboard can save each section
 * independently without re-submitting the entire profile. The Server Action
 * layer parses these *after* the client-side resolver — never trust the client.
 */

import { z } from "zod";

export const ProfileBasicSchema = z.object({
  prefix: z.enum(["Dr.", "Prof. Dr.", "Asst. Prof. Dr.", "Assoc. Prof. Dr."]),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  displayName: z.string().min(1).max(120),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  languages: z.array(z.string().min(1)).max(10).optional(),
  bio: z.string().max(2000).optional(),
  subSpecialties: z.array(z.string()).max(10).optional(),
});
export type ProfileBasicInput = z.infer<typeof ProfileBasicSchema>;

export const ProfileContactSchema = z.object({
  publicPhone: z.string().max(40).optional().or(z.literal("")),
  publicEmail: z.string().email().optional().or(z.literal("")),
  whatsapp: z.string().max(40).optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  privacyHidePhone: z.boolean().optional(),
  privacyHideEmail: z.boolean().optional(),
});
export type ProfileContactInput = z.infer<typeof ProfileContactSchema>;

export const ProfileSpecialtiesSchema = z.object({
  specialties: z
    .array(
      z.object({
        name: z.string().min(1),
        isPrimary: z.boolean(),
        fhirCode: z.string().optional(),
      }),
    )
    .min(1, "Choose at least one specialty")
    .max(5, "Max 5 specialties"),
});
export type ProfileSpecialtiesInput = z.infer<typeof ProfileSpecialtiesSchema>;

export const ProfileQualificationsSchema = z.object({
  qualifications: z
    .array(
      z.object({
        degree: z.string().min(1),
        institution: z.string().min(1),
        year: z.number().int().min(1900).max(new Date().getFullYear() + 1),
        country: z.string().default("Bangladesh"),
      }),
    )
    .max(20),
});
export type ProfileQualificationsInput = z.infer<typeof ProfileQualificationsSchema>;

export const ProfileExperienceSchema = z.object({
  experience: z
    .array(
      z.object({
        role: z.string().min(1),
        organization: z.string().min(1),
        from: z.string().or(z.date()),
        to: z.string().or(z.date()).nullable().optional(),
        current: z.boolean().default(false),
      }),
    )
    .max(20),
});
export type ProfileExperienceInput = z.infer<typeof ProfileExperienceSchema>;

export const ChamberSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  area: z.string().min(1),
  city: z.string().min(1),
  division: z.string().min(1),
  phone: z.string().optional(),
  consultationFee: z
    .object({ amount: z.number().min(0), currency: z.enum(["BDT", "USD"]) })
    .optional(),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
  schedule: z
    .array(
      z.object({
        day: z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]),
        startTime: z.string(),
        endTime: z.string(),
        available: z.boolean().default(true),
      }),
    )
    .default([]),
  isPrimary: z.boolean().default(false),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10).refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
      message: "Password must contain both letters and numbers",
    }),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
