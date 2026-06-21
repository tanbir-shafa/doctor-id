import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  buildSpecialtyDistrictMetadata,
  SpecialtyDistrictView,
} from "@/components/search/hub-views";
import { findSpecialtyBySlug } from "@/lib/db/queries/doctors";

// Bangla (bn) mirror of /[specialty]/[district].
export const revalidate = 60;

type Params = Promise<{ slug: string; district: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}): Promise<Metadata> {
  const { slug, district } = await params;
  const specialty = await findSpecialtyBySlug(slug);
  if (!specialty) return { title: "Not found" };
  const sp = await searchParams;
  return buildSpecialtyDistrictMetadata({
    locale: "bn",
    specialty,
    districtParam: district,
    page: sp.page ? Number(sp.page) : 1,
  });
}

export default async function BnSpecialtyDistrictPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}) {
  const { slug, district } = await params;
  const specialty = await findSpecialtyBySlug(slug);
  if (!specialty) notFound();
  return (
    <SpecialtyDistrictView
      locale="bn"
      specialty={specialty}
      districtParam={district}
      searchParams={await searchParams}
    />
  );
}
