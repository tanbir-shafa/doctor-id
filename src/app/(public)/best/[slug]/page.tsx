import type { Metadata } from "next";
import { buildIntentMetadata, IntentPageView } from "@/components/search/intent-page";

export const revalidate = 60;

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
  const sp = await searchParams;
  const page = sp.page ? Number(sp.page) : 1;
  return buildIntentMetadata({ intent: "best", specialtySlug: slug, page });
}

export default async function BestSpecialtyPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}) {
  const { slug } = await params;
  return <IntentPageView intent="best" specialtySlug={slug} searchParams={await searchParams} />;
}
