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

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const ScheduleSlotSchema = z
  .object({
    day: z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]),
    startTime: z.string().regex(HHMM_RE, "Use HH:mm (24-hour)"),
    endTime: z.string().regex(HHMM_RE, "Use HH:mm (24-hour)"),
    available: z.boolean().default(true),
  })
  .refine((s) => s.startTime < s.endTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });

export const ChamberSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(120),
    address: z.string().min(1, "Address is required").max(240),
    area: z.string().min(1, "Area is required").max(120),
    city: z.string().min(1, "City is required").max(80),
    division: z.string().min(1, "Division is required").max(80),
    phone: z.string().max(40).optional().nullable(),
    consultationFee: z
      .object({ amount: z.number().min(0).max(100000), currency: z.enum(["BDT", "USD"]) })
      .optional(),
    coordinates: z
      .object({
        lat: z.number().min(-90).max(90).nullable(),
        lng: z.number().min(-180).max(180).nullable(),
      })
      .optional(),
    schedule: z.array(ScheduleSlotSchema).default([]),
    isPrimary: z.boolean().default(false),
  })
  .superRefine((chamber, ctx) => {
    // Detect overlapping slots within the same day for this chamber.
    const byDay = new Map<string, Array<{ startTime: string; endTime: string; idx: number }>>();
    chamber.schedule.forEach((slot, idx) => {
      const arr = byDay.get(slot.day) ?? [];
      arr.push({ startTime: slot.startTime, endTime: slot.endTime, idx });
      byDay.set(slot.day, arr);
    });
    for (const [, slots] of byDay) {
      slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < slots.length; i++) {
        if (slots[i]!.startTime < slots[i - 1]!.endTime) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Time slots on the same day overlap",
            path: ["schedule", slots[i]!.idx, "startTime"],
          });
        }
      }
    }
  });

/**
 * Full-replacement payload for the chambers editor. Max 10 chambers (real
 * use cases stay under 5). At most one isPrimary; the action normalizes the
 * primary flag if zero are set (first chamber becomes primary by default).
 */
export const ChambersUpdateSchema = z
  .object({
    chambers: z
      .array(ChamberSchema)
      .min(0)
      .max(10, "You can list up to 10 chambers."),
  })
  .superRefine((data, ctx) => {
    const primaryCount = data.chambers.filter((c) => c.isPrimary).length;
    if (primaryCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only one chamber can be marked primary.",
        path: ["chambers"],
      });
    }
  });
export type ChambersUpdateInput = z.infer<typeof ChambersUpdateSchema>;

/**
 * Status-signaling block — designation, institute, years of experience.
 * One small form on the dashboard that surfaces on the public profile header.
 */
export const ProfileStatusSchema = z.object({
  designation: z.string().max(160).optional().or(z.literal("")),
  institute: z.string().max(160).optional().or(z.literal("")),
  yearsOfExperience: z.number().int().min(0).max(80).optional().nullable(),
});
export type ProfileStatusInput = z.infer<typeof ProfileStatusSchema>;

const currentYear = new Date().getFullYear();

export const AwardEntrySchema = z.object({
  title: z.string().min(1).max(160),
  issuer: z.string().max(160).optional().or(z.literal("")),
  year: z.number().int().min(1900).max(currentYear + 1).optional().nullable(),
});
export type AwardEntryInput = z.infer<typeof AwardEntrySchema>;

export const MembershipEntrySchema = z.object({
  body: z.string().min(1).max(160),
  role: z.string().max(120).optional().or(z.literal("")),
  since: z.number().int().min(1900).max(currentYear + 1).optional().nullable(),
});
export type MembershipEntryInput = z.infer<typeof MembershipEntrySchema>;

export const PublicationEntrySchema = z.object({
  title: z.string().min(1).max(240),
  journal: z.string().max(160).optional().or(z.literal("")),
  year: z.number().int().min(1900).max(currentYear + 1).optional().nullable(),
  url: z.string().url().optional().or(z.literal("")),
});
export type PublicationEntryInput = z.infer<typeof PublicationEntrySchema>;

/**
 * Credentials editor — awards / memberships / publications saved together.
 * Each capped at 20 entries to keep the FHIR payload bounded.
 */
export const ProfileCredentialsSchema = z.object({
  awards: z.array(AwardEntrySchema).max(20).default([]),
  memberships: z.array(MembershipEntrySchema).max(20).default([]),
  publications: z.array(PublicationEntrySchema).max(20).default([]),
});
export type ProfileCredentialsInput = z.infer<typeof ProfileCredentialsSchema>;

/**
 * Sub-specialty tags (sasthyaseba uses ~5–15 per doctor). Free-form strings —
 * we don't enforce a controlled vocabulary at this layer.
 */
export const ProfileConcentrationsSchema = z.object({
  concentrations: z.array(z.string().min(1).max(80)).max(30).default([]),
});
export type ProfileConcentrationsInput = z.infer<typeof ProfileConcentrationsSchema>;

/**
 * Socials section — extends the existing socialLinks subdoc with youtube.
 * URL validation is lenient (allows empty string) so dashboard can clear a field.
 */
export const ProfileSocialsSchema = z.object({
  facebook: z.string().url().optional().or(z.literal("")),
  linkedin: z.string().url().optional().or(z.literal("")),
  researchGate: z.string().url().optional().or(z.literal("")),
  googleScholar: z.string().url().optional().or(z.literal("")),
  youtube: z.string().url().optional().or(z.literal("")),
});
export type ProfileSocialsInput = z.infer<typeof ProfileSocialsSchema>;

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
