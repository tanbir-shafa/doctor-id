import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dbConnect } from "@/lib/db/mongoose";
import { Specialty } from "@/lib/db/models";
import { searchDoctors, listCities } from "@/lib/db/queries/doctors";
import { SpecialtyListing } from "@/components/search/specialty-listing";
import { publicEnv } from "@/lib/env";

export const revalidate = 60;

// `slug` here is the specialty slug; `city` is the lowercase city name.
type Params = Promise<{ slug: string; city: string }>;
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
  const { slug, city } = await params;
  const specialty = await loadSpecialty(slug);
  if (!specialty) return { title: "Not found" };
  const cityLabel = decodeURIComponent(city).replace(/\b\w/g, (c) => c.toUpperCase());
  const title = `${specialty.name} doctors in ${cityLabel}`;
  return {
    title,
    description: `Verified ${specialty.name.toLowerCase()} doctors in ${cityLabel}. Chambers, schedules, contact details — all on doctor.id.bd.`,
    alternates: { canonical: `${publicEnv.NEXT_PUBLIC_APP_URL}/${slug}/${city}` },
  };
}

export default async function SpecialtyCityPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}) {
  const { slug, city } = await params;
  const sp = await searchParams;

  const specialty = await loadSpecialty(slug);
  if (!specialty) notFound();

  const decodedCity = decodeURIComponent(city);
  const page = sp.page ? Number(sp.page) : 1;
  const [{ doctors, total, totalPages }, cities] = await Promise.all([
    searchDoctors({ specialty: specialty.name, city: decodedCity, page }),
    listCities(),
  ]);

  return (
    <SpecialtyListing
      specialtyName={specialty.name}
      city={decodedCity.replace(/\b\w/g, (c) => c.toUpperCase())}
      doctors={doctors}
      total={total}
      page={page}
      totalPages={totalPages}
      cities={cities}
      searchParams={sp}
    />
  );
}
