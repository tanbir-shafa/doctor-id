import { z } from "zod";

/** The article lifecycle. Admin: draft→published. Doctor (future): →pending_review→published. */
export const ARTICLE_STATUSES = ["draft", "pending_review", "published"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/** Validated shape for create/update (the action builds this object from the form). */
export const articleInputSchema = z.object({
  title: z.string().trim().min(3, "Title is required").max(200),
  // Optional on input — the action derives it from the title when blank.
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may use only lowercase letters, numbers and hyphens")
    .max(200)
    .optional()
    .or(z.literal("")),
  excerpt: z.string().trim().max(320).optional().default(""),
  body: z.string().trim().min(20, "Body is too short").max(50000),
  coverImageUrl: z.string().trim().url("Cover image must be a valid URL").max(500).optional().or(z.literal("")),
  // Optional Bangla version. A guide goes bilingual only when bodyBn is filled.
  titleBn: z.string().trim().max(200).optional().or(z.literal("")),
  excerptBn: z.string().trim().max(320).optional().default(""),
  bodyBn: z.string().trim().max(50000).optional().or(z.literal("")),
  specialties: z.array(z.string().trim().min(1)).max(12).optional().default([]),
  // Short TL;DR takeaways (the action splits a textarea by line before parsing).
  keyFacts: z.array(z.string().trim().min(1).max(240)).max(8).optional().default([]),
  keyFactsBn: z.array(z.string().trim().min(1).max(240)).max(8).optional().default([]),
  // Authoritative references. The action parses "Label | URL | Publisher?" lines.
  citations: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(240),
        url: z.string().trim().url("Each reference needs a valid URL").max(500),
        publisher: z.string().trim().max(120).optional().or(z.literal("")),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  authorName: z.string().trim().max(120).optional().or(z.literal("")),
  // Medical reviewer details (E-E-A-T). reviewerName may differ from the
  // publishing admin (the actual reviewing clinician).
  reviewerName: z.string().trim().max(120).optional().or(z.literal("")),
  reviewerCredential: z.string().trim().max(240).optional().or(z.literal("")),
  reviewerProfileUrl: z
    .string()
    .trim()
    .url("Reviewer profile must be a valid URL")
    .max(500)
    .optional()
    .or(z.literal("")),
  status: z.enum(ARTICLE_STATUSES).optional().default("draft"),
});

export type ArticleInput = z.infer<typeof articleInputSchema>;
