import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dbConnect } from "@/lib/db/mongoose";
import { Specialty } from "@/lib/db/models";
import {
  searchDoctors,
  listDistricts,
  countDoctorsInCombo,
  MIN_INDEXABLE_COMBO_DOCTORS,
} from "@/lib/db/queries/doctors";
import { SpecialtyListing } from "@/components/search/specialty-listing";
import { buildBreadcrumbJsonLd, pruneJsonLd } from "@/lib/seo/jsonld";
import { publicEnv } from "@/lib/env";

export const revalidate = 60;

// `slug` here is the specialty slug; `district` is the lowercase district name.
type Params = Promise<{ slug: string; district: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

async function loadSpecialty(slug: string) {
  await dbConnect();
  return (
    ((await (Specialty as unknown as Loose)
      .findOne({ slug: slug.toLowerCase(), active: true })
      .select("name")
      .lean()) as { name: string } | null) ?? null
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}): Promise<Metadata> {
  const { slug, district } = await params;
  const specialty = await loadSpecialty(slug);
  if (!specialty) return { title: "Not found" };

  const decoded = decodeURIComponent(district);
  const districtLabel = decoded.replace(/\b\w/g, (c) => c.toUpperCase());
  const title = `${specialty.name} doctors in ${districtLabel}`;

  const sp = await searchParams;
  const page = sp.page ? Number(sp.page) : 1;
  const count = await countDoctorsInCombo(specialty.name, decoded);

  // Self-referencing canonical that keeps the page param, so page 2+ don't
  // collapse into page 1 (which would hide deep doctors). Empty combos are
  // noindexed (still follow) so they never become soft-404s in the index.
  const base = `${publicEnv.NEXT_PUBLIC_APP_URL}/${slug}/${district}`;
  return {
    title,
    description: `Verified ${specialty.name.toLowerCase()} doctors in ${districtLabel}. Chambers, schedules, contact details — all on Daktar.Link.`,
    alternates: { canonical: page > 1 ? `${base}?page=${page}` : base },
    robots: { index: count >= MIN_INDEXABLE_COMBO_DOCTORS, follow: true },
  };
}

export default async function SpecialtyDistrictPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}) {
  const { slug, district } = await params;
  const sp = await searchParams;

  const specialty = await loadSpecialty(slug);
  if (!specialty) notFound();

  const decodedDistrict = decodeURIComponent(district);
  const districtLabel = decodedDistrict.replace(/\b\w/g, (c) => c.toUpperCase());
  const page = sp.page ? Number(sp.page) : 1;
  const [{ doctors, total, totalPages }, districts] = await Promise.all([
    searchDoctors({ specialty: specialty.name, district: decodedDistrict, page }),
    listDistricts(),
  ]);

  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const breadcrumbLd = pruneJsonLd(
    buildBreadcrumbJsonLd([
      { name: "Home", url: `${base}/` },
      { name: `${specialty.name} doctors`, url: `${base}/${slug}` },
      { name: districtLabel, url: `${base}/${slug}/${district}` },
    ]),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <SpecialtyListing
        specialtyName={specialty.name}
        specialtySlug={slug}
        district={districtLabel}
        doctors={doctors}
        total={total}
        page={page}
        totalPages={totalPages}
        districts={districts}
        searchParams={sp}
      />
    </>
  );
}
