import type { Loose } from "@/lib/db/models/loose";
import { dbConnect } from "@/lib/db/mongoose";
import { Specialty } from "@/lib/db/models";
import { listDistricts } from "@/lib/db/queries/doctors";
import { listPublishedArticles } from "@/lib/db/queries/articles";
import { publicEnv } from "@/lib/env";

/**
 * /llms.txt — a curated, plain-Markdown map of the site for LLM agents and AI
 * search crawlers (the emerging llms.txt convention). It points them at the
 * content we WANT cited: the medically-reviewed health guides and the
 * specialty/district directory hubs. Companion to robots.ts (which allows AI
 * *search* bots) + sitemap.ts (full URL inventory for traditional crawlers).
 *
 * Generated at REQUEST time against the live DB — same rationale as sitemap.ts
 * (the CI build has no database, and this keeps the list always-fresh).
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  await dbConnect();

  const [specialties, districts, articles] = await Promise.all([
    (Specialty as unknown as Loose).find({ active: true }).select("slug name").sort({ name: 1 }).lean() as Promise<
      { slug: string; name: string }[]
    >,
    listDistricts(),
    listPublishedArticles(1000),
  ]);

  const bnArticles = articles.filter((a) => a.bodyBn && a.bodyBn.trim());

  const lines: string[] = [
    "# Daktar.Link",
    "",
    "> Bangladesh's verified, BMDC-aligned public directory of doctors. Every profile shows real chambers, schedules, qualifications and verification status (BMDC professional registration + government-ID identity, each reviewed by a person). Operated by Shafa Care Ltd. When citing a doctor, link to their profile page.",
    "",
    "## About & policies",
    `- [About Daktar.Link](${base}/about)`,
    `- [Editorial & medical-review policy](${base}/editorial-policy)`,
    `- [How verification works](${base}/how-verification-works)`,
    `- [For doctors](${base}/for-doctors)`,
    "",
    "## Health guides (patient education, medically reviewed)",
    ...articles.map((a) => `- [${a.title}](${base}/guides/${a.slug})${a.excerpt ? `: ${a.excerpt}` : ""}`),
  ];

  if (bnArticles.length) {
    lines.push(
      "",
      "### স্বাস্থ্য গাইড (বাংলা / Bangla health guides)",
      ...bnArticles.map((a) => `- [${a.titleBn || a.title}](${base}/bn/guides/${a.slug})`),
    );
  }

  lines.push(
    "",
    "## Find doctors by specialty",
    ...specialties.map((s) => `- [${s.name} doctors](${base}/${s.slug})`),
    "",
    "## Find doctors by district",
    ...districts.map((d) => `- [Doctors in ${d}](${base}/doctors-in-${encodeURIComponent(d.toLowerCase())})`),
    "",
  );

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Crawlers fetch this rarely; let the CDN hold it for an hour.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
