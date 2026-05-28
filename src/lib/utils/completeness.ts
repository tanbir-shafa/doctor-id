/**
 * Profile completeness scorer.
 *
 * Single source of truth for the dashboard progress bar and the public-page
 * "verification level" tooltip. Each section contributes a fixed weight that
 * sums to 100; partial credit isn't given — a section is either present or not.
 *
 * Keep the weight table here and only here so the dashboard and the badge logic
 * never drift apart.
 */

import type { DoctorDocLike } from "@/types/doctor";

export interface CompletenessSection {
  key: string;
  label: string;
  weight: number;
  done: boolean;
}

export interface CompletenessResult {
  score: number; // 0–100
  sections: CompletenessSection[];
}

export function computeCompleteness(doc: DoctorDocLike): CompletenessResult {
  const sections: CompletenessSection[] = [
    {
      key: "basic",
      label: "Name & display title",
      weight: 10,
      done: Boolean(doc.name?.first && doc.name?.last && doc.name?.displayName),
    },
    {
      key: "photo",
      label: "Profile photo",
      weight: 10,
      done: Boolean(doc.photo?.url),
    },
    {
      key: "bio",
      label: "Bio (at least 80 chars)",
      weight: 10,
      done: typeof doc.bio === "string" && doc.bio.trim().length >= 80,
    },
    {
      key: "specialties",
      label: "At least one specialty",
      weight: 15,
      done: Array.isArray(doc.specialties) && doc.specialties.length > 0,
    },
    {
      key: "qualifications",
      label: "Qualifications",
      weight: 10,
      done: Array.isArray(doc.qualifications) && doc.qualifications.length > 0,
    },
    {
      key: "experience",
      label: "Experience",
      weight: 10,
      done: Array.isArray(doc.experience) && doc.experience.length > 0,
    },
    {
      key: "chambers",
      label: "At least one chamber",
      weight: 15,
      done: Array.isArray(doc.chambers) && doc.chambers.length > 0,
    },
    {
      key: "contact",
      label: "Public contact (phone / email / WhatsApp)",
      weight: 5,
      done: Boolean(doc.contact?.publicPhone || doc.contact?.publicEmail || doc.contact?.whatsapp),
    },
    {
      key: "bmdc",
      label: "BMDC number entered",
      weight: 10,
      done: Boolean(doc.bmdcNumber),
    },
    {
      key: "languages",
      label: "Languages spoken",
      weight: 5,
      done: Array.isArray(doc.languages) && doc.languages.length > 0,
    },
  ];

  const total = sections.reduce((acc, s) => acc + s.weight, 0);
  const earned = sections.filter((s) => s.done).reduce((acc, s) => acc + s.weight, 0);
  const score = total === 0 ? 0 : Math.round((earned / total) * 100);
  return { score, sections };
}
