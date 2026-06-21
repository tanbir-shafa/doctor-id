/**
 * Schema.org JSON-LD builders for doctor profile pages.
 *
 * We emit two graphs on each profile:
 *   1. Physician — the doctor as a person + their credentials
 *   2. MedicalBusiness — each chamber as a sub-organization
 *
 * The shape follows Google's Local Business + Medical Organization guidelines
 * so rich results show up in search (specialty, address, opening hours, rating
 * placeholder for v2).
 */

import type { DoctorDocLike } from "@/types/doctor";
import { publicEnv } from "@/lib/env";
import { buildAutoProfileSummary } from "@/lib/seo/profile-text";

function siteBase(): string {
  return publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

const DAY_MAP: Record<string, string> = {
  sun: "https://schema.org/Sunday",
  mon: "https://schema.org/Monday",
  tue: "https://schema.org/Tuesday",
  wed: "https://schema.org/Wednesday",
  thu: "https://schema.org/Thursday",
  fri: "https://schema.org/Friday",
  sat: "https://schema.org/Saturday",
};

export function profileUrl(slug: string): string {
  return `${publicEnv.NEXT_PUBLIC_APP_URL}/${slug}`;
}

/**
 * Normalize a doctor-supplied / ingested link to an absolute http(s) URL for
 * Schema.org `sameAs`, or null if it can't be one. Bare domains
 * ("facebook.com/x") are coerced to https; handles / garbage ("@x") are dropped.
 */
function toAbsoluteUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // Reject schemeless inputs with no real host (e.g. "@handle").
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** ISO-8601 string for Schema.org date fields, or undefined if unparseable. */
function toIsoDate(value?: Date | string | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function buildPhysicianJsonLd(doc: DoctorDocLike): Record<string, unknown> {
  const url = profileUrl(doc.slug);

  const qualifications = doc.qualifications.map((q) => ({
    "@type": "EducationalOccupationalCredential",
    credentialCategory: "degree",
    name: q.degree,
    educationalLevel: q.degree,
    recognizedBy: { "@type": "EducationalOrganization", name: q.institution },
    dateCreated: String(q.year),
  }));

  // sameAs — the doctor's OTHER authoritative web presences (own site + socials),
  // so Google can reconcile the profile to a real-world entity. Ingestion
  // provenance (`sourceUrl`) is deliberately NOT emitted — we never name data
  // sources publicly.
  const sameAs = [
    ...new Set(
      [
        doc.contact?.website,
        doc.socialLinks?.facebook,
        doc.socialLinks?.linkedin,
        doc.socialLinks?.researchGate,
        doc.socialLinks?.googleScholar,
        doc.socialLinks?.youtube,
      ]
        .map(toAbsoluteUrl)
        .filter((u): u is string => Boolean(u)),
    ),
  ];

  // alumniOf — the schools behind the qualifications, as the direct Person→school
  // edge Google's entity graph reads (hasCredential.recognizedBy carries the same
  // institutions, but nested under each credential).
  const alumniOf = [
    ...new Set(
      doc.qualifications.map((q) => q.institution?.trim()).filter((s): s is string => Boolean(s)),
    ),
  ].map((name) => ({ "@type": "EducationalOrganization", name }));

  return {
    "@context": "https://schema.org",
    "@type": "Physician",
    "@id": url,
    name: doc.name.displayName,
    url,
    image: doc.photo?.url,
    description: doc.bio?.slice(0, 280) || buildAutoProfileSummary(doc),
    medicalSpecialty: doc.specialties.map((s) => s.name),
    knowsLanguage: doc.languages,
    gender: doc.gender === "male" ? "Male" : doc.gender === "female" ? "Female" : undefined,
    identifier: doc.bmdcNumber
      ? {
          "@type": "PropertyValue",
          propertyID: "BMDC",
          value: doc.bmdcNumber,
        }
      : undefined,
    hasCredential: qualifications.length ? qualifications : undefined,
    alumniOf: alumniOf.length ? alumniOf : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
    // Bangla `alternateName` is deferred until per-doctor Bangla name data lands
    // (SEO task 5 → 29 bilingual follow-up).
    dateModified: toIsoDate(doc.updatedAt),
    worksFor: doc.chambers.map((c) => ({
      "@type": "MedicalOrganization",
      name: c.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: c.address,
        addressLocality: c.area,
        addressRegion: c.division,
        addressCountry: "BD",
      },
      telephone: c.phone ?? undefined,
    })),
  };
}

export function buildChamberJsonLd(doc: DoctorDocLike): Record<string, unknown>[] {
  return doc.chambers.map((chamber) => {
    const openingHours = chamber.schedule
      .filter((s) => s.available)
      .map((s) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: DAY_MAP[s.day],
        opens: s.startTime,
        closes: s.endTime,
      }));

    return {
      "@context": "https://schema.org",
      "@type": "MedicalBusiness",
      name: chamber.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: chamber.address,
        addressLocality: chamber.area,
        addressRegion: chamber.division,
        addressCountry: "BD",
      },
      geo:
        chamber.coordinates?.lat && chamber.coordinates?.lng
          ? { "@type": "GeoCoordinates", latitude: chamber.coordinates.lat, longitude: chamber.coordinates.lng }
          : undefined,
      telephone: chamber.phone ?? undefined,
      openingHoursSpecification: openingHours.length ? openingHours : undefined,
      priceRange:
        chamber.consultationFee && chamber.consultationFee.amount > 0
          ? `BDT ${chamber.consultationFee.amount}`
          : undefined,
    };
  });
}

/**
 * The Daktar.Link brand entity. Emitted site-wide (from the root layout) so the
 * directory itself is a recognised Organization — the basis for a brand
 * Knowledge Panel and consistent brand SERPs.
 */
export function buildOrganizationJsonLd(): Record<string, unknown> {
  const base = siteBase();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: "Daktar.Link",
    url: `${base}/`,
    logo: `${base}/logo.svg`,
    description:
      "Daktar.Link is Bangladesh's verified, BMDC-aligned public directory of doctors — every profile shows real chambers, schedules, qualifications and verification status.",
    founder: { "@type": "Organization", name: "Shafa Care Ltd", url: "https://shafa.care" },
    areaServed: { "@type": "Country", name: "Bangladesh" },
  };
}

/**
 * WebSite schema with a SearchAction — this is what makes a sitelinks search box
 * eligible in Google for the brand query. Emitted site-wide (includes the
 * homepage, where Google reads it).
 */
export function buildWebSiteJsonLd(): Record<string, unknown> {
  const base = siteBase();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}/#website`,
    name: "Daktar.Link",
    url: `${base}/`,
    inLanguage: "en-BD",
    publisher: { "@id": `${base}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${base}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export interface BreadcrumbItem {
  name: string;
  /** Absolute URL of the crumb's target. */
  url: string;
}

/** A BreadcrumbList for the doctor / specialty / district page hierarchy. */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * FAQPage schema. The Q&A must also be visible on the page (the profile renders
 * the same items), per Google's structured-data policy.
 */
export function buildFaqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  };
}

export interface ItemListEntry {
  slug: string;
  name: string;
}

/**
 * `ItemList` JSON-LD for a hub/listing page — an ordered list of the doctor
 * profiles shown on the page, by URL. `startPosition` keeps positions continuous
 * across pagination (page 2 starts at `pageSize + 1`). It mirrors the visible
 * `DoctorCard` list, so the structured data matches what the user sees.
 */
export function buildItemListJsonLd(args: {
  items: ItemListEntry[];
  startPosition?: number;
  name?: string;
}): Record<string, unknown> {
  const { items, startPosition = 1, name } = args;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: startPosition + i,
      url: profileUrl(it.slug),
      name: it.name,
    })),
  };
}

/** Strip `undefined` keys so the rendered JSON is clean for crawlers. */
export function pruneJsonLd<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(pruneJsonLd) as unknown as T;
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) continue;
      out[k] = pruneJsonLd(v);
    }
    return out as unknown as T;
  }
  return obj;
}
