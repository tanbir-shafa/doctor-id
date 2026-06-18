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
