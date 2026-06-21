import type { Loose } from "@/lib/db/models/loose";
import type { MetadataRoute } from "next";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, Specialty } from "@/lib/db/models";
import {
  listSpecialtyDistrictCombos,
  listDistricts,
  listIntentHubsForSitemap,
} from "@/lib/db/queries/doctors";
import { publicEnv } from "@/lib/env";

/**
 * Dynamic sitemap. Lists:
 *   - Homepage, /search, /auth/register
 *   - One entry per published doctor profile
 *   - One entry per specialty landing page (/cardiology, etc.)
 *   - One entry per specialty × district combo (/cardiology/dhaka)
 *
 * Capped at 50 000 URLs per sitemap (Google limit). Way under that for MVP.
 */

// Generated at REQUEST time, not build time: this queries Mongo for every
// published doctor, so it must run against the live DB on the box — and the CI
// build has no database. `force-dynamic` removes the build's only DB dependency
// AND keeps the sitemap always-fresh (build-time generation would freeze it at
// each deploy). Crawlers fetch it rarely and the query is indexed + capped, so
// per-request generation is cheap.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  await dbConnect();

  const [doctors, specialties, combos, districts] = await Promise.all([
    (Doctor as unknown as Loose)
      .find({ status: "published" })
      .select("slug updatedAt")
      .sort({ updatedAt: -1 })
      .limit(40_000)
      .lean(),
    (Specialty as unknown as Loose).find({ active: true }).select("slug name").lean(),
    // Only combos with real doctor supply — empty cartesian pages are excluded
    // (they'd be soft-404s and waste crawl budget). See queries/doctors.ts.
    listSpecialtyDistrictCombos(),
    // Districts with published supply → the /doctors-in-[district] hubs.
    listDistricts(),
  ]);

  // National intent hubs (/female/[specialty], /best/[specialty]) that clear the
  // intent index threshold. District-level intent pages are discovered via the
  // district pivot on these national pages (not enumerated here).
  const intentHubs = await listIntentHubsForSitemap();

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${base}/search`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/auth/register`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    // Trust / E-E-A-T pages — important for a YMYL (medical) site.
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/how-verification-works`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/data-sources`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const doctorEntries: MetadataRoute.Sitemap = (doctors as unknown as { slug: string; updatedAt: Date }[]).map(
    (d) => ({
      url: `${base}/${d.slug}`,
      lastModified: d.updatedAt ?? now,
      changeFrequency: "weekly",
      priority: 0.9,
    }),
  );

  // Reciprocal en/bn alternates for a money-page path (task 43). Each money URL
  // advertises its Bangla twin at /bn so Google indexes both (pairs with the
  // per-page hreflang in metadata).
  const bnAlt = (path: string) => ({
    languages: { "en-BD": `${base}${path}`, "bn-BD": `${base}/bn${path}` },
  });

  const specialtyEntries: MetadataRoute.Sitemap = (specialties as unknown as { slug: string }[]).map((s) => ({
    url: `${base}/${s.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
    alternates: bnAlt(`/${s.slug}`),
  }));

  // Specialty × district combos — high-intent SEO landing pages. Only combos
  // that actually have doctors are listed (see listSpecialtyDistrictCombos).
  const districtComboEntries: MetadataRoute.Sitemap = combos.map((c) => ({
    url: `${base}/${c.specialtySlug}/${encodeURIComponent(c.district)}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
    alternates: bnAlt(`/${c.specialtySlug}/${encodeURIComponent(c.district)}`),
  }));

  // District-only hubs (/doctors-in-[district]) — "doctor in [city]" head terms.
  const districtHubEntries: MetadataRoute.Sitemap = districts.map((d) => ({
    url: `${base}/doctors-in-${encodeURIComponent(d.toLowerCase())}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
    alternates: bnAlt(`/doctors-in-${encodeURIComponent(d.toLowerCase())}`),
  }));

  // Intent hubs (/female/[specialty], /best/[specialty]) above the intent threshold.
  const intentHubEntries: MetadataRoute.Sitemap = intentHubs.map((h) => ({
    url: `${base}/${h.intent}/${h.specialtySlug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.5,
    alternates: bnAlt(`/${h.intent}/${h.specialtySlug}`),
  }));

  return [
    ...staticEntries,
    ...doctorEntries,
    ...specialtyEntries,
    ...districtComboEntries,
    ...districtHubEntries,
    ...intentHubEntries,
  ];
}
