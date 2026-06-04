import type { Loose } from "@/lib/db/models/loose";
import type { MetadataRoute } from "next";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, Specialty } from "@/lib/db/models";
import { listDistricts } from "@/lib/db/queries/doctors";
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
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  await dbConnect();

  const [doctors, specialties, districts] = await Promise.all([
    (Doctor as unknown as Loose)
      .find({ status: "published" })
      .select("slug updatedAt")
      .sort({ updatedAt: -1 })
      .limit(40_000)
      .lean(),
    (Specialty as unknown as Loose).find({ active: true }).select("slug name").lean(),
    listDistricts(),
  ]);

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${base}/search`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/auth/register`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  const doctorEntries: MetadataRoute.Sitemap = (doctors as unknown as { slug: string; updatedAt: Date }[]).map(
    (d) => ({
      url: `${base}/${d.slug}`,
      lastModified: d.updatedAt ?? now,
      changeFrequency: "weekly",
      priority: 0.9,
    }),
  );

  const specialtyEntries: MetadataRoute.Sitemap = (specialties as unknown as { slug: string }[]).map((s) => ({
    url: `${base}/${s.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Specialty × district combos — high-intent SEO landing pages.
  const districtComboEntries: MetadataRoute.Sitemap = [];
  for (const s of specialties as unknown as { slug: string }[]) {
    for (const d of districts) {
      districtComboEntries.push({
        url: `${base}/${s.slug}/${encodeURIComponent(d.toLowerCase())}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  return [...staticEntries, ...doctorEntries, ...specialtyEntries, ...districtComboEntries];
}
