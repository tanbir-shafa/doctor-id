/**
 * Zod schema for account (identity) verification submissions.
 *
 * The doctor uploads a Government photo ID (NID / Passport / Driving License)
 * and their legal first+last name. On approval the legal name becomes the
 * profile name and is locked (see the name-change guard). Parsed server-side
 * in requestAccountVerificationAction — never trust the client resolver.
 */

import { z } from "zod";

export const AccountVerificationSchema = z.object({
  legalFirstName: z.string().trim().min(1, "Enter your legal first name.").max(80),
  legalLastName: z.string().trim().min(1, "Enter your legal last name.").max(80),
  idDocumentType: z.enum(["nid", "passport", "driving_license"]),
  documentFileIds: z
    .array(z.string().min(1))
    .min(1, "Upload your Government photo ID.")
    .max(3),
  notes: z.string().max(1000).optional(),
  // PDPO 2025: a government photo ID and legal name are sensitive personal data,
  // which require specific, explicit consent. Re-validated server-side because
  // the fiduciary bears the burden of proving consent was obtained.
  consent: z.boolean().refine((v) => v === true, {
    message: "Please consent to processing your ID for identity verification.",
  }),
});
export type AccountVerificationInput = z.infer<typeof AccountVerificationSchema>;
