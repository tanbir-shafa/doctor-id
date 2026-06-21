import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPublishedArticleBySlug } from "@/lib/db/queries/articles";
import { findSpecialtySlugByName } from "@/lib/db/queries/doctors";
import { renderBioMarkdown } from "@/lib/utils/sanitize";
import { buildArticleJsonLd, buildBreadcrumbJsonLd, pruneJsonLd } from "@/lib/seo/jsonld";
import { hreflangAlternates } from "@/lib/i18n/config";
import { publicEnv } from "@/lib/env";

export const revalidate = 300;
export const dynamicParams = true;

const BASE = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = await getPublishedArticleBySlug(slug);
  if (!a || !a.bodyBn || !a.bodyBn.trim()) return { title: "Not found" };
  return {
    title: a.titleBn || a.title,
    description: a.excerptBn || a.excerpt || undefined,
    alternates: {
      canonical: `${BASE}/bn/guides/${a.slug}`,
      languages: hreflangAlternates(`/guides/${a.slug}`),
    },
  };
}

export default async function BnGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await getPublishedArticleBySlug(slug);
  if (!a) notFound();
  // No Bangla version → send to the English guide rather than a thin/empty page.
  if (!a.bodyBn || !a.bodyBn.trim()) redirect(`/guides/${a.slug}`);

  const title = a.titleBn || a.title;
  const html = renderBioMarkdown(a.bodyBn);

  // Internal links → the Bangla specialty hubs, to keep bn readers in bn.
  const related = (
    await Promise.all(
      (a.specialties ?? []).slice(0, 6).map(async (name) => {
        const sslug = await findSpecialtySlugByName(name);
        return sslug ? { name, href: `/bn/${sslug}` } : null;
      }),
    )
  ).filter(Boolean) as { name: string; href: string }[];

  const published = a.publishedAt ? new Date(a.publishedAt) : null;
  const articleLd = pruneJsonLd(
    buildArticleJsonLd({
      title,
      slug: a.slug,
      excerpt: a.excerptBn || a.excerpt,
      coverImageUrl: a.coverImageUrl,
      authorName: a.authorName,
      publishedAt: a.publishedAt,
      updatedAt: a.updatedAt,
      locale: "bn",
    }),
  );
  const breadcrumbLd = pruneJsonLd(
    buildBreadcrumbJsonLd([
      { name: "হোম", url: `${BASE}/` },
      { name: "স্বাস্থ্য গাইড", url: `${BASE}/bn/guides` },
      { name: title, url: `${BASE}/bn/guides/${a.slug}` },
    ]),
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/bn/guides" className="text-sm font-medium text-primary hover:underline">
            ← সব স্বাস্থ্য গাইড
          </Link>
          <Link
            href={`/guides/${a.slug}`}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
          >
            English
          </Link>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          লিখেছেন {a.authorName}
          {a.reviewerName ? ` · চিকিৎসা-পর্যালোচনা: ${a.reviewerName}` : ""}
          {published ? ` · ${published.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}
        </p>

        <div
          className="mt-6 leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-4 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {related.length > 0 ? (
          <aside className="mt-10 border-t border-border pt-6">
            <p className="mb-2 text-sm font-medium text-foreground">ডাক্তার খুঁজুন</p>
            <div className="flex flex-wrap gap-2">
              {related.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground hover:border-primary/40 hover:bg-accent"
                >
                  {r.name} ডাক্তার
                </Link>
              ))}
            </div>
          </aside>
        ) : null}

        <p className="mt-10 rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          এই গাইডটি সাধারণ স্বাস্থ্য তথ্য — কোনো পেশাদার চিকিৎসা পরামর্শ, রোগনির্ণয় বা চিকিৎসার বিকল্প নয়।
          আপনার নিজের অবস্থা সম্পর্কে সবসময় একজন যোগ্য ডাক্তারের পরামর্শ নিন।
        </p>
      </article>
    </>
  );
}
