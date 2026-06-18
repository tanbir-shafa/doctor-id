import type { Metadata } from "next";
import type { DoctorDocLike } from "@/types/doctor";
import { publicEnv } from "@/lib/env";
import { buildAutoMetaDescription } from "@/lib/seo/profile-text";

/**
 * Generates Next Metadata for a doctor profile page.
 *
 * Falls back gracefully when the doctor's bio/photo is missing — every field
 * here is what crawlers and social-share previews actually display.
 */
export function buildProfileMetadata(doc: DoctorDocLike): Metadata {
  const primary = doc.specialties.find((s) => s.isPrimary) ?? doc.specialties[0];
  const primaryChamber = doc.chambers.find((c) => c.isPrimary) ?? doc.chambers[0];

  const fullName = doc.name.displayName;
  const specialtyLabel = primary?.name ?? "Doctor";
  const cityLabel = primaryChamber?.district ? ` in ${primaryChamber.district}` : "";

  const title = doc.seoTitle || `${fullName} — ${specialtyLabel}${cityLabel}`;
  const description =
    doc.seoDescription || (doc.bio ? doc.bio.slice(0, 160) : buildAutoMetaDescription(doc));

  const url = `${publicEnv.NEXT_PUBLIC_APP_URL}/${doc.slug}`;
  const ogImageUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/api/og/${doc.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "profile",
      siteName: "Daktar.Link",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: fullName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    robots: {
      index: doc.status === "published",
      follow: true,
    },
  };
}
