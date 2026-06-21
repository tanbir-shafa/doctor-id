import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  parseDistrictHubSlug,
  buildSpecialtyHubMetadata,
  SpecialtyHubView,
  buildDistrictHubMetadata,
  DistrictHubView,
} from "@/components/search/hub-views";
import { findSpecialtyBySlug } from "@/lib/db/queries/doctors";

// Bangla (bn) mirror of the polymorphic `/[slug]` hub dispatch: specialty hub →
// district hub → (doctor profiles aren't localized in v1, so fall through to the
// English profile). Reuses the shared locale-aware views with locale="bn".
export const revalidate = 60;
export const dynamicParams = true;

type Params = Promise<{ slug: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}): Promise<Metadata> {
  const { slug } = await params;
  const specialty = await findSpecialtyBySlug(slug);
  if (specialty) {
    const sp = await searchParams;
    return buildSpecialtyHubMetadata({ locale: "bn", specialty, page: sp.page ? Number(sp.page) : 1 });
  }
  const district = parseDistrictHubSlug(slug);
  if (district) {
    const sp = await searchParams;
    return buildDistrictHubMetadata({ locale: "bn", district, page: sp.page ? Number(sp.page) : 1 });
  }
  return {};
}

export default async function BnSlugPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}) {
  const { slug } = await params;
  const specialty = await findSpecialtyBySlug(slug);
  if (specialty) {
    return <SpecialtyHubView locale="bn" specialty={specialty} searchParams={await searchParams} />;
  }
  const district = parseDistrictHubSlug(slug);
  if (district) {
    return <DistrictHubView locale="bn" district={district} searchParams={await searchParams} />;
  }
  // Doctor profiles are English-only in v1 — send /bn/<doctor-or-unknown> to the
  // English profile route (which renders it or 404s).
  redirect(`/${slug}`);
}
