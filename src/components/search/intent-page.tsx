import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DoctorCard } from "./doctor-card";
import { Pagination } from "./pagination";
import { HubFaqSection } from "./hub-faq-section";
import {
  searchDoctors,
  listDistrictsForSpecialty,
  countIntentDoctors,
  findSpecialtyBySlug,
  MIN_INDEXABLE_INTENT_DOCTORS,
} from "@/lib/db/queries/doctors";
import {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildItemListJsonLd,
  pruneJsonLd,
} from "@/lib/seo/jsonld";
import {
  buildIntentIntro,
  buildIntentFaq,
  BEST_METHODOLOGY_DISCLOSURE,
  HUB_WHY_DAKTAR_NOTE,
  type DoctorIntent,
} from "@/lib/seo/hub-text";
import { divisionForDistrict, canonicalizeDistrict } from "@/lib/geo/bd-districts";
import { publicEnv } from "@/lib/env";

/**
 * Shared engine for the four intent routes: /female/[slug], /female/[slug]/[district],
 * /best/[slug], /best/[slug]/[district]. The route files are thin wrappers that
 * call `buildIntentMetadata` (generateMetadata) and render `IntentPageView`.
 *
 * - `female` filters the query to female doctors.
 * - `best` ("Top") uses the dedicated, founding-EXCLUDED sort + a mandatory
 *   methodology disclosure (LEG task 10).
 * Indexability: a page renders 200 but goes `noindex,follow` below
 * MIN_INDEXABLE_INTENT_DOCTORS. The national page also renders a district pivot
 * (only to indexable district intent pages) — that's how district intent pages
 * are discovered. See seo-hub-intent-templates.md §§5–8.
 */

const LABEL: Record<DoctorIntent, string> = { female: "Female", best: "Top" };

export interface IntentPageProps {
  intent: DoctorIntent;
  specialtySlug: string;
  district?: string;
  searchParams: Record<string, string | string[] | undefined>;
}

function headingFor(intent: DoctorIntent, specialtyName: string, district: string | null): string {
  return `${LABEL[intent]} ${specialtyName} doctors ${district ? `in ${district}` : "in Bangladesh"}`;
}

async function resolve(intent: DoctorIntent, specialtySlug: string, districtParam?: string) {
  const specialty = await findSpecialtyBySlug(specialtySlug);
  if (!specialty) return null;
  const district = districtParam ? canonicalizeDistrict(decodeURIComponent(districtParam)) : null;
  // A district segment that doesn't resolve to a real BD district → not found.
  if (districtParam && !district) return null;
  return { specialty, district };
}

export async function buildIntentMetadata(args: {
  intent: DoctorIntent;
  specialtySlug: string;
  district?: string;
  page: number;
}): Promise<Metadata> {
  const resolved = await resolve(args.intent, args.specialtySlug, args.district);
  if (!resolved) return { title: "Not found" };
  const { specialty, district } = resolved;
  const specialtyLower = specialty.name.toLowerCase();
  const count = await countIntentDoctors({
    specialtyName: specialty.name,
    district,
    gender: args.intent === "female" ? "female" : undefined,
  });
  const heading = headingFor(args.intent, specialty.name, district);
  const place = district ? `in ${district}` : "across Bangladesh";
  const description =
    args.intent === "female"
      ? `Find verified female ${specialtyLower} doctors ${place} — chambers, schedules, fees and BMDC-aligned credentials on Daktar.Link.`
      : `Top ${specialtyLower} doctors ${place}, ranked by verification status and profile completeness. Chambers, schedules, fees and BMDC-aligned credentials on Daktar.Link.`;
  const baseRoot = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const base = `${baseRoot}/${args.intent}/${args.specialtySlug}${
    district ? `/${encodeURIComponent(district.toLowerCase())}` : ""
  }`;
  return {
    title: `${heading} | Daktar.Link`,
    description,
    alternates: { canonical: args.page > 1 ? `${base}?page=${args.page}` : base },
    robots: { index: count >= MIN_INDEXABLE_INTENT_DOCTORS, follow: true },
  };
}

export async function IntentPageView({ intent, specialtySlug, district: districtParam, searchParams }: IntentPageProps) {
  const resolved = await resolve(intent, specialtySlug, districtParam);
  if (!resolved) notFound();
  const { specialty, district } = resolved;

  const page = searchParams.page ? Number(searchParams.page) : 1;
  const gender = intent === "female" ? "female" : undefined;
  const sort = intent === "best" ? "best" : undefined;

  const { doctors, total, totalPages, pageSize } = await searchDoctors({
    specialty: specialty.name,
    district: district ?? undefined,
    gender,
    sort,
    page,
  });

  // District pivot only on the NATIONAL page — links to indexable district
  // intent pages (the discovery path for them). Empty on the district page.
  const districtPivot = district
    ? []
    : (
        await listDistrictsForSpecialty(specialty.name, 12, {
          gender,
          minCount: MIN_INDEXABLE_INTENT_DOCTORS,
        })
      ).map((d) => d.district);

  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const heading = headingFor(intent, specialty.name, district);
  const districtLower = district ? district.toLowerCase() : "";
  const intentBase = `/${intent}/${specialtySlug}`;
  const selfPath = `${intentBase}${district ? `/${encodeURIComponent(districtLower)}` : ""}`;
  const hubPath = `/${specialtySlug}${district ? `/${encodeURIComponent(districtLower)}` : ""}`;

  const intro = buildIntentIntro({
    intent,
    specialty: specialty.name,
    district,
    division: district ? divisionForDistrict(district) : null,
    count: total,
    variantKey: `${intent}/${specialtySlug}/${district ?? "bd"}`,
  });
  const faqItems = buildIntentFaq({ intent, specialty: specialty.name, district, count: total });
  const faqLd = pruneJsonLd(buildFaqJsonLd(faqItems));
  const itemListLd = pruneJsonLd(
    buildItemListJsonLd({
      items: doctors.map((d) => ({ slug: d.slug, name: d.name.displayName })),
      startPosition: (page - 1) * pageSize + 1,
      name: heading,
    }),
  );

  const crumbs = [
    { name: "Home", url: `${base}/` },
    { name: `${specialty.name} doctors`, url: `${base}/${specialtySlug}` },
  ];
  if (district) {
    crumbs.push({ name: district, url: `${base}/${specialtySlug}/${encodeURIComponent(districtLower)}` });
  }
  crumbs.push({ name: heading, url: `${base}${selfPath}` });
  const breadcrumbLd = pruneJsonLd(buildBreadcrumbJsonLd(crumbs));

  // Cross-links to always-indexable plain hubs (never to a noindex page).
  const crossLinks: { href: string; label: string }[] = [];
  if (district) {
    crossLinks.push({ href: hubPath, label: `All ${specialty.name} doctors in ${district}` });
    crossLinks.push({ href: intentBase, label: `${LABEL[intent]} ${specialty.name} doctors in Bangladesh` });
  } else {
    crossLinks.push({ href: `/${specialtySlug}`, label: `All ${specialty.name} doctors in Bangladesh` });
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      {doctors.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
        />
      ) : null}

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <Link href={hubPath} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            ← All {specialty.name} doctors{district ? ` in ${district}` : " in Bangladesh"}
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{heading}</h1>
          <div className="mt-3 max-w-3xl text-muted-foreground">{intro}</div>
          {intent === "best" ? (
            <p className="mt-4 max-w-3xl rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <strong className="font-medium text-foreground">How this list is ordered.</strong>{" "}
              {BEST_METHODOLOGY_DISCLOSURE}{" "}
              <Link href="/how-verification-works" className="font-medium text-primary hover:underline">
                How verification works →
              </Link>
            </p>
          ) : null}
        </header>

        {districtPivot.length > 0 ? (
          <nav className="mb-8 flex flex-wrap gap-2" aria-label={`${heading} by district`}>
            {districtPivot.map((d) => (
              <Link
                key={d}
                href={`${intentBase}/${encodeURIComponent(d.toLowerCase())}`}
                className="rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground hover:border-primary/40 hover:bg-accent"
              >
                {d}
              </Link>
            ))}
          </nav>
        ) : null}

        {doctors.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            No {heading.toLowerCase()} listed yet. Try a nearby district, or browse all {specialty.name} doctors.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {doctors.map((d) => (
              <li key={d.slug}>
                <DoctorCard doctor={d} />
              </li>
            ))}
          </ul>
        )}

        <Pagination page={page} totalPages={totalPages} searchParams={searchParams} />

        {crossLinks.length > 0 ? (
          <nav className="mt-10 border-t border-border pt-6" aria-label="Related listings">
            <div className="flex flex-wrap gap-2">
              {crossLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground hover:border-primary/40 hover:bg-accent"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </nav>
        ) : null}

        <HubFaqSection faq={faqItems} whyNote={HUB_WHY_DAKTAR_NOTE} />
      </section>
    </>
  );
}
