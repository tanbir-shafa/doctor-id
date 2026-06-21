import type { Metadata } from "next";
import { buildIntentMetadata, IntentPageView } from "@/components/search/intent-page";

export const revalidate = 60;

type Params = Promise<{ slug: string }>;
type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SP }): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  return buildIntentMetadata({ intent: "female", specialtySlug: slug, page: sp.page ? Number(sp.page) : 1, locale: "bn" });
}

export default async function BnFemaleSpecialtyPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { slug } = await params;
  return <IntentPageView intent="female" specialtySlug={slug} searchParams={await searchParams} locale="bn" />;
}
