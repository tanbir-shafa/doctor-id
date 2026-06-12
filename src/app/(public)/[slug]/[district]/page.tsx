import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dbConnect } from "@/lib/db/mongoose";
import { Specialty } from "@/lib/db/models";
import { searchDoctors, listDistricts } from "@/lib/db/queries/doctors";
import { SpecialtyListing } from "@/components/search/specialty-listing";
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

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, district } = await params;
  const specialty = await loadSpecialty(slug);
  if (!specialty) return { title: "Not found" };
  const districtLabel = decodeURIComponent(district).replace(/\b\w/g, (c) => c.toUpperCase());
  const title = `${specialty.name} doctors in ${districtLabel}`;
  return {
    title,
    description: `Verified ${specialty.name.toLowerCase()} doctors in ${districtLabel}. Chambers, schedules, contact details — all on Daktar.Link.`,
    alternates: { canonical: `${publicEnv.NEXT_PUBLIC_APP_URL}/${slug}/${district}` },
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
  const page = sp.page ? Number(sp.page) : 1;
  const [{ doctors, total, totalPages }, districts] = await Promise.all([
    searchDoctors({ specialty: specialty.name, district: decodedDistrict, page }),
    listDistricts(),
  ]);

  return (
    <SpecialtyListing
      specialtyName={specialty.name}
      district={decodedDistrict.replace(/\b\w/g, (c) => c.toUpperCase())}
      doctors={doctors}
      total={total}
      page={page}
      totalPages={totalPages}
      districts={districts}
      searchParams={sp}
    />
  );
}
