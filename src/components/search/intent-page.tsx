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
  BEST_METHODOLOGY_DISCLOSURE_BN,
  HUB_WHY_DAKTAR_NOTE,
  HUB_WHY_DAKTAR_NOTE_BN,
  type DoctorIntent,
} from "@/lib/seo/hub-text";
import { divisionForDistrict, canonicalizeDistrict } from "@/lib/geo/bd-districts";
import { specialtyBn as toSpecialtyBn, districtBn as toDistrictBn } from "@/lib/geo/bn-glossary";
import { type AppLocale, localizedPath, hreflangAlternates } from "@/lib/i18n/config";
import { publicEnv } from "@/lib/env";

/**
 * Shared engine for the eight intent routes: {/, /bn}/{female,best}/[slug][/[district]].
 * `female` filters the query to female doctors; `best` ("Top"/"শীর্ষ") uses the
 * dedicated founding-EXCLUDED sort + a mandatory methodology disclosure (LEG
 * task 10). `locale: "bn"` swaps in Bangla heading/intro/FAQ/disclosure +
 * `/bn`-prefixed links; reciprocal `hreflang` on both. Indexability:
 * `noindex,follow` below MIN_INDEXABLE_INTENT_DOCTORS. Minor chrome (back-link,
 * cross-link labels, empty state) stays English in v1.
 */

const LABEL: Record<DoctorIntent, string> = { female: "Female", best: "Top" };
const isBn = (l: AppLocale) => l === "bn";
const spBn = (name: string) => toSpecialtyBn(name) || name;
const dBn = (name: string) => toDistrictBn(name) || name;

export interface IntentPageProps {
  intent: DoctorIntent;
  specialtySlug: string;
  district?: string;
  searchParams: Record<string, string | string[] | undefined>;
  locale?: AppLocale;
}

function headingFor(
  locale: AppLocale,
  intent: DoctorIntent,
  specialtyName: string,
  district: string | null,
): string {
  if (isBn(locale)) {
    const place = district ? `${dBn(district)}-এ` : "বাংলাদেশে";
    const kind = intent === "female" ? "মহিলা" : "শীর্ষ";
    return `${place} ${kind} ${spBn(specialtyName)} ডাক্তার`;
  }
  return `${LABEL[intent]} ${specialtyName} doctors ${district ? `in ${district}` : "in Bangladesh"}`;
}

async function resolve(intent: DoctorIntent, specialtySlug: string, districtParam?: string) {
  const specialty = await findSpecialtyBySlug(specialtySlug);
  if (!specialty) return null;
  const district = districtParam ? canonicalizeDistrict(decodeURIComponent(districtParam)) : null;
  if (districtParam && !district) return null;
  return { specialty, district };
}

export async function buildIntentMetadata(args: {
  intent: DoctorIntent;
  specialtySlug: string;
  district?: string;
  page: number;
  locale?: AppLocale;
}): Promise<Metadata> {
  const locale = args.locale ?? "en";
  const resolved = await resolve(args.intent, args.specialtySlug, args.district);
  if (!resolved) return { title: "Not found" };
  const { specialty, district } = resolved;
  const count = await countIntentDoctors({
    specialtyName: specialty.name,
    district,
    gender: args.intent === "female" ? "female" : undefined,
  });
  const heading = headingFor(locale, args.intent, specialty.name, district);
  const enPath = `/${args.intent}/${args.specialtySlug}${district ? `/${encodeURIComponent(district.toLowerCase())}` : ""}`;
  const base = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}${localizedPath(locale, enPath)}`;
  const place = district ? (isBn(locale) ? `${dBn(district)}-এ` : `in ${district}`) : isBn(locale) ? "বাংলাদেশে" : "across Bangladesh";
  const specialtyLower = specialty.name.toLowerCase();
  const description = isBn(locale)
    ? args.intent === "female"
      ? `${place} যাচাই করা মহিলা ${spBn(specialty.name)} ডাক্তার — চেম্বার, সময়সূচি ও ফি Daktar.Link-এ।`
      : `${place} শীর্ষ ${spBn(specialty.name)} ডাক্তার, যাচাই ও প্রোফাইল সম্পূর্ণতার ভিত্তিতে সাজানো। চেম্বার, সময়সূচি ও ফি Daktar.Link-এ।`
    : args.intent === "female"
      ? `Find verified female ${specialtyLower} doctors ${place} — chambers, schedules, fees and BMDC-aligned credentials on Daktar.Link.`
      : `Top ${specialtyLower} doctors ${place}, ranked by verification status and profile completeness. Chambers, schedules, fees and BMDC-aligned credentials on Daktar.Link.`;
  return {
    title: `${heading} | Daktar.Link`,
    description,
    alternates: {
      canonical: args.page > 1 ? `${base}?page=${args.page}` : base,
      languages: hreflangAlternates(enPath),
    },
    robots: { index: count >= MIN_INDEXABLE_INTENT_DOCTORS, follow: true },
  };
}

export async function IntentPageView({
  intent,
  specialtySlug,
  district: districtParam,
  searchParams,
  locale = "en",
}: IntentPageProps) {
  const resolved = await resolve(intent, specialtySlug, districtParam);
  if (!resolved) notFound();
  const { specialty, district } = resolved;

  const page = searchParams.page ? Number(searchParams.page) : 1;
  const gender = intent === "female" ? "female" : undefined;
  const sort = intent === "best" ? "best" : undefined;
  const lp = (p: string) => localizedPath(locale, p);

  const { doctors, total, totalPages, pageSize } = await searchDoctors({
    specialty: specialty.name,
    district: district ?? undefined,
    gender,
    sort,
    page,
  });

  // District pivot only on the NATIONAL page — links to indexable district
  // intent pages (the discovery path for them).
  const districtPivot = district
    ? []
    : (
        await listDistrictsForSpecialty(specialty.name, 12, {
          gender,
          minCount: MIN_INDEXABLE_INTENT_DOCTORS,
        })
      ).map((d) => d.district);

  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const heading = headingFor(locale, intent, specialty.name, district);
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
    locale,
  });
  const faqItems = buildIntentFaq({ intent, specialty: specialty.name, district, count: total, locale });
  const faqLd = pruneJsonLd(buildFaqJsonLd(faqItems));
  const itemListLd = pruneJsonLd(
    buildItemListJsonLd({
      items: doctors.map((d) => ({ slug: d.slug, name: d.name.displayName })),
      startPosition: (page - 1) * pageSize + 1,
      name: heading,
    }),
  );

  const crumbs = [
    { name: isBn(locale) ? "হোম" : "Home", url: `${base}/` },
    {
      name: isBn(locale) ? `${spBn(specialty.name)} ডাক্তার` : `${specialty.name} doctors`,
      url: `${base}${lp(`/${specialtySlug}`)}`,
    },
  ];
  if (district) {
    crumbs.push({
      name: isBn(locale) ? dBn(district) : district,
      url: `${base}${lp(`/${specialtySlug}/${encodeURIComponent(districtLower)}`)}`,
    });
  }
  crumbs.push({ name: heading, url: `${base}${lp(selfPath)}` });
  const breadcrumbLd = pruneJsonLd(buildBreadcrumbJsonLd(crumbs));

  // Cross-links to always-indexable plain hubs (never a noindex page).
  const crossLinks: { href: string; label: string }[] = [];
  if (district) {
    crossLinks.push({ href: lp(hubPath), label: `All ${specialty.name} doctors in ${district}` });
    crossLinks.push({ href: lp(intentBase), label: `${LABEL[intent]} ${specialty.name} doctors in Bangladesh` });
  } else {
    crossLinks.push({ href: lp(`/${specialtySlug}`), label: `All ${specialty.name} doctors in Bangladesh` });
  }

  const disclosureText = isBn(locale) ? BEST_METHODOLOGY_DISCLOSURE_BN : BEST_METHODOLOGY_DISCLOSURE;
  const disclosureLabel = isBn(locale) ? "এই তালিকা যেভাবে সাজানো হয়।" : "How this list is ordered.";
  const verificationLinkLabel = isBn(locale) ? "যাচাই যেভাবে কাজ করে →" : "How verification works →";
  const whyNote = isBn(locale) ? HUB_WHY_DAKTAR_NOTE_BN : HUB_WHY_DAKTAR_NOTE;

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
          <Link href={lp(hubPath)} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            ← All {specialty.name} doctors{district ? ` in ${district}` : " in Bangladesh"}
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{heading}</h1>
          <div className="mt-3 max-w-3xl text-muted-foreground">{intro}</div>
          {intent === "best" ? (
            <p className="mt-4 max-w-3xl rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <strong className="font-medium text-foreground">{disclosureLabel}</strong>{" "}
              {disclosureText}{" "}
              <Link href="/how-verification-works" className="font-medium text-primary hover:underline">
                {verificationLinkLabel}
              </Link>
            </p>
          ) : null}
        </header>

        {districtPivot.length > 0 ? (
          <nav className="mb-8 flex flex-wrap gap-2" aria-label={`${heading} by district`}>
            {districtPivot.map((d) => (
              <Link
                key={d}
                href={lp(`${intentBase}/${encodeURIComponent(d.toLowerCase())}`)}
                className="rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground hover:border-primary/40 hover:bg-accent"
              >
                {isBn(locale) ? dBn(d) : d}
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

        <HubFaqSection faq={faqItems} whyNote={whyNote} />
      </section>
    </>
  );
}
