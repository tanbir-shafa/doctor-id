import type { Metadata } from "next";
import { buildIntentMetadata, IntentPageView } from "@/components/search/intent-page";

export const revalidate = 60;

type Params = Promise<{ slug: string; district: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SP }): Promise<Metadata> {
  const { slug, district } = await params;
  const sp = await searchParams;
  return buildIntentMetadata({ intent: "female", specialtySlug: slug, district, page: sp.page ? Number(sp.page) : 1, locale: "bn" });
}

export default async function BnFemaleSpecialtyDistrictPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { slug, district } = await params;
  return (
    <IntentPageView intent="female" specialtySlug={slug} district={district} searchParams={await searchParams} locale="bn" />
  );
}
