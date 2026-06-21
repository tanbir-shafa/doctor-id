import type { Metadata } from "next";
import {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildItemListJsonLd,
  pruneJsonLd,
} from "@/lib/seo/jsonld";
import {
  buildHubIntro,
  buildHubFaq,
  buildDistrictHubIntro,
  buildDistrictHubFaq,
  HUB_WHY_DAKTAR_NOTE,
  HUB_WHY_DAKTAR_NOTE_BN,
} from "@/lib/seo/hub-text";
import { SpecialtyListing } from "./specialty-listing";
import { DistrictListing } from "./district-listing";
import {
  searchDoctors,
  listDistricts,
  listSpecialtiesForDistrict,
  countDoctorsInDistrict,
  MIN_INDEXABLE_COMBO_DOCTORS,
} from "@/lib/db/queries/doctors";
import { canonicalizeDistrict, divisionForDistrict, BD_DISTRICTS } from "@/lib/geo/bd-districts";
import { specialtyBn as toSpecialtyBn, districtBn as toDistrictBn } from "@/lib/geo/bn-glossary";
import { type AppLocale, localizedPath, hreflangAlternates } from "@/lib/i18n/config";
import { publicEnv } from "@/lib/env";

/**
 * Locale-aware shared engine for the hub money pages — the specialty hub (A),
 * specialty×district hub (B), and district-only hub (C). Both the English routes
 * and the `/bn` routes call these, so there's one implementation per page type.
 * English output is identical to before; `locale: "bn"` swaps in the Bangla
 * H1 / intro / FAQ (hub-text.ts) and `/bn`-prefixed internal links, and every
 * page emits reciprocal `hreflang`. Minor chrome labels (district-pivot chips,
 * "Nearby districts", FAQ heading) stay English in v1 — see bilingual-ux-seo.md.
 */

type Specialty = { name: string; slug: string };
type SP = Record<string, string | string[] | undefined>;

const isBn = (l: AppLocale) => l === "bn";
const spBn = (name: string) => toSpecialtyBn(name) || name;
const dBn = (name: string) => toDistrictBn(name) || name;
const whyNote = (l: AppLocale) => (isBn(l) ? HUB_WHY_DAKTAR_NOTE_BN : HUB_WHY_DAKTAR_NOTE);
const homeLabel = (l: AppLocale) => (isBn(l) ? "হোম" : "Home");
const siteBase = () => publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const pageOf = (sp: SP) => (sp.page ? Number(sp.page) : 1);

/** The en↔bn toggle link for a money page, given its English (default) path. */
function localeToggle(locale: AppLocale, enPath: string): { href: string; label: string } {
  return isBn(locale)
    ? { href: enPath, label: "English" }
    : { href: localizedPath("bn", enPath), label: "বাংলা" };
}

/**
 * District-hub dispatch: `/doctors-in-[district]` (and `/bn/doctors-in-[district]`)
 * is handled in the `/[slug]` chain, not a folder (Next has no `prefix-[param]`).
 * Returns the canonical district name, or null (→ doctor-profile branch).
 */
export function parseDistrictHubSlug(slug: string): string | null {
  const m = /^doctors-in-(.+)$/.exec(slug.toLowerCase());
  if (!m) return null;
  return canonicalizeDistrict(decodeURIComponent(m[1]!));
}

/** Sibling districts in the same division that have published supply (M3). */
export function siblingDistrictsWithSupply(district: string, supplyDistricts: string[]): string[] {
  const division = divisionForDistrict(district);
  if (!division) return [];
  const supply = new Set(supplyDistricts.map((d) => d.toLowerCase()));
  return BD_DISTRICTS.filter(
    (d) =>
      d.division === division &&
      d.name.toLowerCase() !== district.toLowerCase() &&
      supply.has(d.name.toLowerCase()),
  )
    .map((d) => d.name)
    .slice(0, 6);
}

function jsonLdScript(obj: unknown, key?: string | number) {
  return (
    <script
      key={key}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }}
    />
  );
}

// ── A — specialty hub (/[specialty], /bn/[specialty]) ─────────────────────────

export async function buildSpecialtyHubMetadata(args: {
  locale: AppLocale;
  specialty: Specialty;
  page: number;
}): Promise<Metadata> {
  const { locale, specialty, page } = args;
  const enPath = `/${specialty.slug}`;
  const base = `${siteBase()}${localizedPath(locale, enPath)}`;
  const heading = isBn(locale)
    ? `বাংলাদেশে ${spBn(specialty.name)} ডাক্তার`
    : `${specialty.name} doctors in Bangladesh`;
  const description = isBn(locale)
    ? `বাংলাদেশে যাচাই করা ${spBn(specialty.name)} ডাক্তার খুঁজুন — চেম্বার, সময়সূচি, যোগ্যতা সব Daktar.Link-এ।`
    : `Browse verified ${specialty.name.toLowerCase()} doctors across Bangladesh. Chambers, schedules, qualifications.`;
  return {
    title: heading,
    description,
    alternates: {
      canonical: page > 1 ? `${base}?page=${page}` : base,
      languages: hreflangAlternates(enPath),
    },
  };
}

export async function SpecialtyHubView({
  locale,
  specialty,
  searchParams,
}: {
  locale: AppLocale;
  specialty: Specialty;
  searchParams: SP;
}) {
  const page = pageOf(searchParams);
  const prefix = isBn(locale) ? "/bn" : "";
  const [{ doctors, total, totalPages, pageSize }, districts] = await Promise.all([
    searchDoctors({ specialty: specialty.name, page }),
    listDistricts(),
  ]);
  const base = siteBase();
  const heading = isBn(locale) ? `বাংলাদেশে ${spBn(specialty.name)} ডাক্তার` : undefined;
  const breadcrumbLd = pruneJsonLd(
    buildBreadcrumbJsonLd([
      { name: homeLabel(locale), url: `${base}/` },
      {
        name: isBn(locale) ? `${spBn(specialty.name)} ডাক্তার` : `${specialty.name} doctors`,
        url: `${base}${localizedPath(locale, `/${specialty.slug}`)}`,
      },
    ]),
  );
  const intro = buildHubIntro({ specialty: specialty.name, count: total, variantKey: specialty.slug, locale });
  const faqItems = buildHubFaq({ specialty: specialty.name, count: total, locale });
  const faqLd = pruneJsonLd(buildFaqJsonLd(faqItems));
  const itemListLd = pruneJsonLd(
    buildItemListJsonLd({
      items: doctors.map((d) => ({ slug: d.slug, name: d.name.displayName })),
      startPosition: (page - 1) * pageSize + 1,
      name: heading ?? `${specialty.name} doctors in Bangladesh`,
    }),
  );
  return (
    <>
      {jsonLdScript(breadcrumbLd)}
      {jsonLdScript(faqLd)}
      {doctors.length > 0 ? jsonLdScript(itemListLd) : null}
      <SpecialtyListing
        specialtyName={specialty.name}
        specialtySlug={specialty.slug}
        doctors={doctors}
        total={total}
        page={page}
        totalPages={totalPages}
        districts={districts}
        searchParams={searchParams}
        intro={intro}
        faq={faqItems}
        whyNote={whyNote(locale)}
        pathPrefix={prefix}
        heading={heading}
        localeAlternate={localeToggle(locale, `/${specialty.slug}`)}
      />
    </>
  );
}

// ── B — specialty × district (/[specialty]/[district], /bn/...) ───────────────

export async function buildSpecialtyDistrictMetadata(args: {
  locale: AppLocale;
  specialty: Specialty;
  districtParam: string;
  page: number;
}): Promise<Metadata> {
  const { locale, specialty, districtParam, page } = args;
  const decoded = decodeURIComponent(districtParam);
  const label = titleCase(decoded);
  const canonical = canonicalizeDistrict(decoded) ?? label;
  const count = (await searchDoctors({ specialty: specialty.name, district: decoded, page: 1 })).total;
  const enPath = `/${specialty.slug}/${districtParam}`;
  const base = `${siteBase()}${localizedPath(locale, enPath)}`;
  const heading = isBn(locale)
    ? `${dBn(canonical)}-এ ${spBn(specialty.name)} ডাক্তার`
    : `${specialty.name} doctors in ${label}`;
  const description = isBn(locale)
    ? `${dBn(canonical)}-এ যাচাই করা ${spBn(specialty.name)} ডাক্তার — চেম্বার, সময়সূচি ও যোগাযোগ Daktar.Link-এ।`
    : `Verified ${specialty.name.toLowerCase()} doctors in ${label}. Chambers, schedules, contact details — all on Daktar.Link.`;
  return {
    title: heading,
    description,
    alternates: {
      canonical: page > 1 ? `${base}?page=${page}` : base,
      languages: hreflangAlternates(enPath),
    },
    robots: { index: count >= MIN_INDEXABLE_COMBO_DOCTORS, follow: true },
  };
}

export async function SpecialtyDistrictView({
  locale,
  specialty,
  districtParam,
  searchParams,
}: {
  locale: AppLocale;
  specialty: Specialty;
  districtParam: string;
  searchParams: SP;
}) {
  const page = pageOf(searchParams);
  const prefix = isBn(locale) ? "/bn" : "";
  const decoded = decodeURIComponent(districtParam);
  const label = titleCase(decoded);
  const canonical = canonicalizeDistrict(decoded) ?? label;
  const [{ doctors, total, totalPages, pageSize }, districts] = await Promise.all([
    searchDoctors({ specialty: specialty.name, district: decoded, page }),
    listDistricts(),
  ]);
  const base = siteBase();
  const heading = isBn(locale) ? `${dBn(canonical)}-এ ${spBn(specialty.name)} ডাক্তার` : undefined;
  const breadcrumbLd = pruneJsonLd(
    buildBreadcrumbJsonLd([
      { name: homeLabel(locale), url: `${base}/` },
      {
        name: isBn(locale) ? `${spBn(specialty.name)} ডাক্তার` : `${specialty.name} doctors`,
        url: `${base}${localizedPath(locale, `/${specialty.slug}`)}`,
      },
      {
        name: isBn(locale) ? dBn(canonical) : label,
        url: `${base}${localizedPath(locale, `/${specialty.slug}/${districtParam}`)}`,
      },
    ]),
  );
  const intro = buildHubIntro({
    specialty: specialty.name,
    district: label,
    division: divisionForDistrict(decoded),
    count: total,
    variantKey: `${specialty.slug}/${districtParam}`,
    locale,
  });
  const faqItems = buildHubFaq({ specialty: specialty.name, district: label, count: total, locale });
  const faqLd = pruneJsonLd(buildFaqJsonLd(faqItems));
  const itemListLd = pruneJsonLd(
    buildItemListJsonLd({
      items: doctors.map((d) => ({ slug: d.slug, name: d.name.displayName })),
      startPosition: (page - 1) * pageSize + 1,
      name: heading ?? `${specialty.name} doctors in ${label}`,
    }),
  );
  return (
    <>
      {jsonLdScript(breadcrumbLd)}
      {jsonLdScript(faqLd)}
      {doctors.length > 0 ? jsonLdScript(itemListLd) : null}
      <SpecialtyListing
        specialtyName={specialty.name}
        specialtySlug={specialty.slug}
        district={label}
        doctors={doctors}
        total={total}
        page={page}
        totalPages={totalPages}
        districts={districts}
        searchParams={searchParams}
        intro={intro}
        faq={faqItems}
        whyNote={whyNote(locale)}
        pathPrefix={prefix}
        heading={heading}
        localeAlternate={localeToggle(locale, `/${specialty.slug}/${districtParam}`)}
      />
    </>
  );
}

// ── C — district-only hub (/doctors-in-[district], /bn/...) ───────────────────

export async function buildDistrictHubMetadata(args: {
  locale: AppLocale;
  district: string;
  page: number;
}): Promise<Metadata> {
  const { locale, district, page } = args;
  const count = await countDoctorsInDistrict(district);
  const enPath = `/doctors-in-${encodeURIComponent(district.toLowerCase())}`;
  const base = `${siteBase()}${localizedPath(locale, enPath)}`;
  const heading = isBn(locale) ? `${dBn(district)}-এ ডাক্তার` : `Doctors in ${district} — verified profiles`;
  const description = isBn(locale)
    ? `${dBn(district)}-এ বিভিন্ন বিশেষত্বের যাচাই করা ডাক্তার — চেম্বার, সময়সূচি ও ফি Daktar.Link-এ।`
    : `Find doctors in ${district}, Bangladesh across specialties — chambers, schedules, fees and BMDC-aligned credentials on Daktar.Link.`;
  return {
    title: heading,
    description,
    alternates: {
      canonical: page > 1 ? `${base}?page=${page}` : base,
      languages: hreflangAlternates(enPath),
    },
    robots: { index: count >= MIN_INDEXABLE_COMBO_DOCTORS, follow: true },
  };
}

export async function DistrictHubView({
  locale,
  district,
  searchParams,
}: {
  locale: AppLocale;
  district: string;
  searchParams: SP;
}) {
  const page = pageOf(searchParams);
  const prefix = isBn(locale) ? "/bn" : "";
  const [{ doctors, total, totalPages, pageSize }, specialtiesInDistrict, supplyDistricts] =
    await Promise.all([
      searchDoctors({ district, page }),
      listSpecialtiesForDistrict(district),
      listDistricts(),
    ]);
  const siblings = siblingDistrictsWithSupply(district, supplyDistricts);
  const topSpecialtyNames = specialtiesInDistrict.map((s) => s.specialtyName);
  const base = siteBase();
  const heading = isBn(locale) ? `${dBn(district)}-এ ডাক্তার` : undefined;
  const breadcrumbLd = pruneJsonLd(
    buildBreadcrumbJsonLd([
      { name: homeLabel(locale), url: `${base}/` },
      {
        name: isBn(locale) ? `${dBn(district)}-এ ডাক্তার` : `Doctors in ${district}`,
        url: `${base}${localizedPath(locale, `/doctors-in-${encodeURIComponent(district.toLowerCase())}`)}`,
      },
    ]),
  );
  const intro = buildDistrictHubIntro({
    district,
    division: divisionForDistrict(district),
    count: total,
    topSpecialties: topSpecialtyNames,
    nearbyDistricts: siblings,
    locale,
  });
  const faqItems = buildDistrictHubFaq({ district, count: total, topSpecialties: topSpecialtyNames, locale });
  const faqLd = pruneJsonLd(buildFaqJsonLd(faqItems));
  const itemListLd = pruneJsonLd(
    buildItemListJsonLd({
      items: doctors.map((d) => ({ slug: d.slug, name: d.name.displayName })),
      startPosition: (page - 1) * pageSize + 1,
      name: heading ?? `Doctors in ${district}`,
    }),
  );
  return (
    <>
      {jsonLdScript(breadcrumbLd)}
      {jsonLdScript(faqLd)}
      {doctors.length > 0 ? jsonLdScript(itemListLd) : null}
      <DistrictListing
        district={district}
        doctors={doctors}
        page={page}
        totalPages={totalPages}
        specialties={specialtiesInDistrict}
        nearby={siblings}
        searchParams={searchParams}
        intro={intro}
        faq={faqItems}
        whyNote={whyNote(locale)}
        pathPrefix={prefix}
        heading={heading}
        localeAlternate={localeToggle(locale, `/doctors-in-${encodeURIComponent(district.toLowerCase())}`)}
      />
    </>
  );
}
